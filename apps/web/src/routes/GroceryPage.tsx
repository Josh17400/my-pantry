import { GroceryScreen } from '../features/grocery';

/**
 * Route entry for the grocery list.
 * Wired by shell when product tabs land; safe to mount standalone for preview.
 */
export function GroceryPage() {
  return (
    <div className="min-h-screen bg-bg">
      <GroceryScreen />
    </div>
  );
}
