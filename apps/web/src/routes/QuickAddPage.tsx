import { QuickScreen } from '../features/quick';

/**
 * Route entry for one-tap quick-consume items.
 * Intended as the FAB / home one-tap destination — not a recipe flow.
 */
export function QuickAddPage() {
  return (
    <div className="min-h-screen bg-bg">
      <QuickScreen />
    </div>
  );
}
