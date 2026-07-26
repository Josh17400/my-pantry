/**
 * Drizzle-backed local port for sync.
 * Uses AppDatabase (same handle as DomainRepository) without modifying db/.
 */

import type { Dimension } from '@larder/core';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

import type { AppDatabase } from '../db/domain-repository';
import {
  appMeta,
  locations,
  pantryItems,
  pantryTxns,
  recipeLines,
  recipes,
  recipeSteps,
} from '../db/schema';
import type { SyncLocalPort } from './ports';
import type {
  LocalLocation,
  LocalPantryItem,
  LocalRecipe,
  LocalRecipeLine,
  LocalRecipeStep,
  LocalTxnRow,
} from './types';

function asDim(value: string): Dimension {
  if (value === 'mass' || value === 'volume' || value === 'count') return value;
  return 'mass';
}

function mapTxn(row: typeof pantryTxns.$inferSelect): LocalTxnRow {
  return {
    id: row.id,
    clientTxnId: row.clientTxnId,
    householdId: row.householdId,
    ingredientId: row.ingredientId,
    formId: row.formId,
    kind: row.kind as 'relative' | 'absolute',
    deltaBase: row.deltaBase ?? null,
    targetBase: row.targetBase ?? null,
    basisCursor: row.basisCursor ?? null,
    reason: row.reason,
    refId: row.refId ?? null,
    unitPrice: row.unitPrice ?? null,
    occurredAt: row.occurredAt,
    acceptedAt: row.acceptedAt ?? null,
    deviceId: row.deviceId,
    userId: row.userId,
  };
}

function mapItem(row: typeof pantryItems.$inferSelect): LocalPantryItem {
  return {
    householdId: row.householdId,
    ingredientId: row.ingredientId,
    formId: row.formId,
    locationId: row.locationId ?? null,
    qtyBase: row.qtyBase,
    dim: asDim(row.dim),
    parLevelBase: row.parLevelBase,
    lowThresholdPct: row.lowThresholdPct,
    lastVerifiedAt: row.lastVerifiedAt ?? null,
    unverifiedCookCount: row.unverifiedCookCount,
    openedAt: row.openedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    updatedAt: row.updatedAt,
    watermarkCursor: row.watermarkCursor ?? null,
    lastAbsoluteCursor: row.lastAbsoluteCursor ?? null,
    isNegative: Boolean(row.isNegative),
    conflict: Boolean(row.conflict),
  };
}

function mapLocation(row: typeof locations.$inferSelect): LocalLocation {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    icon: row.icon,
    tint: row.tint,
    parentId: row.parentId ?? null,
    sortOrder: row.sortOrder,
  };
}

