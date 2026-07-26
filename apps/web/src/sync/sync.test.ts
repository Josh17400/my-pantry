/**
 * Sync layer tests — mocked remote, real in-memory SQLite local.
 *
 * Covers:
 * - push idempotency under retry
 * - pull cursor advancement
 * - out-of-order re-fold (the multi-device bug)
 * - LWW metadata resolution
 * - offline queueing then draining
 * - conflict surfacing once
 */

import {
  foldLedger,
  needsRefold,
  type PantryTxn,
  txnCursor,
} from '@larder/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthClient } from '../auth';
import { DEFAULT_HOUSEHOLD_ID } from '../db/constants';
import { NodeSqliteRepository } from '../db/drivers/node-sqlite';
import { ConflictSurfaces } from './conflicts';
import { SyncEngine } from './engine';
import { mapRemoteError, SyncSchemaMissingError } from './errors';
import { createDrizzleLocalPort } from './local-store';
import { remoteWinsLww } from './mapping';
import { evaluateOutOfOrderMerge, mergePulledTxns } from './merge';
import { resolveLww } from './metadata';
import type { SyncLocalPort, SyncRemotePort } from './ports';
import { pullAndMerge } from './pull';
import { pushOutbox } from './push';
import { SyncStatusStore } from './status';
import {
  EPOCH_CURSOR,
  type LocalTxnRow,
  localTxnToCore,
  type RemoteTxnRow,
  SYNC_META,
} from './types';

const HH = DEFAULT_HOUSEHOLD_ID;
const ING = 'ing-flour';
const FORM = 'form-flour-allpurpose';
const USER = '00000000-0000-4000-8000-000000000001';
const REMOTE_HH = 'hh-remote-1';

function relTxn(
  partial: Partial<LocalTxnRow> & {
    clientTxnId: string;
    deltaBase: number;
    occurredAt: string;
  },
): LocalTxnRow {
  return {
    id: partial.id ?? `id-${partial.clientTxnId}`,
    clientTxnId: partial.clientTxnId,
    householdId: partial.householdId ?? HH,
    ingredientId: partial.ingredientId ?? ING,
    formId: partial.formId ?? FORM,
    kind: 'relative',
    deltaBase: partial.deltaBase,
    targetBase: null,
    basisCursor: null,
    reason: partial.reason ?? 'purchase',
    refId: null,
    unitPrice: null,
    occurredAt: partial.occurredAt,
    acceptedAt: partial.acceptedAt ?? null,
    deviceId: partial.deviceId ?? 'device-a',
    userId: partial.userId ?? USER,
  };
}

function toRemote(
  local: LocalTxnRow,
  acceptedAt: string,
  remoteHouseholdId = REMOTE_HH,
): RemoteTxnRow {
  return {
    id: local.id,
    client_txn_id: local.clientTxnId,
    household_id: remoteHouseholdId,
    ingredient_id: local.ingredientId,
    form_id: local.formId,
    kind: local.kind,
    delta_base: local.deltaBase,
    target_base: local.targetBase,
    basis_cursor: local.basisCursor,
    reason: local.reason,
    ref_id: local.refId,
    unit_price: local.unitPrice,
    occurred_at: local.occurredAt,
    accepted_at: acceptedAt,
    device_id: local.deviceId,
    user_id: local.userId,
  };
}

