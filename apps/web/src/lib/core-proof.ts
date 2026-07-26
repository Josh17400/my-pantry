/**
 * Live proof that @larder/core is wired into the web shell.
 * Uses public barrel exports only — packages/core is not modified.
 */

import { convert, coreHealth } from '@larder/core';

export type CoreWiringProof = {
  packageOk: boolean;
  packageName: string;
  /** e.g. "2 cup → 473.176 ml" */
  conversionLine: string;
  conversionOk: boolean;
};

export function getCoreWiringProof(): CoreWiringProof {
  const health = coreHealth();
  const result = convert({ value: 2, fromUnit: 'cup', toUnit: 'ml' });

  if (result.ok) {
    // Keep a readable fixed precision for the shell banner.
    const qty = Number(result.value.toFixed(3));
    return {
      packageOk: health.ok,
      packageName: health.package,
      conversionLine: `2 cup → ${qty} ml`,
      conversionOk: true,
    };
  }

  return {
    packageOk: health.ok,
    packageName: health.package,
    conversionLine: `convert failed: ${result.reason}`,
    conversionOk: false,
  };
}
