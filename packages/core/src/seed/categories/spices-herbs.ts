/**
 * Dried spices & herbs — jar sizes ~0.5–2.5 oz typical US retail.
 * Densities for ground spices are approximate (culinary); high uncertainty
 * for fluffy dried leaves.
 */

import type { SeedCategoryBundle } from '../types';
import { mergeBundles, simpleMass } from '../helpers';
import { KNOWN_DENSITIES, OZ_G } from '../sources';

const jar = (oz: number) => [{ label: `jar_${String(oz).replace('.', '_')}oz`, netG: oz * OZ_G }];

export const spicesHerbs: SeedCategoryBundle = mergeBundles(
  simpleMass('salt-table', 'Table salt', 'spices-herbs', {
    densityGPerMl: KNOWN_DENSITIES.table_salt_g_per_ml,
    uncertaintyPct: 5,
    isStaple: true,
    aliases: ['SALT', 'TABLE SALT', 'IODIZED SALT'],
    packages: [{ label: 'canister_26oz', netG: 26 * OZ_G }],
  }),
  simpleMass('salt-kosher', 'Kosher salt', 'spices-herbs', {
    densityGPerMl: KNOWN_DENSITIES.kosher_salt_diamond_g_per_ml,
    uncertaintyPct: 20, // Diamond vs Morton crystal size differs a lot
    isStaple: true,
    aliases: ['KOSHER SALT', 'COARSE SALT'],
    packages: [{ label: 'box_3lb', netG: 3 * 453.59237 }],
  }),
  simpleMass('salt-sea', 'Sea salt', 'spices-herbs', {
    densityGPerMl: 1.2,
    uncertaintyPct: 15,
    aliases: ['SEA SALT', 'FINE SEA SALT'],
    packages: jar(2.2),
  }),
  simpleMass('pepper-black', 'Black pepper', 'spices-herbs', {
    // Ground black pepper ~2.1 g/tsp → ~0.43 g/ml
    densityGPerMl: 0.43,
    uncertaintyPct: 15,
    isStaple: true,
    aliases: ['BLACK PEPPER', 'PEPPER', 'GROUND BLACK PEPPER', 'PEPPER GROUND'],
    packages: jar(2.5),
  }),
  simpleMass('pepper-whole', 'Whole black peppercorns', 'spices-herbs', {
    densityGPerMl: 0.55,
    uncertaintyPct: 15,
    aliases: ['PEPPERCORNS', 'BLACK PEPPERCORNS'],
    packages: jar(2.0),
  }),
  simpleMass('paprika', 'Paprika', 'spices-herbs', {
    densityGPerMl: 0.46,
    uncertaintyPct: 15,
    isStaple: true,
    aliases: ['PAPRIKA', 'SWEET PAPRIKA'],
    packages: jar(2.5),
  }),
  simpleMass('paprika-smoked', 'Smoked paprika', 'spices-herbs', {
    densityGPerMl: 0.46,
    uncertaintyPct: 15,
    aliases: ['SMOKED PAPRIKA', 'PIMENTON'],
    packages: jar(2.0),
  }),
  simpleMass('cayenne', 'Cayenne pepper', 'spices-herbs', {
    densityGPerMl: 0.37,
    uncertaintyPct: 15,
    aliases: ['CAYENNE', 'CAYENNE PEPPER'],
    packages: jar(1.7),
  }),
  simpleMass('chili-powder', 'Chili powder', 'spices-herbs', {
    densityGPerMl: 0.5,
    uncertaintyPct: 15,
    isStaple: true,
    aliases: ['CHILI POWDER', 'CHILLI POWDER'],
    packages: jar(2.5),
  }),
  simpleMass('cumin', 'Cumin (ground)', 'spices-herbs', {
    densityGPerMl: 0.4,
    uncertaintyPct: 15,
    isStaple: true,
    aliases: ['CUMIN', 'GROUND CUMIN', 'CUMIN POWDER'],
    packages: jar(2.0),
  }),
  simpleMass('cumin-seed', 'Cumin seed', 'spices-herbs', {
    densityGPerMl: 0.45,
    uncertaintyPct: 15,
    aliases: ['CUMIN SEED', 'CUMIN SEEDS'],
    packages: jar(1.5),
  }),
  simpleMass('coriander-ground', 'Coriander (ground)', 'spices-herbs', {
    densityGPerMl: 0.4,
    uncertaintyPct: 15,
    aliases: ['CORIANDER', 'GROUND CORIANDER', 'CORIANDER POWDER'],
    packages: jar(1.5),
  }),
  simpleMass('oregano-dried', 'Oregano (dried)', 'spices-herbs', {
    densityGPerMl: 0.2,
    uncertaintyPct: 25,
    isStaple: true,
    aliases: ['OREGANO', 'DRIED OREGANO'],
    packages: jar(0.75),
  }),
  simpleMass('basil-dried', 'Basil (dried)', 'spices-herbs', {
    densityGPerMl: 0.15,
    uncertaintyPct: 30,
    aliases: ['DRIED BASIL', 'BASIL DRIED'],
    packages: jar(0.6),
  }),
  simpleMass('thyme-dried', 'Thyme (dried)', 'spices-herbs', {
    densityGPerMl: 0.2,
    uncertaintyPct: 25,
    aliases: ['DRIED THYME', 'THYME DRIED'],
    packages: jar(0.75),
  }),
  simpleMass('rosemary-dried', 'Rosemary (dried)', 'spices-herbs', {
    densityGPerMl: 0.25,
    uncertaintyPct: 25,
    aliases: ['DRIED ROSEMARY', 'ROSEMARY DRIED'],
    packages: jar(0.85),
  }),
  simpleMass('parsley-dried', 'Parsley (dried)', 'spices-herbs', {
    densityGPerMl: 0.15,
    uncertaintyPct: 30,
    aliases: ['DRIED PARSLEY', 'PARSLEY FLAKES'],
    packages: jar(0.5),
  }),
  simpleMass('bay-leaf', 'Bay leaves', 'spices-herbs', {
    // count-ish but sold by mass jar
    densityGPerMl: 0.2,
    uncertaintyPct: 40,
    aliases: ['BAY LEAF', 'BAY LEAVES'],
    packages: jar(0.2),
  }),
  simpleMass('cinnamon-ground', 'Cinnamon (ground)', 'spices-herbs', {
    densityGPerMl: 0.5,
    uncertaintyPct: 12,
    isStaple: true,
    aliases: ['CINNAMON', 'GROUND CINNAMON', 'CINNAMON POWDER'],
    packages: jar(2.37),
  }),
  simpleMass('cinnamon-stick', 'Cinnamon sticks', 'spices-herbs', {
    aliases: ['CINNAMON STICK', 'CINNAMON STICKS', 'CINNAMON QUILL'],
    packages: jar(0.75),
  }),
  simpleMass('nutmeg', 'Nutmeg (ground)', 'spices-herbs', {
    densityGPerMl: 0.5,
    uncertaintyPct: 15,
    aliases: ['NUTMEG', 'GROUND NUTMEG'],
    packages: jar(1.1),
  }),
  simpleMass('ginger-ground', 'Ginger (ground)', 'spices-herbs', {
    densityGPerMl: 0.45,
    uncertaintyPct: 15,
    aliases: ['GROUND GINGER', 'GINGER POWDER'],
    packages: jar(1.5),
  }),
  simpleMass('garlic-powder', 'Garlic powder', 'spices-herbs', {
    densityGPerMl: 0.68,
    uncertaintyPct: 15,
    isStaple: true,
    aliases: ['GARLIC POWDER', 'GARLIC PWD'],
    packages: jar(3.12),
  }),
  simpleMass('onion-powder', 'Onion powder', 'spices-herbs', {
    densityGPerMl: 0.4,
    uncertaintyPct: 15,
    isStaple: true,
    aliases: ['ONION POWDER'],
    packages: jar(2.62),
  }),
  simpleMass('garlic-salt', 'Garlic salt', 'spices-herbs', {
    densityGPerMl: 1.0,
    uncertaintyPct: 12,
    aliases: ['GARLIC SALT'],
    packages: jar(3.25),
  }),
  simpleMass('italian-seasoning', 'Italian seasoning', 'spices-herbs', {
    densityGPerMl: 0.2,
    uncertaintyPct: 25,
    isStaple: true,
    aliases: ['ITALIAN SEASONING', 'ITALIAN HERBS'],
    packages: jar(0.75),
  }),
  simpleMass('taco-seasoning', 'Taco seasoning', 'spices-herbs', {
    densityGPerMl: 0.5,
    uncertaintyPct: 15,
    // Packets often contain soy / wheat
    allergens: ['soy', 'wheat'],
    aliases: ['TACO SEASONING', 'TACO SPICE'],
    packages: [
      { label: 'packet_1oz', netG: 1 * OZ_G },
      { label: 'jar_6oz', netG: 6 * OZ_G },
    ],
  }),
  simpleMass('curry-powder', 'Curry powder', 'spices-herbs', {
    densityGPerMl: 0.45,
    uncertaintyPct: 15,
    aliases: ['CURRY POWDER', 'CURRY'],
    packages: jar(2.0),
  }),
  simpleMass('turmeric', 'Turmeric (ground)', 'spices-herbs', {
    densityGPerMl: 0.5,
    uncertaintyPct: 15,
    aliases: ['TURMERIC', 'GROUND TURMERIC', 'TURMERIC POWDER'],
    packages: jar(2.0),
  }),
  simpleMass('smoked-chipotle', 'Chipotle powder', 'spices-herbs', {
    densityGPerMl: 0.4,
    uncertaintyPct: 15,
    aliases: ['CHIPOTLE', 'CHIPOTLE POWDER', 'GROUND CHIPOTLE'],
    packages: jar(2.0),
  }),
  simpleMass('red-pepper-flakes', 'Red pepper flakes', 'spices-herbs', {
    densityGPerMl: 0.3,
    uncertaintyPct: 20,
    isStaple: true,
    aliases: ['RED PEPPER FLAKES', 'CRUSHED RED PEPPER', 'CHILI FLAKES'],
    packages: jar(1.5),
  }),
  simpleMass('mustard-powder', 'Mustard powder', 'spices-herbs', {
    densityGPerMl: 0.4,
    uncertaintyPct: 15,
    aliases: ['MUSTARD POWDER', 'DRY MUSTARD', 'GROUND MUSTARD'],
    packages: jar(1.62),
  }),
  simpleMass('cloves-ground', 'Cloves (ground)', 'spices-herbs', {
    densityGPerMl: 0.4,
    uncertaintyPct: 15,
    aliases: ['GROUND CLOVES', 'CLOVES GROUND'],
    packages: jar(0.9),
  }),
  simpleMass('allspice', 'Allspice', 'spices-herbs', {
    densityGPerMl: 0.45,
    uncertaintyPct: 15,
    aliases: ['ALLSPICE', 'GROUND ALLSPICE'],
    packages: jar(1.5),
  }),
  simpleMass('cardamom', 'Cardamom (ground)', 'spices-herbs', {
    densityGPerMl: 0.4,
    uncertaintyPct: 15,
    aliases: ['CARDAMOM', 'GROUND CARDAMOM'],
    packages: jar(1.0),
  }),
  simpleMass('saffron', 'Saffron', 'spices-herbs', {
    // extremely light threads
    densityGPerMl: 0.15,
    uncertaintyPct: 40,
    aliases: ['SAFFRON', 'SAFFRON THREADS'],
    packages: [{ label: 'vial_0_06oz', netG: 0.06 * OZ_G }],
  }),
  simpleMass('vanilla-bean', 'Vanilla bean', 'spices-herbs', {
    aliases: ['VANILLA BEAN', 'VANILLA POD'],
    packages: [{ label: 'pack_2ct', netG: 6 }],
  }),
  simpleMass('sesame-seed', 'Sesame seeds', 'spices-herbs', {
    densityGPerMl: 0.65,
    uncertaintyPct: 12,
    allergens: ['sesame'],
    aliases: ['SESAME', 'SESAME SEEDS', 'SESAME SEED'],
    packages: jar(2.62),
  }),
  simpleMass('poppy-seed', 'Poppy seeds', 'spices-herbs', {
    densityGPerMl: 0.6,
    uncertaintyPct: 12,
    aliases: ['POPPY SEED', 'POPPY SEEDS'],
    packages: jar(2.1),
  }),
  simpleMass('everything-bagel-seasoning', 'Everything bagel seasoning', 'spices-herbs', {
    densityGPerMl: 0.5,
    uncertaintyPct: 20,
    allergens: ['sesame'],
    aliases: ['EVERYTHING BAGEL SEASONING', 'EVERYTHING SEASONING'],
    packages: jar(2.3),
  }),
  simpleMass('old-bay', 'Old Bay seasoning', 'spices-herbs', {
    densityGPerMl: 0.5,
    uncertaintyPct: 15,
    aliases: ['OLD BAY', 'OLD BAY SEASONING'],
    packages: jar(2.62),
  }),
  simpleMass('pumpkin-pie-spice', 'Pumpkin pie spice', 'spices-herbs', {
    densityGPerMl: 0.45,
    uncertaintyPct: 15,
    aliases: ['PUMPKIN PIE SPICE', 'PUMPKIN SPICE'],
    packages: jar(1.12),
  }),
  simpleMass('poultry-seasoning', 'Poultry seasoning', 'spices-herbs', {
    densityGPerMl: 0.25,
    uncertaintyPct: 20,
    aliases: ['POULTRY SEASONING'],
    packages: jar(1.25),
  }),
);
