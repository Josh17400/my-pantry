/**
 * Simple desserts — original prose for The Good Pantry starter catalog.
 */

import { qty, recipe, step, taste } from './helpers';
import type { Recipe } from '../../recipes/types';

export const dessertRecipes: readonly Recipe[] = [
  recipe({
    id: 'recipe-skillet-chocolate-chip-cookie',
    title: 'Skillet Chocolate Chip Cookie',
    servings: 8,
    prepMin: 15,
    cookMin: 25,
    tags: ['dessert', 'weekend', 'vegetarian', 'crowd', 'comfort'],
    yieldNote: 'One 10-inch skillet cookie',
    ingredients: [
      qty('butter', 'butter-stick', '1 stick butter (1/2 cup), softened', 1, 'each'),
      qty('sugar-brown', 'sugar-brown-bulk', '1/2 cup packed brown sugar', 100, 'g'),
      qty('sugar-granulated', 'sugar-granulated-bulk', '1/4 cup granulated sugar', 50, 'g'),
      qty('egg', 'egg-whole', '1 large egg', 1, 'each'),
      qty('vanilla-extract', 'vanilla-extract-liquid', '1 tsp vanilla extract', 1, 'tsp'),
      qty('flour-ap', 'flour-ap-bulk', '1 1/4 cups all-purpose flour', 1.25, 'cup'),
      qty('baking-soda', 'baking-soda-bulk', '1/2 tsp baking soda', 0.5, 'tsp'),
      qty('chocolate-chips', 'chocolate-chips-bulk', '1 cup chocolate chips', 170, 'g'),
      taste('salt-kosher', 'salt-kosher-bulk', '1/2 tsp salt (or to taste)'),
    ],
    steps: [
      step('Heat the oven to 350°F. Soften the butter if it is still cold.'),
      step(
        'Beat butter with both sugars until creamy. Mix in the egg and vanilla.',
      ),
      step(
        'Stir in flour, baking soda, and a good pinch of salt just until combined. Fold in the chocolate chips.',
      ),
      step(
        'Press the dough into a 10-inch oven-safe skillet (or a 9-inch cake pan). Bake until the edges are set and the center still looks a little soft, 20–25 minutes.',
        1350,
        'Bake skillet cookie',
      ),
      step(
        'Cool 10 minutes before scooping — the middle finishes setting as it rests. Serve warm, with ice cream if you have it.',
        600,
        'Cool slightly',
      ),
    ],
  }),

  recipe({
    id: 'recipe-cinnamon-baked-apples',
    title: 'Cinnamon Baked Apples',
    servings: 4,
    prepMin: 15,
    cookMin: 35,
    tags: ['dessert', 'weekend', 'vegetarian', 'make-ahead'],
    ingredients: [
      qty('apple', 'apple-each', '4 large baking apples', 4, 'each'),
      qty('sugar-brown', 'sugar-brown-bulk', '1/4 cup packed brown sugar', 50, 'g'),
      qty('butter', 'butter-tbsp', '2 tbsp butter, cut into bits', 2, 'tbsp'),
      qty('cinnamon-ground', 'cinnamon-ground-bulk', '1 tsp ground cinnamon', 1, 'tsp'),
      qty('oats-rolled', 'oats-rolled-bulk', '1/4 cup rolled oats', 0.25, 'cup', {
        optional: true,
      }),
      qty('raisins', 'raisins-bulk', '2 tbsp raisins', 20, 'g', { optional: true }),
      qty('maple-syrup', 'maple-syrup-bulk', '2 tbsp maple syrup', 40, 'g', {
        optional: true,
      }),
      qty('water-bottled', 'water-bottled-liquid', '1/2 cup water', 0.5, 'cup'),
      taste('nutmeg', 'nutmeg-bulk', 'pinch of nutmeg', { optional: true }),
    ],
    steps: [
      step(
        'Heat the oven to 375°F. Core the apples, leaving the bottoms intact so they hold filling. Set them upright in a small baking dish.',
      ),
      step(
        'Mix brown sugar, cinnamon, nutmeg if using, oats, and raisins. Stuff into the apple cavities and dot with butter. Drizzle maple syrup over the tops if using.',
      ),
      step(
        'Pour the water into the bottom of the dish. Bake until the apples are soft and the skins wrinkle, 30–40 minutes, basting once with the pan juices.',
        2100,
        'Bake apples',
      ),
      step(
        'Rest 5 minutes. Spoon pan juices over each apple when serving.',
        300,
        'Rest',
      ),
    ],
  }),
];
