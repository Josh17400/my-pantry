/**
 * Slower weekend dishes — original prose for The Good Pantry starter catalog.
 */

import type { Recipe } from '../../recipes/types';
import { qty, recipe, step, taste } from './helpers';

export const weekendRecipes: readonly Recipe[] = [
  recipe({
    id: 'recipe-simple-beef-stew',
    title: 'Simple Beef Stew',
    servings: 6,
    prepMin: 25,
    cookMin: 120,
    tags: ['dinner', 'weekend', 'comfort', 'make-ahead', 'freezer-friendly'],
    ingredients: [
      qty('beef-stew-meat', 'beef-stew-meat-bulk', '2 lb beef stew meat, cubed', 907, 'g'),
      qty('potato-yukon', 'potato-yukon-bulk', '1 1/2 lb potatoes, chunked', 680, 'g'),
      qty('carrot', 'carrot-bulk', '4 carrots, cut into chunks', 280, 'g'),
      qty('celery', 'celery-bulk', '2 celery stalks, sliced', 100, 'g'),
      qty('onion', 'onion-whole', '1 large yellow onion, diced', 1, 'each'),
      qty('garlic', 'garlic-clove', '4 cloves garlic, minced', 4, 'each'),
      qty('broth-beef', 'broth-beef-bulk', '4 cups beef broth', 960, 'ml'),
      qty('tomato-paste', 'tomato-paste-bulk', '2 tbsp tomato paste', 30, 'g'),
      qty('flour-ap', 'flour-ap-bulk', '1/4 cup all-purpose flour', 0.25, 'cup'),
      qty('oil-olive', 'oil-olive-liquid', '2 tbsp oil', 2, 'tbsp'),
      qty('thyme-dried', 'thyme-dried-bulk', '1 tsp dried thyme', 1, 'tsp'),
      qty('bay-leaf', 'bay-leaf-bulk', '2 bay leaves', 2, 'g'),
      qty('worcestershire', 'worcestershire-liquid', '1 tbsp Worcestershire sauce', 1, 'tbsp', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Pat the beef dry. Toss with flour, salt, and pepper. Heat the oil in a heavy pot over medium-high and brown the beef in batches; transfer to a plate.',
        600,
        'Brown beef',
      ),
      step(
        'Lower heat to medium. Soften onion, carrot, and celery 6 minutes. Stir in garlic and tomato paste for 1 minute.',
        420,
        'Build base',
      ),
      step(
        'Return the beef. Add broth, thyme, bay leaves, and Worcestershire if using. Bring to a simmer, cover, and cook gently 1 hour.',
        3600,
        'Stew first hour',
      ),
      step(
        'Add the potatoes and continue simmering until beef and potatoes are tender, 30–45 minutes more. Discard bay leaves, taste for salt, and serve.',
        2100,
        'Finish stew',
      ),
    ],
  }),

  recipe({
    id: 'recipe-roast-chicken-thighs',
    title: 'Crispy Roast Chicken Thighs',
    servings: 4,
    prepMin: 15,
    cookMin: 45,
    tags: ['dinner', 'weekend', 'sheet-pan', 'protein'],
    ingredients: [
      qty('chicken-thigh', 'chicken-thigh-bulk', '8 bone-in chicken thighs (about 3 lb)', 1360, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '2 tbsp olive oil', 2, 'tbsp'),
      qty('garlic-powder', 'garlic-powder-bulk', '1 tsp garlic powder', 1, 'tsp'),
      qty('paprika', 'paprika-bulk', '1 1/2 tsp paprika', 1.5, 'tsp'),
      qty('oregano-dried', 'oregano-dried-bulk', '1 tsp dried oregano', 1, 'tsp'),
      qty('lemon', 'lemon-each', '1 lemon, cut into wedges', 1, 'each'),
      qty('potato-yukon', 'potato-yukon-bulk', '1 1/2 lb potatoes, cut into wedges', 680, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Heat the oven to 425°F. Pat the chicken very dry — dry skin is what gets crisp.',
      ),
      step(
        'Rub the thighs with oil, garlic powder, paprika, oregano, salt, and pepper. Arrange skin-side up on a sheet pan. Scatter potato wedges around if using and toss them in the extra oil and seasonings.',
      ),
      step(
        'Roast until the skin is deep gold and the thickest part of the chicken reads 175°F, 40–50 minutes.',
        2700,
        'Roast thighs',
      ),
      step(
        'Rest 5 minutes. Serve with lemon wedges for squeezing over the crispy skin.',
        300,
        'Rest chicken',
      ),
    ],
  }),
];
