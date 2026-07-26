/**
 * Pasta recipes — original prose for The Good Pantry starter catalog.
 */

import type { Recipe } from '../../recipes/types';
import { qty, recipe, step, taste } from './helpers';

export const pastaRecipes: readonly Recipe[] = [
  recipe({
    id: 'recipe-garlic-butter-pasta',
    title: 'Garlic Butter Pasta',
    servings: 4,
    prepMin: 10,
    cookMin: 15,
    tags: ['dinner', 'pasta', 'quick', 'weeknight', 'vegetarian', 'under-30'],
    ingredients: [
      qty('pasta-spaghetti', 'pasta-spaghetti-bulk', '12 oz spaghetti', 340, 'g'),
      qty('butter', 'butter-tbsp', '4 tbsp butter', 4, 'tbsp'),
      qty('garlic', 'garlic-clove', '4 cloves garlic, thinly sliced', 4, 'each'),
      qty('parmesan', 'parmesan-grated', '1/2 cup grated parmesan', 0.5, 'cup'),
      qty('parsley-fresh', 'parsley-fresh-bulk', '2 tbsp chopped parsley', 8, 'g', {
        optional: true,
      }),
      qty('red-pepper-flakes', 'red-pepper-flakes-bulk', 'pinch of red pepper flakes', 1, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'kosher salt for the pasta water'),
      taste('pepper-black', 'pepper-black-bulk', 'black pepper to taste'),
    ],
    steps: [
      step(
        'Bring a large pot of well-salted water to a boil. Cook the spaghetti until just shy of al dente, following the package time minus 1 minute. Scoop out 1 cup of pasta water, then drain.',
        600,
        'Boil pasta',
      ),
      step(
        'While the pasta cooks, melt the butter in a wide skillet over medium-low heat. Add the garlic (and pepper flakes if using) and cook until fragrant and just golden at the edges — do not brown hard, about 2 minutes.',
        120,
        'Bloom garlic',
      ),
      step(
        'Add the drained pasta to the skillet with a splash of pasta water. Toss hard so the butter coats every strand. Off heat, add the parmesan and more pasta water as needed until the sauce looks glossy.',
      ),
      step(
        'Taste for salt and pepper. Finish with parsley and serve immediately.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-penne-marinara',
    title: 'Penne with Quick Marinara',
    servings: 4,
    prepMin: 10,
    cookMin: 25,
    tags: ['dinner', 'pasta', 'weeknight', 'vegetarian', 'under-30'],
    ingredients: [
      qty('pasta-penne', 'pasta-penne-bulk', '12 oz penne', 340, 'g'),
      qty('pasta-sauce', 'pasta-sauce-bulk', '1 jar pasta sauce (24 oz)', 680, 'g'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, minced', 3, 'each'),
      qty('onion', 'onion-whole', '1/2 yellow onion, finely chopped', 0.5, 'each'),
      qty('oil-olive', 'oil-olive-liquid', '2 tbsp olive oil', 2, 'tbsp'),
      qty('oregano-dried', 'oregano-dried-bulk', '1 tsp dried oregano', 1, 'tsp'),
      qty('parmesan', 'parmesan-grated', '1/3 cup grated parmesan, for serving', 0.33, 'cup', {
        optional: true,
      }),
      qty('basil-fresh', 'basil-fresh-bulk', 'handful of fresh basil leaves', 10, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
      taste('red-pepper-flakes', 'red-pepper-flakes-bulk', 'red pepper flakes to taste', {
        optional: true,
      }),
    ],
    steps: [
      step(
        'Boil the penne in salted water until al dente. Reserve 1/2 cup pasta water and drain.',
        660,
        'Boil penne',
      ),
      step(
        'Warm the olive oil in a saucepan over medium heat. Soften the onion 4 minutes, then add garlic for 30 seconds.',
        270,
        'Soften onion',
      ),
      step(
        'Pour in the pasta sauce and oregano. Simmer gently 10 minutes so the flavors settle. Season with salt, pepper, and flakes if you want heat.',
        600,
        'Simmer sauce',
      ),
      step(
        'Toss the penne with the sauce, loosening with pasta water if needed. Serve with parmesan and torn basil.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-creamy-parmesan-penne',
    title: 'Creamy Parmesan Penne',
    servings: 4,
    prepMin: 10,
    cookMin: 20,
    tags: ['dinner', 'pasta', 'weeknight', 'vegetarian', 'comfort'],
    ingredients: [
      qty('pasta-penne', 'pasta-penne-bulk', '12 oz penne', 340, 'g'),
      qty('heavy-cream', 'heavy-cream-liquid', '1 cup heavy cream', 1, 'cup'),
      qty('butter', 'butter-tbsp', '2 tbsp butter', 2, 'tbsp'),
      qty('garlic', 'garlic-clove', '2 cloves garlic, minced', 2, 'each'),
      qty('parmesan', 'parmesan-grated', '3/4 cup grated parmesan', 0.75, 'cup'),
      qty('spinach', 'spinach-bulk', '3 cups baby spinach', 90, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'black pepper to taste'),
    ],
    steps: [
      step(
        'Cook the penne in salted water until al dente. Reserve 3/4 cup pasta water; drain.',
        660,
        'Boil pasta',
      ),
      step(
        'In the same pot (or a skillet), melt the butter over medium-low. Soften the garlic 1 minute without browning.',
        60,
        'Soften garlic',
      ),
      step(
        'Pour in the cream and bring to a bare simmer. Stir in the parmesan until melted and smooth. Season with salt and plenty of pepper.',
        180,
        'Melt cheese sauce',
      ),
      step(
        'Add the pasta and toss, adding pasta water until the sauce clings. Fold in spinach if using until just wilted. Serve hot.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-lemon-garlic-spaghetti',
    title: 'Lemon Garlic Spaghetti',
    servings: 4,
    prepMin: 10,
    cookMin: 15,
    tags: ['dinner', 'pasta', 'quick', 'weeknight', 'vegetarian', 'under-30'],
    ingredients: [
      qty('pasta-spaghetti', 'pasta-spaghetti-bulk', '12 oz spaghetti', 340, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '1/4 cup olive oil', 0.25, 'cup'),
      qty('garlic', 'garlic-clove', '5 cloves garlic, thinly sliced', 5, 'each'),
      qty('lemon', 'lemon-each', '2 lemons (zest + juice)', 2, 'each'),
      qty('parmesan', 'parmesan-grated', '1/2 cup grated parmesan', 0.5, 'cup'),
      qty('parsley-fresh', 'parsley-fresh-bulk', '1/4 cup chopped parsley', 15, 'g'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Boil the spaghetti in salted water until al dente. Save 1 cup pasta water and drain.',
        600,
        'Boil spaghetti',
      ),
      step(
        'Warm the olive oil in a large skillet over medium-low. Add the garlic and cook until fragrant and pale gold, about 2 minutes.',
        120,
        'Infuse oil',
      ),
      step(
        'Add the zest of both lemons and the juice of one. Slide in the pasta with a ladle of pasta water and toss vigorously.',
      ),
      step(
        'Off heat, add parmesan, parsley, juice from the second lemon to taste, salt, and pepper. Toss until silky and serve.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-sausage-pepper-pasta',
    title: 'Italian Sausage and Pepper Pasta',
    servings: 4,
    prepMin: 10,
    cookMin: 25,
    tags: ['dinner', 'pasta', 'weeknight', 'one-pan-adjacent'],
    ingredients: [
      qty('pasta-rotini', 'pasta-rotini-bulk', '12 oz rotini or penne', 340, 'g'),
      qty('sausage-italian', 'sausage-italian-bulk', '1 lb Italian sausage, casings removed', 454, 'g'),
      qty('bell-pepper-red', 'bell-pepper-red-bulk', '1 red bell pepper, sliced', 150, 'g'),
      qty('bell-pepper-green', 'bell-pepper-green-bulk', '1 green bell pepper, sliced', 150, 'g'),
      qty('onion', 'onion-whole', '1 yellow onion, sliced', 1, 'each'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, minced', 3, 'each'),
      qty('tomato-crushed', 'tomato-crushed-bulk', '1 can (14 oz) crushed tomatoes', 400, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp olive oil', 1, 'tbsp'),
      qty('italian-seasoning', 'italian-seasoning-bulk', '1 tsp Italian seasoning', 1, 'tsp'),
      qty('parmesan', 'parmesan-grated', 'parmesan for serving', 30, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Cook the pasta in salted water until al dente. Reserve 1/2 cup water and drain.',
        660,
        'Boil pasta',
      ),
      step(
        'Heat the oil in a large skillet over medium-high. Brown the sausage, breaking it up, until no pink remains, 6–8 minutes. Transfer to a bowl.',
        420,
        'Brown sausage',
      ),
      step(
        'In the same skillet, cook the onion and peppers until softened and lightly charred at the edges, about 6 minutes. Stir in the garlic for 30 seconds.',
        390,
        'Cook peppers',
      ),
      step(
        'Add crushed tomatoes, Italian seasoning, and the sausage. Simmer 5 minutes. Toss with pasta, loosen with pasta water, and season. Serve with parmesan.',
        300,
        'Simmer sauce',
      ),
    ],
  }),

  recipe({
    id: 'recipe-tuna-pasta-skillet',
    title: 'Pantry Tuna Pasta',
    servings: 4,
    prepMin: 8,
    cookMin: 18,
    tags: ['dinner', 'pasta', 'quick', 'weeknight', 'pantry', 'under-30'],
    ingredients: [
      qty('pasta-elbow', 'pasta-elbow-bulk', '12 oz elbow pasta', 340, 'g'),
      qty('canned-tuna', 'canned-tuna-bulk', '2 cans tuna, drained', 280, 'g'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, minced', 3, 'each'),
      qty('oil-olive', 'oil-olive-liquid', '3 tbsp olive oil', 3, 'tbsp'),
      qty('lemon', 'lemon-each', '1 lemon', 1, 'each'),
      qty('frozen-peas', 'frozen-peas-bulk', '1 cup frozen peas', 140, 'g'),
      qty('parmesan', 'parmesan-grated', '1/3 cup grated parmesan', 0.33, 'cup', {
        optional: true,
      }),
      qty('parsley-fresh', 'parsley-fresh-bulk', '2 tbsp chopped parsley', 8, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
      taste('red-pepper-flakes', 'red-pepper-flakes-bulk', 'red pepper flakes optional', {
        optional: true,
      }),
    ],
    steps: [
      step(
        'Boil the elbows in salted water. In the last 2 minutes, drop in the frozen peas. Reserve 3/4 cup pasta water; drain.',
        600,
        'Boil pasta',
      ),
      step(
        'Warm the olive oil in a large skillet over medium heat. Soften the garlic (and pepper flakes if using) 1 minute.',
        60,
        'Warm garlic oil',
      ),
      step(
        'Flake in the tuna and warm through. Add the pasta and peas, lemon zest and juice, and enough pasta water to coat. Toss with parmesan and parsley if using.',
      ),
      step('Season with salt and pepper and serve.'),
    ],
  }),

  recipe({
    id: 'recipe-baked-ziti-style',
    title: 'Weeknight Baked Ziti',
    servings: 6,
    prepMin: 15,
    cookMin: 35,
    tags: ['dinner', 'pasta', 'weekend', 'make-ahead', 'comfort', 'crowd'],
    ingredients: [
      qty('pasta-penne', 'pasta-penne-bulk', '1 lb penne or ziti-style pasta', 454, 'g'),
      qty('pasta-sauce', 'pasta-sauce-bulk', '1 jar (24 oz) pasta sauce', 680, 'g'),
      qty('ricotta', 'ricotta-bulk', '15 oz ricotta', 425, 'g'),
      qty('mozzarella', 'mozzarella-bulk', '2 cups shredded mozzarella', 200, 'g'),
      qty('parmesan', 'parmesan-grated', '1/2 cup grated parmesan', 0.5, 'cup'),
      qty('egg', 'egg-whole', '1 large egg', 1, 'each'),
      qty('garlic', 'garlic-clove', '2 cloves garlic, minced', 2, 'each'),
      qty('italian-seasoning', 'italian-seasoning-bulk', '1 tsp Italian seasoning', 1, 'tsp'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Heat the oven to 375°F. Boil the pasta 2 minutes less than package directions; drain.',
        540,
        'Boil pasta',
      ),
      step(
        'Stir ricotta, egg, half the parmesan, garlic, Italian seasoning, salt, and pepper in a bowl.',
      ),
      step(
        'In a 9×13-inch baking dish, layer a thin coat of sauce, half the pasta, all of the ricotta mixture, half the mozzarella, remaining pasta, remaining sauce, then the rest of the mozzarella and parmesan.',
      ),
      step(
        'Bake uncovered until bubbling and browned in spots, 25–30 minutes. Rest 10 minutes before scooping.',
        1620,
        'Bake ziti',
      ),
    ],
  }),
];
