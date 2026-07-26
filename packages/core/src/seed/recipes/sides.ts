/**
 * Side dishes — original prose for The Good Pantry starter catalog.
 */

import type { Recipe } from '../../recipes/types';
import { qty, recipe, step, taste } from './helpers';

export const sideRecipes: readonly Recipe[] = [
  recipe({
    id: 'recipe-garlic-roasted-broccoli',
    title: 'Garlic Roasted Broccoli',
    servings: 4,
    prepMin: 8,
    cookMin: 20,
    tags: ['side', 'vegetarian', 'sheet-pan', 'quick', 'weeknight'],
    ingredients: [
      qty('broccoli', 'broccoli-bulk', '2 heads broccoli, cut into florets', 700, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '3 tbsp olive oil', 3, 'tbsp'),
      qty('garlic', 'garlic-clove', '4 cloves garlic, minced', 4, 'each'),
      qty('lemon', 'lemon-each', '1/2 lemon', 0.5, 'each', { optional: true }),
      qty('parmesan', 'parmesan-grated', '2 tbsp grated parmesan', 15, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step('Heat the oven to 425°F.'),
      step(
        'Toss the florets with oil, garlic, salt, and pepper on a sheet pan. Spread in a single layer.',
      ),
      step(
        'Roast until the edges char and stems are tender, 18–22 minutes, tossing once halfway.',
        1200,
        'Roast broccoli',
      ),
      step(
        'Squeeze lemon over the top and dust with parmesan if using. Serve hot.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-honey-roasted-carrots',
    title: 'Honey Roasted Carrots',
    servings: 4,
    prepMin: 10,
    cookMin: 25,
    tags: ['side', 'vegetarian', 'sheet-pan', 'kid-friendly'],
    ingredients: [
      qty('carrot', 'carrot-bulk', '2 lb carrots, peeled and cut into sticks', 907, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '2 tbsp olive oil', 2, 'tbsp'),
      qty('honey', 'honey-bulk', '2 tbsp honey', 42, 'g'),
      qty('butter', 'butter-tbsp', '1 tbsp butter, melted', 1, 'tbsp'),
      qty('thyme-dried', 'thyme-dried-bulk', '1/2 tsp dried thyme', 0.5, 'tsp', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step('Heat the oven to 400°F.'),
      step(
        'Toss carrots with oil, melted butter, honey, thyme, salt, and pepper. Spread on a sheet pan.',
      ),
      step(
        'Roast until caramelized and tender when pierced, 22–28 minutes, turning once.',
        1500,
        'Roast carrots',
      ),
      step('Serve warm; scrape any sticky pan juices over the carrots.'),
    ],
  }),

  recipe({
    id: 'recipe-mashed-potatoes',
    title: 'Buttery Mashed Potatoes',
    servings: 6,
    prepMin: 15,
    cookMin: 25,
    tags: ['side', 'vegetarian', 'comfort', 'weekend'],
    ingredients: [
      qty('potato-russet', 'potato-russet-bulk', '3 lb russet potatoes, peeled and chunked', 1360, 'g'),
      qty('butter', 'butter-tbsp', '6 tbsp butter', 6, 'tbsp'),
      qty('milk', 'milk-liquid', '3/4 cup warm milk', 0.75, 'cup'),
      qty('sour-cream', 'sour-cream-liquid', '1/4 cup sour cream', 0.25, 'cup', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Cover the potatoes with cold salted water in a pot. Bring to a boil and cook until completely tender, 15–20 minutes.',
        1080,
        'Boil potatoes',
      ),
      step('Drain well and return the potatoes to the hot pot for 1 minute to steam off moisture.'),
      step(
        'Mash with butter until smooth-ish. Beat in warm milk (and sour cream if using) until creamy. Season aggressively with salt and pepper.',
      ),
      step('Serve immediately, or keep warm covered.'),
    ],
  }),

  recipe({
    id: 'recipe-skillet-green-beans',
    title: 'Skillet Green Beans with Garlic',
    servings: 4,
    prepMin: 8,
    cookMin: 12,
    tags: ['side', 'vegetarian', 'quick', 'weeknight', 'under-15'],
    ingredients: [
      qty('green-beans', 'green-beans-bulk', '1 lb green beans, trimmed', 454, 'g'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, sliced', 3, 'each'),
      qty('oil-olive', 'oil-olive-liquid', '2 tbsp olive oil', 2, 'tbsp'),
      qty('butter', 'butter-tbsp', '1 tbsp butter', 1, 'tbsp', { optional: true }),
      qty('lemon', 'lemon-each', 'squeeze of lemon', 0.25, 'each', { optional: true }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Heat the oil in a large skillet over medium-high. Add the beans and a pinch of salt. Cook, tossing often, until blistered in spots and crisp-tender, 6–8 minutes.',
        420,
        'Blister beans',
      ),
      step(
        'Add garlic (and butter if using) and cook 1 minute more until fragrant. Finish with lemon, salt, and pepper.',
        60,
        'Garlic finish',
      ),
    ],
  }),
];
