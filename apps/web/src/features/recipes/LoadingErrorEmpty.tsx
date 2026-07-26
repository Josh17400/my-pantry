import { Link } from 'react-router-dom';

import { cn } from '../../ui/cn';

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-[12rem] flex-col items-center justify-center gap-2 text-ink-muted"
    >
      <div
        className="h-8 w-8 animate-pulse rounded-full bg-primary/20"
        aria-hidden
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border border-critical/20 bg-critical/5 p-4 text-sm text-critical"
    >
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-critical/90">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-tap rounded-pill bg-primary px-4 text-sm font-semibold text-white"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function RecipesEmptyState({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-card bg-surface px-6 py-12 text-center shadow-card',
        className,
      )}
    >
      <p className="font-display text-xl font-semibold text-ink">
        No recipes yet
      </p>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">
        Add your first recipe, or browse once community recipes land. Cooking
        is how the pantry updates itself.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link
          to="/recipes/new"
          className="inline-flex min-h-tap items-center justify-center rounded-pill bg-primary px-5 text-sm font-semibold text-white"
        >
          Create a recipe
        </Link>
        <Link
          to="/recipes"
          className="inline-flex min-h-tap items-center justify-center rounded-pill border border-black/[0.08] bg-surface-raised px-5 text-sm font-semibold text-ink"
        >
          Browse recipes
        </Link>
      </div>
    </div>
  );
}
