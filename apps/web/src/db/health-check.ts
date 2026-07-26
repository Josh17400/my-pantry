import { platformName } from '../lib/platform';
import type { HealthRunResult, HealthStepResult, PantryRepository } from './repository';

const ROW_COUNT = 1000;

async function timedStep(
  step: HealthStepResult['step'],
  fn: () => Promise<string>,
): Promise<HealthStepResult> {
  const start = performance.now();
  try {
    const detail = await fn();
    return { step, ok: true, ms: performance.now() - start, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { step, ok: false, ms: performance.now() - start, detail: message };
  }
}

/**
 * Runs the 7-step DB self-test against a PantryRepository.
 * Intended for native only. Web UI must not call this to fake a pass.
 */
export async function runHealthCheck(repo: PantryRepository): Promise<HealthRunResult> {
  const steps: HealthStepResult[] = [];
  let expectedChecksum = 0;

  // 1. open/create
  steps.push(
    await timedStep('open', async () => {
      await repo.open();
      return `opened via ${repo.driverName}`;
    }),
  );
  if (!steps[steps.length - 1]!.ok) {
    return finish(steps, repo);
  }

  // 2. migrate
  steps.push(
    await timedStep('migrate', async () => {
      await repo.migrate();
      return 'applied drizzle migrations (health probe + product schema)';
    }),
  );
  if (!steps[steps.length - 1]!.ok) {
    await safeClose(repo);
    return finish(steps, repo);
  }

  // 3. insert 1000 rows in a transaction
  steps.push(
    await timedStep('insert', async () => {
      const result = await repo.insertBatch(ROW_COUNT);
      expectedChecksum = result.checksum;
      return `inserted ${result.inserted} rows in ${result.ms.toFixed(1)}ms (tx), checksum=${result.checksum}`;
    }),
  );
  if (!steps[steps.length - 1]!.ok) {
    await safeCleanup(repo);
    return finish(steps, repo);
  }

  // 4. read back + verify count and checksum
  steps.push(
    await timedStep('read_verify', async () => {
      const result = await repo.verify(ROW_COUNT, expectedChecksum);
      if (!result.ok) {
        throw new Error(
          `count ${result.count}/${result.expectedCount}, checksum ${result.checksum}/${result.expectedChecksum}`,
        );
      }
      return `count=${result.count}, checksum=${result.checksum}`;
    }),
  );
  if (!steps[steps.length - 1]!.ok) {
    await safeCleanup(repo);
    return finish(steps, repo);
  }

  // 5. indexed aggregate
  steps.push(
    await timedStep('aggregate', async () => {
      const result = await repo.aggregateIndexed();
      const expectedSum = ((ROW_COUNT - 1) * ROW_COUNT) / 2;
      if (result.count !== ROW_COUNT || result.sum !== expectedSum) {
        throw new Error(
          `count=${result.count} sum=${result.sum} (expected count=${ROW_COUNT} sum=${expectedSum})`,
        );
      }
      return `count=${result.count}, sum=${result.sum}, query ${result.ms.toFixed(1)}ms`;
    }),
  );
  if (!steps[steps.length - 1]!.ok) {
    await safeCleanup(repo);
    return finish(steps, repo);
  }

  // 6. close + reopen + verify persistence
  steps.push(
    await timedStep('persist', async () => {
      const result = await repo.closeReopenAndVerify(ROW_COUNT, expectedChecksum);
      if (!result.ok) {
        throw new Error(
          `after reopen: count ${result.count}/${result.expectedCount}, checksum ${result.checksum}/${result.expectedChecksum}`,
        );
      }
      return `persisted across close/reopen: count=${result.count}, checksum=${result.checksum}`;
    }),
  );
  if (!steps[steps.length - 1]!.ok) {
    await safeCleanup(repo);
    return finish(steps, repo);
  }

  // 7. delete test table
  steps.push(
    await timedStep('cleanup', async () => {
      await repo.cleanup();
      await repo.close();
      return 'dropped m0_health_probe, closed db';
    }),
  );

  return finish(steps, repo);
}

function finish(steps: HealthStepResult[], repo: PantryRepository): HealthRunResult {
  return {
    steps,
    allPassed: steps.length === 7 && steps.every((s) => s.ok),
    platform: platformName(),
    driver: repo.driverName,
  };
}

async function safeClose(repo: PantryRepository): Promise<void> {
  try {
    await repo.close();
  } catch {
    // ignore
  }
}

async function safeCleanup(repo: PantryRepository): Promise<void> {
  try {
    await repo.cleanup();
  } catch {
    // ignore
  }
  await safeClose(repo);
}
