/**
 * Oils & vinegars — densities from USDA oil cluster ~0.91–0.92 g/ml.
 */

import { mergeBundles, simpleVolume } from '../helpers';
import { KNOWN_DENSITIES } from '../sources';
import type { SeedCategoryBundle } from '../types';

const flOzG = (flOz: number, d: number) => flOz * 29.5735295625 * d;

export const oilsVinegars: SeedCategoryBundle = mergeBundles(
  simpleVolume('oil-olive', 'Olive oil', 'oils-vinegars', KNOWN_DENSITIES.olive_oil_g_per_ml, {
    uncertaintyPct: 5,
    isStaple: true,
    aliases: ['OLIVE OIL', 'EVOO', 'EXTRA VIRGIN OLIVE OIL', 'E.V.O.O.'],
    packages: [
      { label: 'bottle_16_9oz', netG: flOzG(16.9, KNOWN_DENSITIES.olive_oil_g_per_ml) },
      { label: 'bottle_25_4oz', netG: flOzG(25.4, KNOWN_DENSITIES.olive_oil_g_per_ml) },
      { label: 'bottle_51oz', netG: flOzG(51, KNOWN_DENSITIES.olive_oil_g_per_ml) },
    ],
  }),
  simpleVolume(
    'oil-vegetable',
    'Vegetable oil',
    'oils-vinegars',
    KNOWN_DENSITIES.vegetable_oil_g_per_ml,
    {
      uncertaintyPct: 5,
      isStaple: true,
      // Soybean oil is common; refined soy oil often exempt from labeling but
      // we tag soy conservatively for "vegetable oil" blends.
      allergens: ['soy'],
      aliases: ['VEGETABLE OIL', 'VEG OIL', 'SOYBEAN OIL'],
      packages: [
        { label: 'bottle_48oz', netG: flOzG(48, KNOWN_DENSITIES.vegetable_oil_g_per_ml) },
        { label: 'bottle_128oz', netG: flOzG(128, KNOWN_DENSITIES.vegetable_oil_g_per_ml) },
      ],
    },
  ),
  simpleVolume('oil-canola', 'Canola oil', 'oils-vinegars', 0.92, {
    uncertaintyPct: 5,
    isStaple: true,
    aliases: ['CANOLA OIL', 'CANOLA'],
    packages: [{ label: 'bottle_48oz', netG: flOzG(48, 0.92) }],
  }),
  simpleVolume('oil-avocado', 'Avocado oil', 'oils-vinegars', 0.91, {
    uncertaintyPct: 8,
    aliases: ['AVOCADO OIL'],
    packages: [{ label: 'bottle_16_9oz', netG: flOzG(16.9, 0.91) }],
  }),
  simpleVolume('oil-sesame', 'Sesame oil', 'oils-vinegars', 0.92, {
    uncertaintyPct: 8,
    allergens: ['sesame'],
    aliases: ['SESAME OIL', 'TOASTED SESAME OIL'],
    packages: [{ label: 'bottle_5oz', netG: flOzG(5, 0.92) }],
  }),
  simpleVolume('oil-coconut', 'Coconut oil', 'oils-vinegars', 0.92, {
    uncertaintyPct: 8,
    allergens: ['tree_nut'],
    aliases: ['COCONUT OIL'],
    packages: [{ label: 'jar_14oz', netG: 14 * 28.349523125 }],
  }),
  simpleVolume('oil-peanut', 'Peanut oil', 'oils-vinegars', 0.91, {
    uncertaintyPct: 8,
    allergens: ['peanut'],
    aliases: ['PEANUT OIL'],
    packages: [{ label: 'bottle_24oz', netG: flOzG(24, 0.91) }],
  }),
  simpleVolume('oil-spray', 'Cooking spray', 'oils-vinegars', 0.92, {
    uncertaintyPct: 25,
    // Often soy lecithin
    allergens: ['soy'],
    aliases: ['COOKING SPRAY', 'PAM', 'OLIVE OIL SPRAY'],
    packages: [{ label: 'can_6oz', netG: 6 * 28.349523125 }],
  }),
  simpleVolume('vinegar-white', 'White vinegar', 'oils-vinegars', 1.01, {
    uncertaintyPct: 3,
    isStaple: true,
    aliases: ['WHITE VINEGAR', 'DISTILLED VINEGAR', 'VINEGAR'],
    packages: [
      { label: 'bottle_32oz', netG: flOzG(32, 1.01) },
      { label: 'bottle_128oz', netG: flOzG(128, 1.01) },
    ],
  }),
  simpleVolume('vinegar-apple-cider', 'Apple cider vinegar', 'oils-vinegars', 1.01, {
    uncertaintyPct: 5,
    isStaple: true,
    aliases: ['APPLE CIDER VINEGAR', 'ACV', 'CIDER VINEGAR'],
    packages: [{ label: 'bottle_32oz', netG: flOzG(32, 1.01) }],
  }),
  simpleVolume('vinegar-balsamic', 'Balsamic vinegar', 'oils-vinegars', 1.08, {
    uncertaintyPct: 10,
    aliases: ['BALSAMIC', 'BALSAMIC VINEGAR'],
    packages: [{ label: 'bottle_16_9oz', netG: flOzG(16.9, 1.08) }],
  }),
  simpleVolume('vinegar-red-wine', 'Red wine vinegar', 'oils-vinegars', 1.01, {
    uncertaintyPct: 5,
    aliases: ['RED WINE VINEGAR'],
    packages: [{ label: 'bottle_16oz', netG: flOzG(16, 1.01) }],
  }),
  simpleVolume('vinegar-white-wine', 'White wine vinegar', 'oils-vinegars', 1.01, {
    uncertaintyPct: 5,
    aliases: ['WHITE WINE VINEGAR'],
    packages: [{ label: 'bottle_16oz', netG: flOzG(16, 1.01) }],
  }),
);
