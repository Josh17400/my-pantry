/**
 * One-pan and sheet-pan meals — original prose for The Good Pantry starter catalog.
 */

import { qty, recipe, step, taste } from './helpers';
import type { Recipe } from '../../recipes/types';

export const onePanRecipes: readonly Recipe[] = [
  recipe({
    id: 'recipe-sheet-pan-chicken-veg',
    title: 'Sheet-Pan Chicken and Vegetables',
    servings: 4,
    prepMin: 15,
    cookMin: 35,
    tags: ['dinner', 'sheet-pan', 'one-pan', 'weeknight', 'meal-prep'],
    ingredients: [
      qty('chicken-thigh', 'chicken-thigh-bulk', '2 lb bone-in or boneless chicken thighs', 907, 'g'),
      qty('potato-yukon', 'potato-yukon-bulk', '1 1/2 lb Yukon potatoes, chunked', 680, 'g'),
      qty('broccoli', 'broccoli-bulk', '1 head broccoli, florets', 400, 'g'),
      qty('carrot', 'carrot-bulk', '3 carrots, cut into sticks', 200, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '3 tbsp olive oil', 3, 'tbsp'),
      qty('garlic-powder', 'garlic-powder-bulk', '1 tsp garlic powder', 1, 'tsp'),
      qty('paprika', 'paprika-bulk', '1 tsp paprika', 1, 'tsp'),
      qty('oregano-dried', 'oregano-dried-bulk', '1 tsp dried oregano', 1, 'tsp'),
      qty('lemon', 'lemon-each', '1 lemon, cut into wedges', 1, 'each', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Heat the oven to 425°F. Line a large sheet pan with parchment if you want easy cleanup.',
      ),
      step(
        'Toss the potatoes and carrots with 2 tbsp oil, half the spices, salt, and pepper. Spread on the pan and roast 15 minutes.',
        900,
        'Roast potatoes first',
      ),
      step(
        'Toss the chicken and broccoli with the remaining oil and spices. Nestle everything onto the pan in a single layer.',
      ),
      step(
        'Roast until the chicken is cooked through (165°F) and the vegetables are browned at the edges, 20–25 minutes. Squeeze lemon over the top at the table.',
        1350,
        'Roast chicken and veg',
      ),
    ],
  }),

  recipe({
    id: 'recipe-sheet-pan-sausage-peppers',
    title: 'Sheet-Pan Sausage, Peppers, and Onions',
    servings: 4,
    prepMin: 10,
    cookMin: 30,
    tags: ['dinner', 'sheet-pan', 'one-pan', 'weeknight', 'under-45'],
    ingredients: [
      qty('sausage-italian', 'sausage-italian-bulk', '1 1/2 lb Italian sausage links', 680, 'g'),
      qty('bell-pepper-red', 'bell-pepper-red-bulk', '2 red bell peppers, sliced', 300, 'g'),
      qty('bell-pepper-green', 'bell-pepper-green-bulk', '1 green bell pepper, sliced', 150, 'g'),
      qty('onion', 'onion-whole', '2 yellow onions, sliced', 2, 'each'),
      qty('oil-olive', 'oil-olive-liquid', '2 tbsp olive oil', 2, 'tbsp'),
      qty('italian-seasoning', 'italian-seasoning-bulk', '1 tsp Italian seasoning', 1, 'tsp'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, smashed', 3, 'each'),
      qty('hamburger-bun', 'hamburger-bun-bulk', '4 hoagie-style rolls or buns', 200, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step('Heat the oven to 425°F.'),
      step(
        'Toss peppers, onions, and garlic with oil, Italian seasoning, salt, and pepper on a sheet pan. Nestle the sausage links among the vegetables.',
      ),
      step(
        'Roast 25–30 minutes, turning the sausages once, until the sausages are cooked through and the peppers are soft and blistered.',
        1680,
        'Roast sausage tray',
      ),
      step(
        'Serve on rolls as sandwiches or plate as-is with mustard if you like.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-one-pan-chicken-rice',
    title: 'One-Pan Chicken and Rice',
    servings: 4,
    prepMin: 15,
    cookMin: 35,
    tags: ['dinner', 'one-pan', 'weeknight', 'comfort'],
    ingredients: [
      qty('chicken-thigh', 'chicken-thigh-bulk', '1 1/2 lb boneless chicken thighs', 680, 'g'),
      qty('rice-white', 'rice-white-bulk', '1 1/2 cups long-grain white rice', 280, 'g'),
      qty('onion', 'onion-whole', '1 yellow onion, diced', 1, 'each'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, minced', 3, 'each'),
      qty('broth-chicken', 'broth-chicken-bulk', '3 cups chicken broth', 720, 'ml'),
      qty('oil-olive', 'oil-olive-liquid', '2 tbsp olive oil', 2, 'tbsp'),
      qty('frozen-peas', 'frozen-peas-bulk', '1 cup frozen peas', 140, 'g', {
        optional: true,
      }),
      qty('paprika', 'paprika-bulk', '1 tsp paprika', 1, 'tsp'),
      qty('thyme-dried', 'thyme-dried-bulk', '1/2 tsp dried thyme', 0.5, 'tsp'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Season the chicken with salt, pepper, and paprika. Heat the oil in a large deep skillet or Dutch oven over medium-high. Brown the chicken 3–4 minutes per side; transfer to a plate.',
        480,
        'Brown chicken',
      ),
      step(
        'Lower heat to medium. Soften the onion 4 minutes, then stir in garlic and rice for 1 minute until the grains look glossy.',
        300,
        'Toast rice',
      ),
      step(
        'Pour in the broth and thyme, scraping the pan. Nestle the chicken on top, cover, and simmer gently until the rice is tender and the chicken is cooked, about 18–20 minutes.',
        1140,
        'Simmer chicken rice',
      ),
      step(
        'Scatter peas over the top in the last 3 minutes if using. Rest covered 5 minutes, fluff the rice, and serve.',
        300,
        'Rest',
      ),
    ],
  }),

  recipe({
    id: 'recipe-skillet-beef-rice',
    title: 'Beef and Rice Skillet',
    servings: 4,
    prepMin: 10,
    cookMin: 30,
    tags: ['dinner', 'one-pan', 'weeknight', 'comfort'],
    ingredients: [
      qty('ground-beef', 'ground-beef-bulk', '1 lb ground beef', 454, 'g'),
      qty('rice-white', 'rice-white-bulk', '1 cup white rice', 185, 'g'),
      qty('onion', 'onion-whole', '1 yellow onion, diced', 1, 'each'),
      qty('bell-pepper-green', 'bell-pepper-green-bulk', '1 green bell pepper, diced', 150, 'g'),
      qty('garlic', 'garlic-clove', '2 cloves garlic, minced', 2, 'each'),
      qty('tomato-diced', 'tomato-diced-bulk', '1 can (14 oz) diced tomatoes', 400, 'g'),
      qty('broth-beef', 'broth-beef-bulk', '2 cups beef broth', 480, 'ml'),
      qty('chili-powder', 'chili-powder-bulk', '1 tsp chili powder', 1, 'tsp'),
      qty('cumin', 'cumin-bulk', '1 tsp cumin', 1, 'tsp'),
      qty('cheddar', 'cheddar-shredded', '1 cup shredded cheddar', 1, 'cup', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Brown the beef in a large skillet over medium-high heat, breaking it up, 5–6 minutes. Drain excess fat if needed.',
        360,
        'Brown beef',
      ),
      step(
        'Add onion and pepper; cook 4 minutes. Stir in garlic, chili powder, and cumin for 30 seconds.',
        270,
        'Soften vegetables',
      ),
      step(
        'Add rice, diced tomatoes with juices, and broth. Bring to a boil, then cover and simmer on low until the rice is tender, about 18 minutes.',
        1080,
        'Simmer rice',
      ),
      step(
        'Fluff, taste for salt and pepper, and melt cheddar over the top if using.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-baked-cod-tomatoes',
    title: 'Baked Cod with Tomatoes and Olives',
    servings: 4,
    prepMin: 10,
    cookMin: 20,
    tags: ['dinner', 'one-pan', 'weeknight', 'seafood', 'under-30'],
    ingredients: [
      qty('cod', 'cod-bulk', '1 1/2 lb cod fillets', 680, 'g'),
      qty('tomato-cherry', 'tomato-cherry-bulk', '2 cups cherry tomatoes', 300, 'g'),
      qty('olives-black', 'olives-black-bulk', '1/2 cup pitted black olives', 70, 'g'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, sliced', 3, 'each'),
      qty('oil-olive', 'oil-olive-liquid', '3 tbsp olive oil', 3, 'tbsp'),
      qty('lemon', 'lemon-each', '1 lemon', 1, 'each'),
      qty('oregano-dried', 'oregano-dried-bulk', '1 tsp dried oregano', 1, 'tsp'),
      qty('parsley-fresh', 'parsley-fresh-bulk', '2 tbsp chopped parsley', 8, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Heat the oven to 400°F. In a baking dish, toss tomatoes, olives, garlic, oregano, 2 tbsp oil, salt, and pepper.',
      ),
      step(
        'Nestle the cod into the vegetables. Drizzle with the remaining oil and the juice of half the lemon. Season the fish lightly.',
      ),
      step(
        'Bake until the cod flakes easily and the tomatoes have collapsed, 15–18 minutes.',
        960,
        'Bake cod',
      ),
      step(
        'Finish with parsley and more lemon. Spoon the pan juices over the fish when serving.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-honey-garlic-salmon',
    title: 'Honey Garlic Salmon',
    servings: 4,
    prepMin: 10,
    cookMin: 15,
    tags: ['dinner', 'weeknight', 'seafood', 'under-30', 'quick'],
    ingredients: [
      qty('salmon', 'salmon-bulk', '4 salmon fillets (about 1 1/2 lb)', 680, 'g'),
      qty('honey', 'honey-bulk', '3 tbsp honey', 63, 'g'),
      qty('soy-sauce', 'soy-sauce-liquid', '2 tbsp soy sauce', 2, 'tbsp'),
      qty('garlic', 'garlic-clove', '3 cloves garlic, minced', 3, 'each'),
      qty('lemon', 'lemon-each', '1/2 lemon', 0.5, 'each'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('butter', 'butter-tbsp', '1 tbsp butter', 1, 'tbsp'),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Pat the salmon dry and season with salt and pepper. Stir honey, soy sauce, garlic, and a squeeze of lemon in a cup.',
      ),
      step(
        'Heat the oil in a large skillet over medium-high. Place salmon skin-side up (or presentation-side down) and cook 3–4 minutes until a crust forms. Flip carefully.',
        240,
        'Sear salmon',
      ),
      step(
        'Add butter and the honey mixture. Spoon the sauce over the fish and cook until just opaque in the center, 3–5 minutes more depending on thickness.',
        240,
        'Glaze salmon',
      ),
      step('Serve with the pan sauce spooned over the top.'),
    ],
  }),
];
