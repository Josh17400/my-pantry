/**
 * Breakfast recipes — original prose for The Good Pantry starter catalog.
 */

import type { Recipe } from '../../recipes/types';
import { qty, recipe, step, taste } from './helpers';

export const breakfastRecipes: readonly Recipe[] = [
  recipe({
    id: 'recipe-spinach-scramble',
    title: 'Spinach Cheddar Scramble',
    servings: 2,
    prepMin: 5,
    cookMin: 8,
    tags: ['breakfast', 'quick', 'vegetarian', 'eggs', 'under-15'],
    ingredients: [
      qty('egg', 'egg-whole', '4 large eggs', 4, 'each'),
      qty('spinach', 'spinach-bulk', '2 handfuls baby spinach (about 2 oz)', 60, 'g'),
      qty('butter', 'butter-tbsp', '1 tbsp butter', 1, 'tbsp'),
      qty('cheddar', 'cheddar-shredded', '1/3 cup shredded cheddar', 0.33, 'cup', {
        optional: true,
      }),
      qty('milk', 'milk-liquid', '1 tbsp milk', 1, 'tbsp', { optional: true }),
      taste('salt-kosher', 'salt-kosher-bulk', 'kosher salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'black pepper to taste'),
    ],
    steps: [
      step(
        'Crack the eggs into a bowl. Add the milk if using, a pinch of salt, and a few grinds of pepper. Beat until the whites and yolks run together.',
      ),
      step(
        'Melt the butter in a nonstick skillet over medium heat. Add the spinach and cook, tossing, until it wilts and most of the moisture cooks off, about 1–2 minutes.',
        90,
        'Wilt spinach',
      ),
      step(
        'Pour in the eggs. Push and fold gently with a spatula so soft curds form, about 2–3 minutes. When the eggs are just set but still glossy, scatter the cheddar over the top and fold once more.',
        180,
        'Scramble eggs',
      ),
      step('Slide onto plates and eat while hot.'),
    ],
  }),

  recipe({
    id: 'recipe-overnight-oats',
    title: 'Overnight Oats with Berries',
    servings: 2,
    prepMin: 10,
    cookMin: 0,
    tags: ['breakfast', 'make-ahead', 'vegetarian', 'no-cook', 'meal-prep'],
    yieldNote: 'Chills overnight; 2 jars',
    ingredients: [
      qty('oats-rolled', 'oats-rolled-bulk', '1 cup rolled oats', 1, 'cup'),
      qty('milk', 'milk-liquid', '1 cup milk', 1, 'cup'),
      qty('yogurt-greek', 'yogurt-greek-bulk', '1/2 cup plain Greek yogurt', 120, 'g'),
      qty('maple-syrup', 'maple-syrup-bulk', '2 tbsp maple syrup', 40, 'g'),
      qty('chia-seeds', 'chia-seeds-bulk', '1 tbsp chia seeds', 10, 'g', {
        optional: true,
      }),
      qty('frozen-berries', 'frozen-berries-bulk', '1 cup mixed berries (fresh or frozen)', 140, 'g'),
      taste('cinnamon-ground', 'cinnamon-ground-bulk', 'pinch of cinnamon', {
        optional: true,
      }),
    ],
    steps: [
      step(
        'Stir the oats, milk, yogurt, maple syrup, and chia seeds (if using) in a bowl or divide between two jars. The mixture should look loose; the oats will thicken as they sit.',
      ),
      step('Fold in half the berries and a dusting of cinnamon if you like.'),
      step(
        'Cover and refrigerate at least 6 hours or overnight.',
        21600,
        'Chill overnight',
      ),
      step(
        'In the morning, top with the remaining berries. Thin with a splash of milk if the oats set up too firm.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-banana-pancakes',
    title: 'Banana Yogurt Pancakes',
    servings: 3,
    prepMin: 10,
    cookMin: 15,
    tags: ['breakfast', 'vegetarian', 'weekend', 'kid-friendly'],
    yieldNote: 'About 8 small pancakes',
    ingredients: [
      qty('banana', 'banana-each', '1 ripe banana', 1, 'each'),
      qty('egg', 'egg-whole', '2 large eggs', 2, 'each'),
      qty('yogurt-greek', 'yogurt-greek-bulk', '1/2 cup plain Greek yogurt', 120, 'g'),
      qty('flour-ap', 'flour-ap-bulk', '3/4 cup all-purpose flour', 0.75, 'cup'),
      qty('baking-powder', 'baking-powder-bulk', '1 tsp baking powder', 1, 'tsp'),
      qty('milk', 'milk-liquid', '1/4 cup milk', 0.25, 'cup'),
      qty('butter', 'butter-tbsp', '2 tbsp butter, for the pan', 2, 'tbsp'),
      qty('maple-syrup', 'maple-syrup-bulk', 'maple syrup for serving', 60, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'pinch of salt'),
      taste('vanilla-extract', 'vanilla-extract-liquid', 'splash of vanilla', {
        optional: true,
      }),
    ],
    steps: [
      step(
        'Mash the banana in a mixing bowl until mostly smooth. Whisk in the eggs, yogurt, milk, vanilla if using, and a pinch of salt.',
      ),
      step(
        'Sprinkle the flour and baking powder over the wet mix. Fold just until no dry pockets remain; a few lumps are fine.',
      ),
      step(
        'Heat a skillet over medium and melt a little butter. Drop batter by 1/4-cup scoops. Cook until bubbles form on top and the edges look set, about 2–3 minutes, then flip and cook until golden.',
        150,
        'First side',
      ),
      step(
        'Repeat with the remaining batter, adding butter as needed. Serve stacked with maple syrup.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-avocado-egg-toast',
    title: 'Avocado Toast with Fried Egg',
    servings: 2,
    prepMin: 5,
    cookMin: 8,
    tags: ['breakfast', 'quick', 'vegetarian', 'under-15'],
    ingredients: [
      qty('bread-sourdough', 'bread-sourdough-bulk', '2 thick slices sourdough (or sandwich bread)', 80, 'g'),
      qty('avocado', 'avocado-bulk', '1 ripe avocado', 150, 'g'),
      qty('egg', 'egg-whole', '2 large eggs', 2, 'each'),
      qty('butter', 'butter-tbsp', '1 tbsp butter', 1, 'tbsp'),
      qty('lemon', 'lemon-each', '1/2 lemon', 0.5, 'each'),
      qty('red-pepper-flakes', 'red-pepper-flakes-bulk', 'pinch of red pepper flakes', 1, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'kosher salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'black pepper to taste'),
    ],
    steps: [
      step('Toast the bread until deep golden and crisp at the edges.'),
      step(
        'Halve the avocado, scoop the flesh into a bowl, and mash with a squeeze of lemon, salt, and pepper until spreadable but still a little chunky.',
      ),
      step(
        'Melt the butter in a small skillet over medium heat. Crack in the eggs and cook sunny-side up or over-easy until the whites set, about 3 minutes.',
        180,
        'Fry eggs',
      ),
      step(
        'Spread avocado on the toast, top each slice with an egg, and finish with pepper flakes if you want heat.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-breakfast-burrito',
    title: 'Weekday Breakfast Burrito',
    servings: 4,
    prepMin: 10,
    cookMin: 15,
    tags: ['breakfast', 'make-ahead', 'freezer-friendly', 'kid-friendly'],
    ingredients: [
      qty('egg', 'egg-whole', '6 large eggs', 6, 'each'),
      qty('sausage-breakfast', 'sausage-breakfast-bulk', '8 oz breakfast sausage', 227, 'g'),
      qty('cheddar', 'cheddar-shredded', '1 cup shredded cheddar', 1, 'cup'),
      qty('tortilla-flour', 'tortilla-flour-bulk', '4 large flour tortillas (about 10-inch)', 170, 'g'),
      qty('onion', 'onion-whole', '1/2 yellow onion, diced', 0.5, 'each'),
      qty('bell-pepper-green', 'bell-pepper-green-bulk', '1 green bell pepper, diced', 150, 'g'),
      qty('oil-olive', 'oil-olive-liquid', '1 tbsp oil', 1, 'tbsp'),
      qty('salsa', 'salsa-bulk', '1/2 cup salsa, for serving', 120, 'g', {
        optional: true,
      }),
      taste('salt-kosher', 'salt-kosher-bulk', 'salt to taste'),
      taste('pepper-black', 'pepper-black-bulk', 'pepper to taste'),
    ],
    steps: [
      step(
        'Warm the oil in a large skillet over medium heat. Crumble in the sausage and cook until browned, 5–6 minutes. Scoop onto a plate, leaving the fat in the pan.',
        330,
        'Brown sausage',
      ),
      step(
        'Add the onion and pepper to the same skillet. Cook until softened, about 4 minutes.',
        240,
        'Soften vegetables',
      ),
      step(
        'Beat the eggs with salt and pepper. Pour into the skillet, scramble until just set, then stir the sausage back in and kill the heat. Fold in the cheddar so it melts in the residual heat.',
        180,
        'Scramble',
      ),
      step(
        'Warm the tortillas. Divide the filling, roll tightly, and serve with salsa. Wrap extras in foil and refrigerate up to 3 days or freeze.',
      ),
    ],
  }),

  recipe({
    id: 'recipe-yogurt-berry-parfait',
    title: 'Greek Yogurt Berry Parfait',
    servings: 2,
    prepMin: 8,
    cookMin: 0,
    tags: ['breakfast', 'quick', 'vegetarian', 'no-cook', 'under-15'],
    ingredients: [
      qty('yogurt-greek', 'yogurt-greek-bulk', '2 cups plain Greek yogurt', 480, 'g'),
      qty('blueberry', 'blueberry-bulk', '1 cup blueberries', 150, 'g'),
      qty('strawberry', 'strawberry-bulk', '1 cup strawberries, sliced', 150, 'g'),
      qty('cereal-granola', 'cereal-granola-bulk', '1/2 cup granola', 50, 'g'),
      qty('honey', 'honey-bulk', '2 tbsp honey', 42, 'g'),
      qty('almonds', 'almonds-bulk', '2 tbsp sliced or chopped almonds', 15, 'g', {
        optional: true,
      }),
    ],
    steps: [
      step(
        'Spoon a layer of yogurt into each glass or bowl. Drizzle with a little honey.',
      ),
      step(
        'Add a layer of berries, then granola. Repeat until the cups are full, finishing with fruit and almonds if using.',
      ),
      step('Serve right away so the granola stays crunchy.'),
    ],
  }),

  recipe({
    id: 'recipe-cinnamon-oatmeal',
    title: 'Brown Sugar Cinnamon Oatmeal',
    servings: 2,
    prepMin: 3,
    cookMin: 10,
    tags: ['breakfast', 'quick', 'vegetarian', 'under-15', 'comfort'],
    ingredients: [
      qty('oats-rolled', 'oats-rolled-bulk', '1 cup rolled oats', 1, 'cup'),
      qty('milk', 'milk-liquid', '1 1/2 cups milk', 1.5, 'cup'),
      qty('water-bottled', 'water-bottled-liquid', '1/2 cup water', 0.5, 'cup'),
      qty('sugar-brown', 'sugar-brown-bulk', '2 tbsp packed brown sugar', 25, 'g'),
      qty('butter', 'butter-tbsp', '1 tbsp butter', 1, 'tbsp', { optional: true }),
      qty('raisins', 'raisins-bulk', '1/4 cup raisins', 40, 'g', { optional: true }),
      qty('cinnamon-ground', 'cinnamon-ground-bulk', '1/2 tsp ground cinnamon', 0.5, 'tsp'),
      taste('salt-kosher', 'salt-kosher-bulk', 'pinch of salt'),
    ],
    steps: [
      step(
        'Combine the oats, milk, water, cinnamon, and a pinch of salt in a small saucepan. Bring to a gentle simmer over medium heat.',
      ),
      step(
        'Cook, stirring often, until the oats are creamy and most of the liquid is absorbed, 5–8 minutes.',
        360,
        'Simmer oats',
      ),
      step(
        'Stir in the brown sugar, butter if using, and raisins. Divide between bowls and serve warm.',
      ),
    ],
  }),
];