function mapRecipe(row: typeof recipes.$inferSelect): LocalRecipe {
  return {
    id: row.id,
    householdId: row.householdId ?? null,
    title: row.title,
    servings: row.servings,
    yieldNote: row.yieldNote ?? null,
    prepMin: row.prepMin ?? null,
    cookMin: row.cookMin ?? null,
    authorId: row.authorId ?? null,
    visibility: row.visibility,
    forkedFrom: row.forkedFrom ?? null,
    tags: row.tags ?? null,
    imageUrl: row.imageUrl ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLine(row: typeof recipeLines.$inferSelect): LocalRecipeLine {
  return {
    id: row.id,
    recipeId: row.recipeId,
    sortOrder: row.sortOrder,
    ingredientId: row.ingredientId ?? null,
    formId: row.formId ?? null,
    rawText: row.rawText,
    qty: row.qty ?? null,
    unit: row.unit ?? null,
    optional: Boolean(row.optional),
    groupId: row.groupId ?? null,
    substitutes: row.substitutes ?? null,
    unknownAllergens: Boolean(row.unknownAllergens),
    nonQuantified: Boolean(row.nonQuantified),
    qtyHigh: row.qtyHigh ?? null,
    qtyLow: row.qtyLow ?? null,
    isRange: Boolean(row.isRange),
  };
}

function mapStep(row: typeof recipeSteps.$inferSelect): LocalRecipeStep {
  return {
    id: row.id,
    recipeId: row.recipeId,
    sortOrder: row.sortOrder,
    text: row.text,
    durationSec: row.durationSec ?? null,
    timerLabel: row.timerLabel ?? null,
  };
}

export function createDrizzleLocalPort(db: AppDatabase): SyncLocalPort {
  return {
    async getMeta(key) {
      const rows = await db
        .select()
        .from(appMeta)
        .where(eq(appMeta.key, key))
        .limit(1);
      return rows[0]?.value ?? null;
    },

    async setMeta(key, value) {
      await db
        .insert(appMeta)
        .values({ key, value })
        .onConflictDoUpdate({
          target: appMeta.key,
          set: { value },
        });
    },

    async listUnackedTxns(householdId) {
      const rows = await db
        .select()
        .from(pantryTxns)
        .where(
          and(
            eq(pantryTxns.householdId, householdId),
            isNull(pantryTxns.acceptedAt),
          ),
        )
        .orderBy(asc(pantryTxns.occurredAt));
      return rows.map(mapTxn);
    },

    async markTxnAccepted(householdId, clientTxnId, acceptedAt) {
      await db
        .update(pantryTxns)
        .set({ acceptedAt })
        .where(
          and(
            eq(pantryTxns.householdId, householdId),
            eq(pantryTxns.clientTxnId, clientTxnId),
          ),
        );
    },

    async getTxnByClientId(householdId, clientTxnId) {
      const rows = await db
        .select()
        .from(pantryTxns)
        .where(
          and(
            eq(pantryTxns.householdId, householdId),
            eq(pantryTxns.clientTxnId, clientTxnId),
          ),
        )
        .limit(1);
      return rows[0] ? mapTxn(rows[0]) : null;
    },

    async insertTxnIfAbsent(row) {
      try {
        await db.insert(pantryTxns).values({
          id: row.id,
          clientTxnId: row.clientTxnId,
          householdId: row.householdId,
          ingredientId: row.ingredientId,
          formId: row.formId,
          kind: row.kind,
          deltaBase: row.deltaBase,
          targetBase: row.targetBase,
          basisCursor: row.basisCursor,
          reason: row.reason,
          refId: row.refId,
          unitPrice: row.unitPrice,
          occurredAt: row.occurredAt,
          acceptedAt: row.acceptedAt,
          deviceId: row.deviceId,
          userId: row.userId,
        });
        return 'inserted';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          /unique|UNIQUE|constraint/i.test(message) ||
          message.includes('pantry_txn_household_client')
        ) {
          // If we already have it but without accepted_at, fill from remote.
          if (row.acceptedAt) {
            const existing = await this.getTxnByClientId(
              row.householdId,
              row.clientTxnId,
            );
            if (existing && !existing.acceptedAt) {
              await this.markTxnAccepted(
                row.householdId,
                row.clientTxnId,
                row.acceptedAt,
              );
            }
          }
          return 'exists';
        }
        throw err;
      }
    },

    async listTxnsForIngredient(householdId, ingredientId) {
      const rows = await db
        .select()
        .from(pantryTxns)
        .where(
          and(
            eq(pantryTxns.householdId, householdId),
            eq(pantryTxns.ingredientId, ingredientId),
          ),
        );
      return rows.map(mapTxn);
    },

    async getPantryItem(householdId, ingredientId, formId) {
      const rows = await db
        .select()
        .from(pantryItems)
        .where(
          and(
            eq(pantryItems.householdId, householdId),
            eq(pantryItems.ingredientId, ingredientId),
            eq(pantryItems.formId, formId),
          ),
        )
        .limit(1);
      return rows[0] ? mapItem(rows[0]) : null;
    },

    async upsertProjection(item) {
      await db
        .insert(pantryItems)
        .values({
          householdId: item.householdId,
          ingredientId: item.ingredientId,
          formId: item.formId,
          locationId: item.locationId,
          qtyBase: item.qtyBase,
          dim: item.dim,
          parLevelBase: item.parLevelBase,
          lowThresholdPct: item.lowThresholdPct,
          lastVerifiedAt: item.lastVerifiedAt,
          unverifiedCookCount: item.unverifiedCookCount,
          openedAt: item.openedAt,
          expiresAt: item.expiresAt,
          updatedAt: item.updatedAt,
          watermarkCursor: item.watermarkCursor,
          lastAbsoluteCursor: item.lastAbsoluteCursor,
          isNegative: item.isNegative,
          conflict: item.conflict,
        })
        .onConflictDoUpdate({
          target: [
            pantryItems.householdId,
            pantryItems.ingredientId,
            pantryItems.formId,
          ],
          set: {
            qtyBase: item.qtyBase,
            dim: item.dim,
            lastVerifiedAt: item.lastVerifiedAt,
            unverifiedCookCount: item.unverifiedCookCount,
            updatedAt: item.updatedAt,
            watermarkCursor: item.watermarkCursor,
            lastAbsoluteCursor: item.lastAbsoluteCursor,
            isNegative: item.isNegative,
            conflict: item.conflict,
            // Preserve location / par / expiry unless empty insert path.
            locationId: item.locationId,
            parLevelBase: item.parLevelBase,
            lowThresholdPct: item.lowThresholdPct,
            openedAt: item.openedAt,
            expiresAt: item.expiresAt,
          },
        });
    },

    async applyPantryMetadataLww(remote, opts) {
      const existing = await this.getPantryItem(
        remote.householdId,
        remote.ingredientId,
        remote.formId,
      );
      if (!existing) {
        await this.upsertProjection(remote);
        return 'inserted';
      }
      if (!opts.remoteWins) return 'kept_local';
      // LWW metadata only — keep local fold qty / watermarks.
      await db
        .update(pantryItems)
        .set({
          locationId: remote.locationId,
          parLevelBase: remote.parLevelBase,
          lowThresholdPct: remote.lowThresholdPct,
          openedAt: remote.openedAt,
          expiresAt: remote.expiresAt,
          updatedAt: remote.updatedAt,
        })
        .where(
          and(
            eq(pantryItems.householdId, remote.householdId),
            eq(pantryItems.ingredientId, remote.ingredientId),
            eq(pantryItems.formId, remote.formId),
          ),
        );
      return 'applied';
    },

    async listLocations(householdId) {
      const rows = await db
        .select()
        .from(locations)
        .where(eq(locations.householdId, householdId))
        .orderBy(asc(locations.sortOrder));
      return rows.map(mapLocation);
    },

    async upsertLocation(loc) {
      await db
        .insert(locations)
        .values({
          id: loc.id,
          householdId: loc.householdId,
          name: loc.name,
          icon: loc.icon,
          tint: loc.tint,
          parentId: loc.parentId,
          sortOrder: loc.sortOrder,
        })
        .onConflictDoUpdate({
          target: locations.id,
          set: {
            name: loc.name,
            icon: loc.icon,
            tint: loc.tint,
            parentId: loc.parentId,
            sortOrder: loc.sortOrder,
            householdId: loc.householdId,
          },
        });
    },

    async listRecipes(householdId) {
      const rows = await db
        .select()
        .from(recipes)
        .where(
          or(
            eq(recipes.householdId, householdId),
            sql`${recipes.householdId} IS NULL`,
          ),
        )
        .orderBy(asc(recipes.title));
      return rows.map(mapRecipe);
    },

    async getRecipeBundle(recipeId) {
      const recipeRows = await db
        .select()
        .from(recipes)
        .where(eq(recipes.id, recipeId))
        .limit(1);
      const r = recipeRows[0];
      if (!r) return null;
      const lines = await db
        .select()
        .from(recipeLines)
        .where(eq(recipeLines.recipeId, recipeId))
        .orderBy(asc(recipeLines.sortOrder));
      const steps = await db
        .select()
        .from(recipeSteps)
        .where(eq(recipeSteps.recipeId, recipeId))
        .orderBy(asc(recipeSteps.sortOrder));
      return {
        recipe: mapRecipe(r),
        lines: lines.map(mapLine),
        steps: steps.map(mapStep),
      };
    },

    async replaceRecipeBundle(bundle) {
      const { recipe, lines, steps } = bundle;
      await db
        .insert(recipes)
        .values({
          id: recipe.id,
          householdId: recipe.householdId,
          title: recipe.title,
          servings: recipe.servings,
          yieldNote: recipe.yieldNote,
          prepMin: recipe.prepMin,
          cookMin: recipe.cookMin,
          authorId: recipe.authorId,
          visibility: recipe.visibility,
          forkedFrom: recipe.forkedFrom,
          tags: recipe.tags,
          imageUrl: recipe.imageUrl,
          createdAt: recipe.createdAt,
          updatedAt: recipe.updatedAt,
        })
        .onConflictDoUpdate({
          target: recipes.id,
          set: {
            householdId: recipe.householdId,
            title: recipe.title,
            servings: recipe.servings,
            yieldNote: recipe.yieldNote,
            prepMin: recipe.prepMin,
            cookMin: recipe.cookMin,
            authorId: recipe.authorId,
            visibility: recipe.visibility,
            forkedFrom: recipe.forkedFrom,
            tags: recipe.tags,
            imageUrl: recipe.imageUrl,
            updatedAt: recipe.updatedAt,
          },
        });

      await db.delete(recipeLines).where(eq(recipeLines.recipeId, recipe.id));
      await db.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipe.id));

      if (lines.length > 0) {
        await db.insert(recipeLines).values(
          lines.map((line) => ({
            id: line.id,
            recipeId: line.recipeId,
            sortOrder: line.sortOrder,
            ingredientId: line.ingredientId,
            formId: line.formId,
            rawText: line.rawText,
            qty: line.qty,
            unit: line.unit,
            optional: line.optional,
            groupId: line.groupId,
            substitutes: line.substitutes,
            unknownAllergens: line.unknownAllergens,
            nonQuantified: line.nonQuantified,
            qtyHigh: line.qtyHigh,
            qtyLow: line.qtyLow,
            isRange: line.isRange,
          })),
        );
      }
      if (steps.length > 0) {
        await db.insert(recipeSteps).values(
          steps.map((step) => ({
            id: step.id,
            recipeId: step.recipeId,
            sortOrder: step.sortOrder,
            text: step.text,
            durationSec: step.durationSec,
            timerLabel: step.timerLabel,
          })),
        );
      }
    },

    async listAllRecipeIds(householdId) {
      const rows = await db
        .select({ id: recipes.id })
        .from(recipes)
        .where(
          or(
            eq(recipes.householdId, householdId),
            sql`${recipes.householdId} IS NULL`,
          ),
        );
      return rows.map((r) => r.id);
    },
  };
}
