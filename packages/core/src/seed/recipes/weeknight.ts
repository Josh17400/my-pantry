/**
 * Quick weeknight dinners — original prose for The Good Pantry starter catalog.
 */

import type { Recipe } from '../../recipes/types';
import { qty, recipe, step, taste } from './helpers';

export const weeknightRecipes: readonly Recipe[] = [
  recipe({
    id: 'recipe-black-bean-tacos',
    title: 'Black Bean Tacos',
    servings: 4,
    prepMin: 10,
    cookMin: 15,
    tags: ['dinner', 'weeknight', 'vegetarian', 'quick', 'under-30', 'mexican-ish'],
    ingredients: [
      qty('beans-black', 'beans-black-bulk', '2 cans black beans, drained and rinsed', 540, 'g'),
      qty('onion', 'onion-whole', '1/2 yellow onion, diced', 0.5, 'each'),
      qty('garlic', 'garlic-clove', '2 cloves garlic, minced', 2, 'each'),
      qty('cumin', 'cumin-bulk', '1 tsp ground cumin', 1, 'tsp'),
      qty('chili-powder', 'chili-powder-bulk', '1 tsp chili powder', 1, 'tsp'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('tortilla-corn', 'tortilla-corn-bulk', '8 corn tortillas', 190, 'g'),
      qty('salsa', 'salsa-bulk', '1/2 cup salsa', 120, 'g', { optional: true }),
      qty('cheddar', 'cheddar-shredded', '1 cup shredded cheddar', 1, 'cup', {
        optional: true,
      }),
      qty('avocado', 'avocado-bulk', '1 avocado, sliced', 150, 'g', { optional: true }),
      qty('lime', 'lime-each', '1 lime, cut into wedges', 1, 'each', { optional: true }),
      qty('cilantro', 'cilantro-bunch', 'handful of cilantro', 0.25, 'each', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
    ],
    steps: [
      step(
        'Warm the oil in a skillet over medium heat. Soften the onion 3–4 minutes, then add the garlic for 30 seconds.',
        240,
        'Soften onion',
      ),
      step(
        'Add the beans, cumin, chili powder, and a splash of water. Simmer, mashing some of the beans with a spoon, until thick and spoonable, about 8 minutes. Salt to taste.',
        480,
        'Simmer beans',
      ),
      step(
        'Warm the tortillas in a dry skillet or microwave under a damp towel.',
      ),
      step(
        'Fill tortillas with beans and top with cheese, salsa, avocado, cilantro, and a squeeze of lime.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-chicken-soy-skillet',
    title: 'Garlic Soy Chicken Skillet',
    servings: 4,
    prepMin: 10,
    cookMin: 18,
    tags: ['dinner', 'weeknight', 'quick', 'under-30', 'protein'],
    ingredients: [
      qty('chicken-breast', 'chicken-breast-bulk', '1 1/2 lb chicken breast, cut into strips', 680, 'g'),
      qty('soy-sauce', 'soy-sauce-liquid', '3 tbsp soy sauce', 3, 'tbsp'),
      qty('honey', 'honey-bulk', '1 tbsp honey', 21, 'g'),
      qty('garlic', 'garlic-clove', '4 cloves garlic, minced', 4, 'each'),
      qty('ginger-root', 'ginger-root-knob', '1 small knob ginger, grated (about 1 tsp)', 0.25, 'each'),
      qty('oil-vegetable', 'oil-vegetable-liquid', '2 tbsp oil', 2, 'tbsp'),
      qty('onion-green', 'onion-green-stalk', '3 green onions, sliced', 3, 'each'),
      qty('oil-sesame', 'oil-sesame-liquid', '1 tsp sesame oil', 1, 'tsp', {
        optional: true,
      }),
      qty('rice-white', 'rice-white-bulk', 'cooked rice, for serving', 300, 'g', {
        optional: true,
      }),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Pat the chicken dry. Stir soy sauce, honey, garlic, and ginger in a small bowl.',
      ),
      step(
        'Heat the oil in a large skillet over medium-high until shimmering. Add the chicken in a single layer and cook undisturbed 3 minutes, then stir and cook until just cooked through, 4–5 minutes more.',
        480,
        'Cook chicken',
      ),
      step(
        'Pour in the soy mixture and toss until glossy and clinging, about 1 minute. Finish with sesame oil and green onions. Serve over rice if you have it.',
        60,
        'Glaze',
      ),
    ],
  }),

  recipe({
    id: 'recipe-turkey-taco-skillet',
    title: 'Turkey Taco Skillet',
    servings: 4,
    prepMin: 10,
    cookMin: 20,
    tags: ['dinner', 'weeknight', 'quick', 'under-30', 'one-pan'],
    ingredients: [
      qty('ground-turkey', 'ground-turkey-bulk', '1 lb ground turkey', 454, 'g'),
      qty('onion', 'onion-whole', '1 yellow onion, diced', 1, 'each'),
      qty('bell-pepper-red', 'bell-pepper-red-bulk', '1 red bell pepper, diced', 150, 'g'),
      qty('taco-seasoning', 'taco-seasoning-bulk', '2 tbsp taco seasoning', 15, 'g'),
      qty('tomato-diced', 'tomato-diced-bulk', '1 can (14 oz) diced tomatoes', 400, 'g'),
      qty('beans-black', 'beans-black-bulk', '1 can black beans, drained', 270, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('cheddar', 'cheddar-shredded', '1 cup shredded cheddar', 1, 'cup', {
        optional: true,
      }),
      qty('tortilla-chips', 'tortilla-chips-bulk', 'tortilla chips for scooping', 100, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
    ],
    steps: [
      step(
        'Heat the oil in a large skillet over medium-high. Soften the onion and pepper 4 minutes.',
        240,
        'Soften veg',
      ),
      step(
        'Add the turkey and cook, breaking it up, until no pink remains, about 6 minutes.',
        360,
        'Brown turkey',
      ),
      step(
        'Stir in taco seasoning, diced tomatoes (with juices), and beans. Simmer until thickened, 8–10 minutes. Taste for salt.',
        540,
        'Simmer skillet',
      ),
      step(
        'Scatter cheddar on top if using and let it melt off heat. Serve with chips or in tortillas.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-garlic-butter-shrimp',
    title: 'Garlic Butter Shrimp',
    servings: 3,
    prepMin: 10,
    cookMin: 10,
    tags: ['dinner', 'weeknight', 'quick', 'under-30', 'seafood'],
    ingredients: [
      qty('shrimp', 'shrimp-bulk', '1 lb large shrimp, peeled and deveined', 454, 'g'),
      qty('butter', 'butter-tbsp', '3 tbsp butter', 3, 'tbsp'),
      qty('garlic', 'garlic-clove', '5 cloves garlic, minced', 5, 'each'),
      qty('lemon', 'lemon-each', '1 lemon', 1, 'each'),
      qty('parsley-fresh', 'parsley-fresh-bulk', '2 tbsp chopped parsley', 8, 'g', {
        optional: true,
      }),
      qty('red-pepper-flakes', 'red-pepper-flakes-bulk', 'pinch of red pepper flakes', 1, 'g', {
        optional: true,
      }),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp olive oil', 1, 'tbsp'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Pat the shrimp very dry and season lightly with salt and pepper.',
      ),
      step(
        'Heat the oil and 1 tbsp butter in a large skillet over medium-high. Add the shrimp in a single layer and cook 1–2 minutes per side until just opaque. Transfer to a plate.',
        180,
        'Sear shrimp',
      ),
      step(
        'Lower the heat to medium. Add the remaining butter, garlic, and pepper flakes. Cook 45–60 seconds until fragrant.',
        60,
        'Butter garlic',
      ),
      step(
        'Return the shrimp, squeeze in half the lemon, and toss. Finish with parsley and more lemon to taste. Serve with bread or rice.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-cheese-quesadillas',
    title: 'Crispy Cheese Quesadillas',
    servings: 4,
    prepMin: 5,
    cookMin: 15,
    tags: ['dinner', 'lunch', 'weeknight', 'quick', 'vegetarian', 'under-30', 'kid-friendly'],
    ingredients: [
      qty('tortilla-flour', 'tortilla-flour-bulk', '8 medium flour tortillas', 340, 'g'),
      qty('cheddar', 'cheddar-shredded', '2 cups shredded cheddar', 2, 'cup'),
      qty('mozzarella', 'mozzarella-bulk', '1 cup shredded mozzarella', 100, 'g', {
        optional: true,
      }),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil, for the pan', 1, 'tbsp'),
      qty('salsa', 'salsa-bulk', 'salsa for dipping', 120, 'g', { optional: true }),
      qty('sour-cream', 'sour-cream-liquid', 'sour cream for serving', 120, 'ml', {
        optional: true,
      }),
    ],
    steps: [
      step(
        'Scatter cheddar (and mozzarella if using) over half of each tortilla. Fold into half-moons and press lightly.',
      ),
      step(
        'Heat a thin film of oil in a skillet over medium heat. Cook quesadillas 2–3 minutes per side until the tortilla is browned and the cheese runs when pressed.',
        300,
        'Crisp quesadilla',
      ),
      step('Cut into wedges and serve with salsa and sour cream.'),
    ],
  }),

  recipe({
    id: 'recipe-egg-fried-rice',
    title: 'Better-Than-Takeout Egg Fried Rice',
    servings: 4,
    prepMin: 10,
    cookMin: 12,
    tags: ['dinner', 'weeknight', 'quick', 'under-30', 'vegetarian', 'pantry'],
    ingredients: [
      qty('rice-white', 'rice-white-bulk', '3 cups cold cooked rice', 450, 'g'),
      qty('egg', 'egg-whole', '3 large eggs', 3, 'each'),
      qty('frozen-peas', 'frozen-peas-bulk', '1 cup frozen peas', 140, 'g'),
      qty('carrot', 'carrot-bulk', '1 cup diced carrot', 120, 'g'),
      qty('onion-green', 'onion-green-stalk', '4 green onions, sliced', 4, 'each'),
      qty('garlic', 'garlic-clove', '2 cloves garlic, minced', 2, 'each'),
      qty('soy-sauce', 'soy-sauce-liquid', '3 tbsp soy sauce', 3, 'tbsp'),
      qty('oil-vegetable', 'oil-vegetable-liquid', '3 tbsp oil', 3, 'tbsp'),
      qty('oil-sesame', 'oil-sesame-liquid', '1 tsp sesame oil', 1, 'tsp', {
        optional: true,
      }),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Beat the eggs with a pinch of pepper. Heat 1 tbsp oil in a large skillet or wok over medium-high. Scramble the eggs softly, then scoop onto a plate.',
        90,
        'Scramble eggs',
      ),
      step(
        'Add the remaining oil. Stir-fry carrot 2 minutes, then garlic 20 seconds. Add the cold rice, breaking up clumps, and cook until hot and lightly toasted, 3–4 minutes.',
        300,
        'Fry rice',
      ),
      step(
        'Add peas and soy sauce; toss 1 minute. Return the eggs, add green onions and sesame oil, and toss once more. Serve immediately.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-teriyaki-chicken-bowls',
    title: 'Teriyaki Chicken Rice Bowls',
    servings: 4,
    prepMin: 10,
    cookMin: 20,
    tags: ['dinner', 'weeknight', 'under-30', 'bowls'],
    ingredients: [
      qty('chicken-thigh', 'chicken-thigh-bulk', '1 1/2 lb boneless chicken thighs, bite-size', 680, 'g'),
      qty('teriyaki', 'teriyaki-liquid', '1/2 cup teriyaki sauce', 0.5, 'cup'),
      qty('rice-white', 'rice-white-bulk', '1 1/2 cups uncooked white rice', 280, 'g'),
      qty('broccoli', 'broccoli-bulk', '1 head broccoli, cut into florets', 400, 'g'),
      qty('oil-vegetable', 'oil-vegetable-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('oil-sesame', 'oil-sesame-liquid', '1 tsp sesame oil', 1, 'tsp', {
        optional: true,
      }),
      qty('onion-green', 'onion-green-stalk', '2 green onions, sliced', 2, 'each', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt for the rice water'),
    ],
    steps: [
      step(
        'Rinse the rice and cook according to package directions (usually about 18 minutes simmering).',
        1080,
        'Cook rice',
      ),
      step(
        'Steam or microwave the broccoli until bright green and tender-crisp, about 4–5 minutes.',
        300,
        'Cook broccoli',
      ),
      step(
        'Heat the oil in a skillet over medium-high. Cook the chicken until browned and cooked through, 7–9 minutes.',
        480,
        'Cook chicken',
      ),
      step(
        'Pour in the teriyaki sauce and simmer until glossy, 1–2 minutes. Finish with sesame oil if using. Serve over rice with broccoli and green onions.',
        90,
        'Glaze teriyaki',
      ),
    ],
  }),

  recipe({
    id: 'recipe-tuna-melts',
    title: 'Open-Faced Tuna Melts',
    servings: 4,
    prepMin: 10,
    cookMin: 10,
    tags: ['dinner', 'lunch', 'weeknight', 'quick', 'under-30'],
    ingredients: [
      qty('canned-tuna', 'canned-tuna-bulk', '2 cans tuna, drained', 280, 'g'),
      qty('mayo', 'mayo-liquid', '1/3 cup mayonnaise', 0.33, 'cup'),
      qty('celery', 'celery-bulk', '1 stalk celery, finely diced', 50, 'g'),
      qty('mustard-dijon', 'mustard-dijon-liquid', '1 tsp Dijon mustard', 1, 'tsp'),
      qty('bread-sandwich', 'bread-sandwich-slice', '4 slices sandwich bread', 4, 'each'),
      qty('cheddar', 'cheddar-shredded', '1 cup shredded cheddar', 1, 'cup'),
      qty('lemon', 'lemon-each', 'squeeze of lemon', 0.25, 'each', { optional: true }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Heat the broiler. Flake the tuna with mayo, celery, mustard, lemon if using, salt, and pepper.',
      ),
      step(
        'Toast the bread lightly, then pile on the tuna mixture and top with cheddar.',
      ),
      step(
        'Broil until the cheese bubbles and browns in spots, 2–4 minutes. Watch closely.',
        180,
        'Broil melts',
      ),
      step('Serve hot with pickles or a simple salad if you have one.'),
    ],
  }),

  recipe({
    id: 'recipe-bbq-chicken-skillet',
    title: 'Skillet BBQ Chicken',
    servings: 4,
    prepMin: 10,
    cookMin: 20,
    tags: ['dinner', 'weeknight', 'under-30', 'kid-friendly'],
    ingredients: [
      qty('chicken-thigh', 'chicken-thigh-bulk', '1 1/2 lb boneless chicken thighs', 680, 'g'),
      qty('bbq-sauce', 'bbq-sauce-liquid', '3/4 cup BBQ sauce', 0.75, 'cup'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('onion', 'onion-whole', '1 yellow onion, sliced', 1, 'each'),
      qty('garlic-powder', 'garlic-powder-bulk', '1 tsp garlic powder', 1, 'tsp'),
      qty('paprika', 'paprika-bulk', '1 tsp paprika', 1, 'tsp'),
      qty('hamburger-bun', 'hamburger-bun-bulk', '4 soft buns', 200, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Season the chicken with salt, pepper, garlic powder, and paprika.',
      ),
      step(
        'Heat the oil in a large skillet over medium-high. Brown the chicken 4 minutes per side. Transfer to a plate.',
        480,
        'Brown chicken',
      ),
      step(
        'Lower heat to medium. Soften the onion in the pan 4 minutes. Return the chicken, pour BBQ sauce over everything, cover, and simmer until cooked through and saucy, about 8 minutes.',
        720,
        'Simmer in BBQ',
      ),
      step(
        'Shred the chicken in the sauce if you like sandwiches, or serve whole with buns and leftover sauce.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-pork-chops-pan',
    title: 'Pan-Seared Pork Chops with Apples',
    servings: 4,
    prepMin: 10,
    cookMin: 20,
    tags: ['dinner', 'weeknight', 'under-30', 'protein'],
    ingredients: [
      qty('pork-chop', 'pork-chop-bulk', '4 bone-in or boneless pork chops (about 1 1/2 lb)', 680, 'g'),
      qty('apple', 'apple-each', '2 apples, cored and sliced', 2, 'each'),
      qty('onion', 'onion-whole', '1 yellow onion, sliced', 1, 'each'),
      qty('butter', 'butter-tbsp', '2 tbsp butter', 2, 'tbsp'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('thyme-dried', 'thyme-dried-bulk', '1/2 tsp dried thyme', 0.5, 'tsp'),
      qty('broth-chicken', 'broth-chicken-bulk', '1/2 cup chicken broth', 120, 'ml'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Pat the chops dry and season generously with salt, pepper, and thyme.',
      ),
      step(
        'Heat the oil in a large skillet over medium-high. Sear the chops 3–4 minutes per side until browned; transfer to a plate (they may not be done yet).',
        420,
        'Sear chops',
      ),
      step(
        'Add butter to the pan. Cook onion and apples until softened and golden, about 5 minutes.',
        300,
        'Cook apples',
      ),
      step(
        'Pour in the broth, scrape up browned bits, and nestle the chops back in. Cover and cook until the pork reaches 145°F inside, 4–6 minutes. Rest a few minutes, then serve with the apples.',
        300,
        'Finish pork',
      ),
    ],
  }),
];
