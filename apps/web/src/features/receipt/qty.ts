/**
 * Resolve base quantity (g / ml / each) for a matched receipt line.
 */

import type { Dimension } from '@larder/core';

import { seedForms } from './core-imports';
import type { NormalizedLineItem, PackageChoice, UnitHint } from './types';

const OZ_G = 28.349523125;
const LB_G = 453.59237;
const FL_OZ_ML = 29.5735295625;

export type QtyResolved = {
  readonly qtyBase: number;
  readonly dim: Dimension;
  readonly formId: string;
};

function unitToMassG(qty: number, unit: UnitHint): number | null {
  switch (unit) {
    case 'g':
      return qty;
    case 'kg':
      return qty * 1000;
    case 'oz':
      return qty * OZ_G;
    case 'lb':
      return qty * LB_G;
    default:
      return null;
  }
}

function unitToVolumeMl(qty: number, unit: UnitHint): number | null {
  switch (unit) {
    case 'ml':
      return qty;
    case 'l':
      return qty * 1000;
    case 'fl_oz':
      return qty * FL_OZ_ML;
    default:
      return null;
  }
}

/**
 * Prefer explicit mass/volume from the parse normalizer, then quantity×unit,
 * then selected package, then default form count=1.
 */
export function resolveLineQty(
  line: NormalizedLineItem,
  formId: string,
  selectedPackage?: PackageChoice | null,
): QtyResolved {
  const form = seedForms.find((f) => f.id === formId);
  const dim: Dimension = form?.dim ?? 'mass';

  if (line.massG != null && line.massG > 0) {
    return { qtyBase: line.massG, dim: 'mass', formId };
  }
  if (line.volumeMl != null && line.volumeMl > 0) {
    return { qtyBase: line.volumeMl, dim: 'volume', formId };
  }

  if (selectedPackage) {
    const count = line.quantity != null && line.quantity > 0 ? line.quantity : 1;
    if (dim === 'volume' && form?.densityGPerMl) {
      return {
        qtyBase: (selectedPackage.netG / form.densityGPerMl) * count,
        dim: 'volume',
        formId: selectedPackage.formId,
      };
    }
    if (dim === 'count') {
      return {
        qtyBase: count,
        dim: 'count',
        formId: selectedPackage.formId,
      };
    }
    return {
      qtyBase: selectedPackage.netG * count,
      dim: 'mass',
      formId: selectedPackage.formId,
    };
  }

  if (line.quantity != null && line.quantity > 0) {
    const mass = unitToMassG(line.quantity, line.unit);
    if (mass != null) return { qtyBase: mass, dim: 'mass', formId };
    const vol = unitToVolumeMl(line.quantity, line.unit);
    if (vol != null) return { qtyBase: vol, dim: 'volume', formId };
    if (line.unit === 'each' || line.unit === 'ct' || line.unit === 'pk') {
      return { qtyBase: line.quantity, dim: 'count', formId };
    }
  }

  // Default: one package / one unit of the form
  if (dim === 'count') {
    return { qtyBase: 1, dim: 'count', formId };
  }
  if (dim === 'volume') {
    return { qtyBase: form?.gramsPerCount ?? 1, dim: 'volume', formId };
  }
  // mass: prefer gramsPerCount when present
  if (form?.gramsPerCount) {
    return { qtyBase: form.gramsPerCount, dim: 'mass', formId };
  }
  return { qtyBase: 1, dim, formId };
}

/** Whether package size needs a user choice (multiple known packs, size unclear). */
export function needsSizeChoice(
  line: NormalizedLineItem,
  packages: readonly PackageChoice[],
): boolean {
  if (packages.length < 2) return false;
  // Already resolved mass / volume from OCR
  if (line.massG != null && line.massG > 0) return false;
  if (line.volumeMl != null && line.volumeMl > 0) return false;
  if (line.packageSize) {
    const norm = line.packageSize.toLowerCase().replace(/\s+/g, '');
    const hit = packages.some((p) => {
      const lab = p.label.toLowerCase().replace(/_/g, '');
      const disp = p.displayLabel.toLowerCase().replace(/\s+/g, '');
      return lab.includes(norm) || disp.includes(norm) || norm.includes(disp);
    });
    if (hit) return false;
  }
  return true;
}

export function matchPackageFromLine(
  line: NormalizedLineItem,
  packages: readonly PackageChoice[],
): PackageChoice | null {
  if (packages.length === 0) return null;
  if (packages.length === 1) return packages[0]!;
  if (line.packageSize) {
    const norm = line.packageSize.toLowerCase().replace(/\s+/g, '');
    const hit = packages.find((p) => {
      const lab = p.label.toLowerCase().replace(/_/g, '');
      const disp = p.displayLabel.toLowerCase().replace(/\s+/g, '');
      return lab.includes(norm) || disp.includes(norm) || norm.includes(disp);
    });
    if (hit) return hit;
  }
  if (line.massG != null && line.massG > 0) {
    // closest package by netG
    let best = packages[0]!;
    let bestDiff = Math.abs(best.netG - line.massG);
    for (const p of packages) {
      const d = Math.abs(p.netG - line.massG);
      if (d < bestDiff) {
        best = p;
        bestDiff = d;
      }
    }
    if (bestDiff / line.massG < 0.15) return best;
  }
  return null;
}
