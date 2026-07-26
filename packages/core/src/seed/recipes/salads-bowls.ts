/**
 * Salads and grain bowls — original prose for The Good Pantry starter catalog.
 */

import { qty, recipe, step, taste } from './helpers';
import type { Recipe } from '../../recipes/types';

export const saladBowlRecipes: readonly Recipe[] = [
  recipe({
    id: 'recipe-greek-cucumber-tomato',
    title: 'Greek Cucumber Tomato Salad',
    servings: 4,
    prepMin: 15,
    cookMin: 0,
    tags: ['side', 'salad', 'vegetarian', 'quick', 'no-cook', 'summer'],
    ingredients: [
      qty('cucumber', 'cucumber-bulk', '1 large cucumber, chopped', 300, 'g'),
      qty('tomato', 'tomato-each', '3 ripe tomatoes, chunked', 3, 'each'),
      qty('onion-red', 'onion-red-each', '1/2 red onion, thinly sliced', 0.5, 'each'),
      qty('feta', 'feta-bulk', '4 oz feta, crumbled', 113, 'g'),
      qty('olives-black', 'olives-black-bulk', '1/2 cup olives', 70, 'g', {
        optional: true,
      }),
      qty('oil-olive', 'oil-olive-liquid', '3 tbsp olive oil', 3, 'tbsp'),
      qty('vinegar-red-wine', 'vinegar-red-wine-liquid', '1 1/2 tbsp red wine vinegar', 1.5, 'tbsp'),
      qty('oregano-dried', 'oregano-dried-bulk', '1 tsp dried oregano', 1, 'tsp'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Combine cucumber, tomatoes, red onion, feta, and olives in a large bowl.',
      ),
      step(
        'Whisk oil, vinegar, oregano, salt, and pepper. Pour over the salad and toss gently.',
      ),
      step(
        'Let sit 10 minutes so the juices mingle, then serve at room temperature.',
        600,
        'Rest salad',
      ),
    ],
  }),

  recipe({
    id: 'recipe-chopped-chicken-salad',
    title: 'Chopped Chicken Salad',
    servings: 4,
    prepMin: 20,
    cookMin: 15,
    tags: ['lunch', 'dinner', 'salad', 'protein', 'meal-prep'],
    ingredients: [
      qty('chicken-breast', 'chicken-breast-bulk', '1 lb chicken breast', 454, 'g'),
      qty('lettuce-romaine', 'lettuce-romaine-bulk', '1 large head romaine, chopped', 300, 'g'),
      qty('cucumber', 'cucumber-bulk', '1 cucumber, diced', 250, 'g'),
      qty('tomato-cherry', 'tomato-cherry-bulk', '1 cup cherry tomatoes, halved', 150, 'g'),
      qty('cheddar', 'cheddar-shredded', '1/2 cup shredded cheddar', 0.5, 'cup', {
        optional: true,
      }),
      qty('ranch-dressing', 'ranch-dressing-liquid', '1/2 cup ranch dressing', 0.5, 'cup'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('avocado', 'avocado-bulk', '1 avocado, diced', 150, 'g', { optional: true }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Season the chicken with salt and pepper. Heat the oil in a skillet over medium and cook until done, about 6 minutes per side. Rest, then chop.',
        720,
        'Cook chicken',
      ),
      step(
        'Pile romaine, cucumber, tomatoes, cheese, and avocado in a bowl. Add the chopped chicken.',
      ),
      step('Drizzle with ranch, toss, and serve.'),
    ],
  }),

  recipe({
    id: 'recipe-quinoa-chickpea-bowl',
    title: 'Quinoa Chickpea Grain Bowl',
    servings: 4,
    prepMin: 15,
    cookMin: 20,
    tags: ['lunch', 'dinner', 'bowl', 'vegetarian', 'meal-prep'],
    ingredients: [
      qty('quinoa', 'quinoa-bulk', '1 cup quinoa, rinsed', 170, 'g'),
      qty('beans-garbanzo', 'beans-garbanzo-bulk', '1 can chickpeas, drained and rinsed', 270, 'g'),
      qty('cucumber', 'cucumber-bulk', '1 cucumber, diced', 250, 'g'),
      qty('tomato-cherry', 'tomato-cherry-bulk', '1 cup cherry tomatoes, halved', 150, 'g'),
      qty('feta', 'feta-bulk', '3 oz feta, crumbled', 85, 'g', { optional: true }),
      qty('oil-olive', 'oil-olive-liquid', '3 tbsp olive oil', 3, 'tbsp'),
      qty('lemon', 'lemon-each', '1 lemon', 1, 'each'),
      qty('cumin', 'cumin-bulk', '1/2 tsp cumin', 0.5, 'tsp'),
      qty('spinach', 'spinach-bulk', '2 cups baby spinach', 60, 'g'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Cook the quinoa in salted water according to package directions (usually about 15 minutes). Fluff and cool slightly.',
        900,
        'Cook quinoa',
      ),
      step(
        'Toss chickpeas with 1 tbsp oil, cumin, salt, and pepper. Warm in a skillet 3–4 minutes if you want them hot, or leave cold.',
        210,
        'Warm chickpeas',
      ),
      step(
        'Whisk remaining oil with the juice of the lemon, salt, and pepper for a quick dressing.',
      ),
      step(
        'Build bowls with spinach, quinoa, chickpeas, cucumber, tomatoes, and feta. Drizzle with dressing.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-rice-black-bean-bowl',
    title: 'Rice and Black Bean Bowl',
    servings: 4,
    prepMin: 10,
    cookMin: 25,
    tags: ['dinner', 'lunch', 'bowl', 'vegetarian', 'weeknight'],
    ingredients: [
      qty('rice-white', 'rice-white-bulk', '1 1/2 cups white rice', 280, 'g'),
      qty('beans-black', 'beans-black-bulk', '2 cans black beans, drained', 540, 'g'),
      qty('corn-canned', 'corn-canned-bulk', '1 can corn, drained', 250, 'g'),
      qty('salsa', 'salsa-bulk', '3/4 cup salsa', 180, 'g'),
      qty('cumin', 'cumin-bulk', '1 tsp cumin', 1, 'tsp'),
      qty('lime', 'lime-each', '1 lime', 1, 'each'),
      qty('cheddar', 'cheddar-shredded', '1 cup shredded cheddar', 1, 'cup', {
        optional: true,
      }),
      qty('avocado', 'avocado-bulk', '1 avocado, sliced', 150, 'g', { optional: true }),
      qty('cilantro', 'cilantro-bunch', 'handful of cilantro', 0.25, 'each', {
        optional: true,
      }),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
    ],
    steps: [
      step(
        'Cook the rice according to package directions.',
        1080,
        'Cook rice',
      ),
      step(
        'Warm the oil in a skillet. Add beans, corn, cumin, and a pinch of salt. Heat through 5 minutes, then stir in half the salsa.',
        300,
        'Warm bean mix',
      ),
      step(
        'Divide rice into bowls. Top with the bean mixture, remaining salsa, cheese, avocado, cilantro, and a squeeze of lime.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-simple-green-salad',
    title: 'Everyday Green Salad',
    servings: 4,
    prepMin: 10,
    cookMin: 0,
    tags: ['side', 'salad', 'vegetarian', 'quick', 'no-cook'],
    ingredients: [
      qty('lettuce-romaine', 'lettuce-romaine-bulk', '1 head romaine or mixed greens', 250, 'g'),
      qty('cucumber', 'cucumber-bulk', '1/2 cucumber, sliced', 150, 'g'),
      qty('tomato-cherry', 'tomato-cherry-bulk', '1 cup cherry tomatoes', 150, 'g'),
      qty('carrot', 'carrot-bulk', '1 carrot, shredded', 60, 'g', { optional: true }),
      qty('oil-olive', 'oil-olive-liquid', '3 tbsp olive oil', 3, 'tbsp'),
      qty('vinegar-balsamic', 'vinegar-balsamic-liquid', '1 1/2 tbsp balsamic vinegar', 1.5, 'tbsp'),
      qty('mustard-dijon', 'mustard-dijon-liquid', '1 tsp Dijon mustard', 1, 'tsp'),
      qty('honey', 'honey-bulk', '1/2 tsp honey', 4, 'g', { optional: true }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Wash and dry the greens well. Tear into bite-size pieces in a large bowl with cucumber, tomatoes, and carrot.',
      ),
      step(
        'Whisk oil, vinegar, mustard, honey if using, salt, and pepper until thick.',
      ),
      step(
        'Dress the salad just before serving and toss until the leaves shine.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-couscous-vegetable-bowl',
    title: 'Lemon Couscous Vegetable Bowl',
    servings: 4,
    prepMin: 15,
    cookMin: 15,
    tags: ['lunch', 'dinner', 'bowl', 'vegetarian', 'quick', 'under-30'],
    ingredients: [
      qty('couscous', 'couscous-bulk', '1 1/2 cups couscous', 250, 'g'),
      qty('broth-vegetable', 'broth-vegetable-bulk', '1 1/2 cups vegetable broth', 360, 'ml'),
      qty('zucchini', 'zucchini-bulk', '1 zucchini, diced', 200, 'g'),
      qty('bell-pepper-red', 'bell-pepper-red-bulk', '1 red bell pepper, diced', 150, 'g'),
      qty('beans-garbanzo', 'beans-garbanzo-bulk', '1 can chickpeas, drained', 270, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '3 tbsp olive oil', 3, 'tbsp'),
      qty('lemon', 'lemon-each', '1 lemon', 1, 'each'),
      qty('garlic', 'garlic-clove', '2 cloves garlic, minced', 2, 'each'),
      qty('feta', 'feta-bulk', '3 oz feta', 85, 'g', { optional: true }),
      qty('parsley-fresh', 'parsley-fresh-bulk', '1/4 cup chopped parsley', 15, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Bring the broth to a boil. Stir in couscous, cover, and remove from heat. Steam 5 minutes, then fluff with a fork.',
        300,
        'Steam couscous',
      ),
      step(
        'Heat 1 tbsp oil in a skillet over medium-high. Sauté zucchini, pepper, and chickpeas until the vegetables soften and take on color, 6–8 minutes. Add garlic for the last 30 seconds.',
        450,
        'Sauté vegetables',
      ),
      step(
        'Toss couscous with remaining oil, lemon zest and juice, salt, and pepper. Top with the vegetables, feta, and parsley.',
      ),
    ],
  }),
];
