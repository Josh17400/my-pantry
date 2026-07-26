/**
 * Soups — original prose for The Good Pantry starter catalog.
 */

import type { Recipe } from '../../recipes/types';
import { qty, recipe, step, taste } from './helpers';

export const soupRecipes: readonly Recipe[] = [
  recipe({
    id: 'recipe-chicken-noodle-soup',
    title: 'Homestyle Chicken Noodle Soup',
    servings: 6,
    prepMin: 15,
    cookMin: 35,
    tags: ['dinner', 'soup', 'comfort', 'make-ahead', 'freezer-friendly'],
    ingredients: [
      qty('chicken-breast', 'chicken-breast-bulk', '1 lb chicken breast', 454, 'g'),
      qty('pasta-egg-noodles', 'pasta-egg-noodles-bulk', '6 oz egg noodles', 170, 'g'),
      qty('carrot', 'carrot-bulk', '3 carrots, sliced', 200, 'g'),
      qty('celery', 'celery-bulk', '3 celery stalks, sliced', 150, 'g'),
      qty('onion', 'onion-whole', '1 yellow onion, diced', 1, 'each'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, minced', 3, 'each'),
      qty('broth-chicken', 'broth-chicken-bulk', '8 cups chicken broth', 1920, 'ml'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('thyme-dried', 'thyme-dried-bulk', '1/2 tsp dried thyme', 0.5, 'tsp'),
      qty('bay-leaf', 'bay-leaf-bulk', '1 bay leaf', 1, 'g'),
      qty('parsley-fresh', 'parsley-fresh-bulk', '2 tbsp chopped parsley', 8, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Warm the oil in a large pot over medium heat. Soften onion, carrot, and celery 6–8 minutes. Stir in garlic for 30 seconds.',
        480,
        'Sweat vegetables',
      ),
      step(
        'Add broth, thyme, bay leaf, and whole chicken breasts. Bring to a simmer, cover partially, and cook until the chicken is done, about 15–18 minutes.',
        1020,
        'Poach chicken',
      ),
      step(
        'Lift out the chicken, shred it with two forks, and return it to the pot. Add the noodles and simmer until tender, 6–8 minutes. Remove the bay leaf.',
        420,
        'Cook noodles',
      ),
      step(
        'Season with salt and pepper. Stir in parsley and serve steaming.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-tomato-basil-soup',
    title: 'Creamy Tomato Basil Soup',
    servings: 4,
    prepMin: 10,
    cookMin: 25,
    tags: ['dinner', 'lunch', 'soup', 'vegetarian', 'comfort'],
    ingredients: [
      qty('tomato-crushed', 'tomato-crushed-bulk', '1 large can (28 oz) crushed tomatoes', 794, 'g'),
      qty('onion', 'onion-whole', '1 yellow onion, diced', 1, 'each'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, minced', 3, 'each'),
      qty('broth-vegetable', 'broth-vegetable-bulk', '2 cups vegetable broth', 480, 'ml'),
      qty('heavy-cream', 'heavy-cream-liquid', '1/2 cup heavy cream', 0.5, 'cup'),
      qty('butter', 'butter-tbsp', '2 tbsp butter', 2, 'tbsp'),
      qty('basil-fresh', 'basil-fresh-bulk', '1/2 cup fresh basil leaves', 20, 'g'),
      qty('sugar-granulated', 'sugar-granulated-bulk', '1 tsp sugar', 1, 'tsp', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Melt the butter in a pot over medium heat. Soften the onion 5 minutes, then add garlic for 30 seconds.',
        330,
        'Soften onion',
      ),
      step(
        'Stir in crushed tomatoes, broth, and sugar if the tomatoes taste sharp. Simmer 15 minutes.',
        900,
        'Simmer tomato',
      ),
      step(
        'Blend until smooth with an immersion blender (or carefully in batches). Return to low heat.',
      ),
      step(
        'Stir in cream and most of the basil (torn). Warm through without boiling. Season and serve with remaining basil on top.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-black-bean-soup',
    title: 'Smoky Black Bean Soup',
    servings: 4,
    prepMin: 10,
    cookMin: 25,
    tags: ['dinner', 'soup', 'vegetarian', 'weeknight', 'pantry'],
    ingredients: [
      qty('beans-black', 'beans-black-bulk', '2 cans black beans, drained (reserve 1/2 can liquid)', 540, 'g'),
      qty('onion', 'onion-whole', '1 yellow onion, diced', 1, 'each'),
      qty('bell-pepper-red', 'bell-pepper-red-bulk', '1 red bell pepper, diced', 150, 'g'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, minced', 3, 'each'),
      qty('broth-vegetable', 'broth-vegetable-bulk', '3 cups vegetable broth', 720, 'ml'),
      qty('cumin', 'cumin-bulk', '1 1/2 tsp cumin', 1.5, 'tsp'),
      qty('chili-powder', 'chili-powder-bulk', '1 tsp chili powder', 1, 'tsp'),
      qty('paprika-smoked', 'paprika-smoked-bulk', '1/2 tsp smoked paprika', 0.5, 'tsp'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('lime', 'lime-each', '1 lime', 1, 'each'),
      qty('sour-cream', 'sour-cream-liquid', 'sour cream for serving', 60, 'ml', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
    ],
    steps: [
      step(
        'Heat the oil in a pot over medium heat. Soften onion and pepper 5 minutes; add garlic and spices for 30 seconds.',
        330,
        'Bloom spices',
      ),
      step(
        'Add beans, a splash of reserved bean liquid, and broth. Simmer 15 minutes.',
        900,
        'Simmer beans',
      ),
      step(
        'Mash some of the beans against the pot side (or blend half) for body. Season with salt and lime juice.',
      ),
      step('Ladle into bowls and top with sour cream if you like.'),
    ],
  }),

  recipe({
    id: 'recipe-lentil-vegetable-soup',
    title: 'Lentil Vegetable Soup',
    servings: 6,
    prepMin: 15,
    cookMin: 40,
    tags: ['dinner', 'soup', 'vegetarian', 'make-ahead', 'freezer-friendly'],
    ingredients: [
      qty('lentils', 'lentils-bulk', '1 1/2 cups dried brown or green lentils, rinsed', 300, 'g'),
      qty('carrot', 'carrot-bulk', '3 carrots, diced', 200, 'g'),
      qty('celery', 'celery-bulk', '2 celery stalks, diced', 100, 'g'),
      qty('onion', 'onion-whole', '1 yellow onion, diced', 1, 'each'),
      qty('garlic', 'garlic-clove', '4 cloves garlic, minced', 4, 'each'),
      qty('tomato-diced', 'tomato-diced-bulk', '1 can (14 oz) diced tomatoes', 400, 'g'),
      qty('broth-vegetable', 'broth-vegetable-bulk', '6 cups vegetable broth', 1440, 'ml'),
      qty('oil-olive', 'oil-olive-liquid', '2 tbsp olive oil', 2, 'tbsp'),
      qty('cumin', 'cumin-bulk', '1 tsp cumin', 1, 'tsp'),
      qty('thyme-dried', 'thyme-dried-bulk', '1/2 tsp dried thyme', 0.5, 'tsp'),
      qty('bay-leaf', 'bay-leaf-bulk', '1 bay leaf', 1, 'g'),
      qty('spinach', 'spinach-bulk', '2 cups spinach', 60, 'g', { optional: true }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Heat the oil in a large pot over medium heat. Soften onion, carrot, and celery 8 minutes. Add garlic, cumin, and thyme for 30 seconds.',
        510,
        'Sweat aromatics',
      ),
      step(
        'Add lentils, tomatoes, broth, and bay leaf. Bring to a boil, then simmer uncovered until lentils are tender, 25–30 minutes.',
        1680,
        'Simmer lentils',
      ),
      step(
        'Remove the bay leaf. Stir in spinach if using until wilted. Season well and serve.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-potato-corn-chowder',
    title: 'Potato Corn Chowder',
    servings: 4,
    prepMin: 15,
    cookMin: 30,
    tags: ['dinner', 'soup', 'vegetarian', 'comfort'],
    ingredients: [
      qty('potato-russet', 'potato-russet-bulk', '1 1/2 lb russet potatoes, peeled and cubed', 680, 'g'),
      qty('corn-canned', 'corn-canned-bulk', '1 can corn, drained (or 1 1/2 cups frozen)', 250, 'g'),
      qty('onion', 'onion-whole', '1 yellow onion, diced', 1, 'each'),
      qty('celery', 'celery-bulk', '2 celery stalks, diced', 100, 'g'),
      qty('broth-vegetable', 'broth-vegetable-bulk', '3 cups vegetable broth', 720, 'ml'),
      qty('milk', 'milk-liquid', '1 1/2 cups milk', 1.5, 'cup'),
      qty('butter', 'butter-tbsp', '2 tbsp butter', 2, 'tbsp'),
      qty('flour-ap', 'flour-ap-bulk', '2 tbsp all-purpose flour', 16, 'g'),
      qty('thyme-dried', 'thyme-dried-bulk', '1/2 tsp dried thyme', 0.5, 'tsp'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Melt the butter in a pot over medium heat. Soften onion and celery 5 minutes. Sprinkle in flour and stir 1 minute.',
        360,
        'Make roux base',
      ),
      step(
        'Whisk in broth gradually. Add potatoes, thyme, salt, and pepper. Simmer until potatoes are tender, about 15 minutes.',
        900,
        'Cook potatoes',
      ),
      step(
        'Stir in corn and milk. Warm through without boiling hard. Mash a few potato cubes against the pot for thickness.',
        300,
        'Finish chowder',
      ),
      step('Taste and adjust salt and pepper. Serve hot.'),
    ],
  }),

  recipe({
    id: 'recipe-simple-minestrone',
    title: 'Simple Minestrone',
    servings: 6,
    prepMin: 15,
    cookMin: 35,
    tags: ['dinner', 'soup', 'vegetarian', 'make-ahead'],
    ingredients: [
      qty('onion', 'onion-whole', '1 yellow onion, diced', 1, 'each'),
      qty('carrot', 'carrot-bulk', '2 carrots, diced', 140, 'g'),
      qty('celery', 'celery-bulk', '2 celery stalks, diced', 100, 'g'),
      qty('zucchini', 'zucchini-bulk', '1 zucchini, diced', 200, 'g'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, minced', 3, 'each'),
      qty('tomato-diced', 'tomato-diced-bulk', '1 can (14 oz) diced tomatoes', 400, 'g'),
      qty('beans-cannellini', 'beans-cannellini-bulk', '1 can cannellini beans, drained', 270, 'g'),
      qty('broth-vegetable', 'broth-vegetable-bulk', '6 cups vegetable broth', 1440, 'ml'),
      qty('pasta-elbow', 'pasta-elbow-bulk', '1 cup small pasta (elbows or shells)', 100, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '2 tbsp olive oil', 2, 'tbsp'),
      qty('italian-seasoning', 'italian-seasoning-bulk', '1 1/2 tsp Italian seasoning', 1.5, 'tsp'),
      qty('parmesan', 'parmesan-grated', 'parmesan for serving', 30, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Heat the oil in a large pot over medium heat. Soften onion, carrot, and celery 8 minutes. Add garlic and Italian seasoning for 30 seconds.',
        510,
        'Sweat vegetables',
      ),
      step(
        'Add tomatoes, zucchini, beans, and broth. Simmer 15 minutes.',
        900,
        'Simmer soup',
      ),
      step(
        'Stir in the pasta and cook until al dente, 8–10 minutes. Season with salt and pepper.',
        540,
        'Cook pasta in soup',
      ),
      step('Serve with a drizzle of olive oil and parmesan if you have it.'),
    ],
  }),
];