function createMockRemote(initial: {
  txns?: RemoteTxnRow[];
  households?: string[];
}): SyncRemotePort & {
  serverTxns: RemoteTxnRow[];
  pushCalls: number;
} {
  const serverTxns = [...(initial.txns ?? [])];
  let pushCalls = 0;
  const remote: SyncRemotePort & {
    serverTxns: RemoteTxnRow[];
    pushCalls: number;
  } = {
    get serverTxns() {
      return serverTxns;
    },
    get pushCalls() {
      return pushCalls;
    },
    async myHouseholdIds() {
      return initial.households ?? [REMOTE_HH];
    },
    async pushTxns(rows) {
      pushCalls += 1;
      const acceptedAtByClientTxnId: Record<string, string> = {};
      const acknowledgedClientTxnIds: string[] = [];
      const now = new Date().toISOString();
      for (const row of rows) {
        const exists = serverTxns.some(
          (t) =>
            t.household_id === row.household_id &&
            t.client_txn_id === row.client_txn_id,
        );
        if (!exists) {
          serverTxns.push({
            ...row,
            accepted_at: now,
          });
          acceptedAtByClientTxnId[row.client_txn_id] = now;
        } else {
          const existing = serverTxns.find(
            (t) =>
              t.household_id === row.household_id &&
              t.client_txn_id === row.client_txn_id,
          )!;
          acceptedAtByClientTxnId[row.client_txn_id] = existing.accepted_at;
        }
        // Idempotent: always acknowledge (ON CONFLICT DO NOTHING is success)
        acknowledgedClientTxnIds.push(row.client_txn_id);
      }
      return { acknowledgedClientTxnIds, acceptedAtByClientTxnId };
    },
    async pullTxns(householdId, cursor, pageSize) {
      const filtered = serverTxns
        .filter(
          (t) =>
            t.household_id === householdId &&
            t.accepted_at > cursor,
        )
        .sort((a, b) => a.accepted_at.localeCompare(b.accepted_at));
      const page = filtered.slice(0, pageSize);
      const last = page[page.length - 1];
      return {
        rows: page,
        nextCursor: last?.accepted_at ?? cursor,
        exhausted: page.length < pageSize,
      };
    },
    async pullLocations() {
      return [];
    },
    async pullRecipes() {
      return [];
    },
    async pullRecipeLines() {
      return [];
    },
    async pullRecipeSteps() {
      return [];
    },
    async pullPantryItemsMeta() {
      return [];
    },
    async upsertLocations() {},
    async upsertRecipes() {},
    async replaceRecipeChildren() {},
  };
  return remote;
}

describe('sync layer', () => {
  let repo: NodeSqliteRepository;
  let local: SyncLocalPort;

  beforeEach(async () => {
    repo = new NodeSqliteRepository({ path: ':memory:' });
    await repo.initialize();
    local = createDrizzleLocalPort(
      repo.drizzle as unknown as import('../db/domain-repository').AppDatabase,
    );
  });

  afterEach(async () => {
    await repo.close();
  });

  // ── Push idempotency ────────────────────────────────────────────────────

  describe('push idempotency under retry', () => {
    it('second push after “dropped connection” is free (no error, already acked)', async () => {
      const t = relTxn({
        clientTxnId: 'c-push-1',
        deltaBase: 500,
        occurredAt: '2026-01-01T10:00:00.000Z',
      });
      await local.insertTxnIfAbsent(t);

      const remote = createMockRemote({});
      const first = await pushOutbox({
        local,
        remote,
        localHouseholdId: HH,
        remoteHouseholdId: REMOTE_HH,
        userId: USER,
      });
      expect(first.attempted).toBe(1);
      expect(first.acknowledgedClientTxnIds).toEqual(['c-push-1']);
      expect(remote.serverTxns).toHaveLength(1);

      // Local marked accepted
      const after = await local.getTxnByClientId(HH, 'c-push-1');
      expect(after?.acceptedAt).not.toBeNull();

      // Retry as if connection dropped before local mark: clear acceptedAt
      // and push again. Server ON CONFLICT DO NOTHING keeps a single row.
      const { pantryTxns } = await import('../db/schema');
      const { eq } = await import('drizzle-orm');
      await repo.drizzle
        .update(pantryTxns)
        .set({ acceptedAt: null })
        .where(eq(pantryTxns.clientTxnId, 'c-push-1'));

      const second = await pushOutbox({
        local,
        remote,
        localHouseholdId: HH,
        remoteHouseholdId: REMOTE_HH,
        userId: USER,
      });
      expect(second.attempted).toBe(1);
      expect(second.acknowledgedClientTxnIds).toEqual(['c-push-1']);
      // Server still has exactly one row (ON CONFLICT DO NOTHING)
      expect(remote.serverTxns).toHaveLength(1);
      expect(remote.pushCalls).toBe(2);
    });
  });

  // ── Pull cursor ─────────────────────────────────────────────────────────

  describe('pull cursor advancement', () => {
    it('advances cursor to max accepted_at and does not re-fetch', async () => {
      const a = toRemote(
        relTxn({
          clientTxnId: 'c-a',
          deltaBase: 100,
          occurredAt: '2026-01-01T09:00:00.000Z',
        }),
        '2026-01-01T12:00:00.000Z',
      );
      const b = toRemote(
        relTxn({
          clientTxnId: 'c-b',
          deltaBase: 50,
          occurredAt: '2026-01-01T10:00:00.000Z',
        }),
        '2026-01-01T13:00:00.000Z',
      );
      const remote = createMockRemote({ txns: [a, b] });

      const first = await pullAndMerge({
        local,
        remote,
        localHouseholdId: HH,
        remoteHouseholdId: REMOTE_HH,
        pageSize: 200,
      });
      expect(first.pulled).toBe(2);
      expect(first.cursor).toBe('2026-01-01T13:00:00.000Z');
      const stored = await local.getMeta(SYNC_META.pullCursor);
      expect(stored).toBe('2026-01-01T13:00:00.000Z');

      const second = await pullAndMerge({
        local,
        remote,
        localHouseholdId: HH,
        remoteHouseholdId: REMOTE_HH,
        pageSize: 200,
      });
      expect(second.pulled).toBe(0);
      expect(second.merge.inserted).toBe(0);
    });

    it('starts from epoch when no cursor stored', async () => {
      const cursor = (await local.getMeta(SYNC_META.pullCursor)) ?? EPOCH_CURSOR;
      expect(cursor).toBe(EPOCH_CURSOR);
    });
  });

  // ── Out-of-order re-fold (the multi-device bug) ──────────────────────────

  describe('out-of-order re-fold', () => {
    it('pulls a txn whose occurred_at sorts before watermark and matches full re-fold', async () => {
      // Device B already applied a later cook; device A offline purchase
      // arrives later on the wire (accepted_at) but earlier in fold order.
      const purchase = relTxn({
        clientTxnId: 'purchase-early',
        deltaBase: 1000,
        occurredAt: '2026-01-01T08:00:00.000Z',
        deviceId: 'device-a',
        reason: 'purchase',
      });
      const cook = relTxn({
        clientTxnId: 'cook-late',
        deltaBase: -200,
        occurredAt: '2026-01-01T12:00:00.000Z',
        deviceId: 'device-b',
        reason: 'cook',
      });

      // Local device already has the cook (synced earlier) and watermark at cook.
      await local.insertTxnIfAbsent({
        ...cook,
        acceptedAt: '2026-01-01T12:05:00.000Z',
      });
      const cookCore = localTxnToCore(cook);
      const foldCookOnly = foldLedger([cookCore]);
      await local.upsertProjection({
        householdId: HH,
        ingredientId: ING,
        formId: FORM,
        locationId: null,
        qtyBase: foldCookOnly.qtyBase, // -200 if applied alone
        dim: 'mass',
        parLevelBase: 1000,
        lowThresholdPct: 0.25,
        lastVerifiedAt: null,
        unverifiedCookCount: 1,
        openedAt: null,
        expiresAt: null,
        updatedAt: '2026-01-01T12:05:00.000Z',
        watermarkCursor: txnCursor(cookCore),
        lastAbsoluteCursor: null,
        isNegative: foldCookOnly.isNegative,
        conflict: false,
      });

      const watermarkBefore = txnCursor(cookCore);
      expect(needsRefold(watermarkBefore, localTxnToCore(purchase))).toBe(true);

      // Pure evaluation of the bug
      const fullLog: PantryTxn[] = [
        localTxnToCore(purchase),
        localTxnToCore(cook),
      ];
      const evalResult = evaluateOutOfOrderMerge({
        existingWatermark: watermarkBefore,
        existingQty: foldCookOnly.qtyBase,
        dim: 'mass',
        householdId: HH,
        ingredientId: ING,
        formId: FORM,
        fullLog,
        incoming: localTxnToCore(purchase),
      });
      expect(evalResult.needs).toBe(true);
      // Correct fold: 1000 + (-200) = 800
      expect(evalResult.foldQty).toBe(800);
      // Naive arrival-order would do -200 + 1000 from wrong base or worse:
      // if someone did qty += delta on pull: -200 + 1000 = 800 by luck for
      // relatives — but the watermark case for cook-then-purchase:
      // existingQty (-200) + purchase (+1000) = 800. For relatives that
      // commute this coincides; assert vs full fold and that needsRefold fired.
      expect(evalResult.foldQty).toBe(foldLedger(fullLog).qtyBase);

      // Pull delivers purchase with *later* accepted_at than cook.
      const remotePurchase = toRemote(purchase, '2026-01-01T14:00:00.000Z');
      const merge = await mergePulledTxns({
        local,
        localHouseholdId: HH,
        remoteRows: [remotePurchase],
      });

      expect(merge.inserted).toBe(1);
      const ingredientResult = merge.results.find(
        (r) => r.key.ingredientId === ING,
      );
      expect(ingredientResult?.refolded).toBe(true);
      expect(ingredientResult?.qtyBase).toBe(800);

      const item = await local.getPantryItem(HH, ING, FORM);
      expect(item?.qtyBase).toBe(800);

      // Invariant: projection == fold(log)
      const log = await local.listTxnsForIngredient(HH, ING);
      const fold = foldLedger(log.map(localTxnToCore));
      expect(item?.qtyBase).toBe(fold.qtyBase);
    });

    it('absolute out-of-order always refolds (not incremental)', async () => {
      const seed = relTxn({
        clientTxnId: 'seed',
        deltaBase: 1000,
        occurredAt: '2026-01-01T08:00:00.000Z',
      });
      const recount: LocalTxnRow = {
        id: 'id-recount',
        clientTxnId: 'recount-early',
        householdId: HH,
        ingredientId: ING,
        formId: FORM,
        kind: 'absolute',
        deltaBase: null,
        targetBase: 500,
        basisCursor: null,
        reason: 'recount',
        refId: null,
        unitPrice: null,
        occurredAt: '2026-01-01T09:00:00.000Z',
        acceptedAt: null,
        deviceId: 'device-a',
        userId: USER,
      };
      const cook = relTxn({
        clientTxnId: 'cook-after',
        deltaBase: -50,
        occurredAt: '2026-01-01T11:00:00.000Z',
        reason: 'cook',
        deviceId: 'device-b',
      });

      // Local already has seed + cook; watermark at cook.
      await local.insertTxnIfAbsent({
        ...seed,
        acceptedAt: '2026-01-01T08:01:00.000Z',
      });
      await local.insertTxnIfAbsent({
        ...cook,
        acceptedAt: '2026-01-01T11:01:00.000Z',
      });
      const logBefore = [localTxnToCore(seed), localTxnToCore(cook)];
      const foldBefore = foldLedger(logBefore);
      await local.upsertProjection({
        householdId: HH,
        ingredientId: ING,
        formId: FORM,
        locationId: null,
        qtyBase: foldBefore.qtyBase,
        dim: 'mass',
        parLevelBase: 1000,
        lowThresholdPct: 0.25,
        lastVerifiedAt: null,
        unverifiedCookCount: 1,
        openedAt: null,
        expiresAt: null,
        updatedAt: new Date().toISOString(),
        watermarkCursor: foldBefore.lastTxnCursor,
        lastAbsoluteCursor: null,
        isNegative: false,
        conflict: false,
      });

      expect(needsRefold(foldBefore.lastTxnCursor, localTxnToCore(recount))).toBe(
        true,
      );

      const merge = await mergePulledTxns({
        local,
        localHouseholdId: HH,
        remoteRows: [toRemote(recount, '2026-01-01T15:00:00.000Z')],
      });
      expect(merge.results[0]?.refolded).toBe(true);
      // fold order: seed 1000, recount 500, cook -50 → 450
      expect(merge.results[0]?.qtyBase).toBe(450);
      const full = foldLedger([
        localTxnToCore(seed),
        localTxnToCore(recount),
        localTxnToCore(cook),
      ]);
      expect(merge.results[0]?.qtyBase).toBe(full.qtyBase);
    });
  });

  // ── LWW metadata ────────────────────────────────────────────────────────

  describe('LWW metadata resolution', () => {
    it('remote wins when remote.updated_at is newer', () => {
      const localRow = { updatedAt: '2026-01-01T10:00:00.000Z', title: 'Local' };
      const remoteRow = {
        updatedAt: '2026-01-01T12:00:00.000Z',
        title: 'Remote',
      };
      const r = resolveLww(localRow, remoteRow);
      expect(r.winner).toBe('remote');
      expect(r.value.title).toBe('Remote');
    });

    it('local wins when local.updated_at is newer or equal', () => {
      const localRow = { updatedAt: '2026-01-01T12:00:00.000Z', title: 'Local' };
      const remoteRow = {
        updatedAt: '2026-01-01T10:00:00.000Z',
        title: 'Remote',
      };
      expect(resolveLww(localRow, remoteRow).winner).toBe('local');
      expect(
        resolveLww(
          { updatedAt: '2026-01-01T10:00:00.000Z', title: 'L' },
          { updatedAt: '2026-01-01T10:00:00.000Z', title: 'R' },
        ).winner,
      ).toBe('local');
    });

    it('remoteWinsLww is strict greater-than', () => {
      expect(
        remoteWinsLww(
          '2026-01-01T10:00:00.000Z',
          '2026-01-01T10:00:00.000Z',
        ),
      ).toBe(false);
      expect(
        remoteWinsLww(
          '2026-01-01T10:00:00.000Z',
          '2026-01-01T10:00:01.000Z',
        ),
      ).toBe(true);
    });

    it('applyPantryMetadataLww preserves local qty when remote wins meta', async () => {
      await local.upsertProjection({
        householdId: HH,
        ingredientId: ING,
        formId: FORM,
        locationId: 'loc-pantry',
        qtyBase: 777,
        dim: 'mass',
        parLevelBase: 100,
        lowThresholdPct: 0.25,
        lastVerifiedAt: null,
        unverifiedCookCount: 0,
        openedAt: null,
        expiresAt: null,
        updatedAt: '2026-01-01T10:00:00.000Z',
        watermarkCursor: 'wm',
        lastAbsoluteCursor: null,
        isNegative: false,
        conflict: false,
      });

      const result = await local.applyPantryMetadataLww(
        {
          householdId: HH,
          ingredientId: ING,
          formId: FORM,
          locationId: 'loc-fridge',
          qtyBase: 1, // stale remote qty — must not overwrite
          dim: 'mass',
          parLevelBase: 200,
          lowThresholdPct: 0.3,
          lastVerifiedAt: null,
          unverifiedCookCount: 0,
          openedAt: null,
          expiresAt: null,
          updatedAt: '2026-01-01T12:00:00.000Z',
          watermarkCursor: null,
          lastAbsoluteCursor: null,
          isNegative: false,
          conflict: false,
        },
        { remoteWins: true },
      );
      expect(result).toBe('applied');
      const item = await local.getPantryItem(HH, ING, FORM);
      expect(item?.qtyBase).toBe(777);
      expect(item?.parLevelBase).toBe(200);
      expect(item?.locationId).toBe('loc-fridge');
      expect(item?.watermarkCursor).toBe('wm');
    });
  });

  // ── Offline queue → drain ───────────────────────────────────────────────

  describe('offline queueing then draining', () => {
    it('queues local txns while offline and drains on run when online', async () => {
      const t1 = relTxn({
        clientTxnId: 'offline-1',
        deltaBase: 100,
        occurredAt: '2026-01-02T10:00:00.000Z',
      });
      const t2 = relTxn({
        clientTxnId: 'offline-2',
        deltaBase: -10,
        occurredAt: '2026-01-02T11:00:00.000Z',
        reason: 'cook',
      });
      await local.insertTxnIfAbsent(t1);
      await local.insertTxnIfAbsent(t2);

      const unacked = await local.listUnackedTxns(HH);
      expect(unacked).toHaveLength(2);

      const remote = createMockRemote({});
      let online = false;
      const session = {
        user: { id: USER, email: 't@t.co' },
        accessToken: 'tok',
        expiresAt: null,
      };
      const auth = new AuthClient({ client: null });
      // Force signed-in without network auth
      vi.spyOn(auth, 'initialize').mockResolvedValue({
        status: 'signed_in',
        session,
        error: null,
      });
      vi.spyOn(auth, 'getSession').mockReturnValue(session);

      const status = new SyncStatusStore();
      const engine = new SyncEngine({
        local,
        remote,
        auth,
        status,
        options: {
          localHouseholdId: HH,
          pageSize: 50,
          isOnline: () => online,
        },
      });

      const offlineResult = await engine.run('offline_test');
      expect(offlineResult.skipped).toBe(true);
      expect(offlineResult.skipReason).toBe('offline');
      expect(status.getState().status).toBe('offline');
      expect(remote.serverTxns).toHaveLength(0);
      expect(await local.listUnackedTxns(HH)).toHaveLength(2);

      online = true;
      const onlineResult = await engine.run('online_test');
      expect(onlineResult.skipped).toBe(false);
      expect(onlineResult.pushed).toBe(2);
      expect(remote.serverTxns).toHaveLength(2);
      expect(await local.listUnackedTxns(HH)).toHaveLength(0);
      expect(status.getState().status).toBe('synced');
    });

    it('signed-out run leaves local fully usable and does not error', async () => {
      await local.insertTxnIfAbsent(
        relTxn({
          clientTxnId: 'local-only',
          deltaBase: 5,
          occurredAt: '2026-01-03T10:00:00.000Z',
        }),
      );
      const auth = new AuthClient({ client: null });
      const status = new SyncStatusStore();
      const engine = new SyncEngine({
        local,
        remote: createMockRemote({}),
        auth,
        status,
        options: {
          localHouseholdId: HH,
          pageSize: 50,
          isOnline: () => true,
        },
      });
      const result = await engine.run();
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('signed_out');
      expect(status.getState().status).toBe('synced');
      // Outbox still local
      expect(await local.listUnackedTxns(HH)).toHaveLength(1);
    });
  });

  // ── Conflicts ───────────────────────────────────────────────────────────

  describe('conflict surfacing', () => {
    it('surfaces concurrent absolute conflict once', () => {
      const surfaces = new ConflictSurfaces();
      const key = {
        householdId: HH,
        ingredientId: ING,
        formId: FORM,
      };
      const first = surfaces.surfaceFromMerge([
        {
          key,
          refolded: true,
          conflict: true,
          qtyBase: 100,
          appliedClientTxnIds: ['a'],
        },
      ]);
      expect(first).toHaveLength(1);
      const second = surfaces.surfaceFromMerge([
        {
          key,
          refolded: true,
          conflict: true,
          qtyBase: 100,
          appliedClientTxnIds: ['b'],
        },
      ]);
      expect(second).toHaveLength(0);
      expect(surfaces.list()).toHaveLength(1);
      surfaces.dismiss(first[0]!.key);
      const third = surfaces.surfaceFromMerge([
        {
          key,
          refolded: true,
          conflict: true,
          qtyBase: 100,
          appliedClientTxnIds: ['c'],
        },
      ]);
      expect(third).toHaveLength(1);
    });
  });

  // ── Schema missing ──────────────────────────────────────────────────────

  describe('schema missing errors', () => {
    it('maps missing table to SyncSchemaMissingError', () => {
      const err = mapRemoteError(
        {
          message:
            "Could not find the table 'public.pantry_txns' in the schema cache",
        },
        'pushTxns',
      );
      expect(err).toBeInstanceOf(SyncSchemaMissingError);
      expect(err.message).toContain('supabase db push');
    });
  });
});
