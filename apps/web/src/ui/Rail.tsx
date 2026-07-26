import type { ReactNode } from 'react';

import { cn } from './cn';

type RailProps = {
  title: string;
  children: ReactNode;
  className?: string;
  /** "See all" affordance — omit to hide */
  onSeeAll?: () => void;
  seeAllLabel?: string;
  /** Optional trailing control (e.g. dropdown) instead of See all */
  trailing?: ReactNode;
};

/**
 * Horizontal scroller section with serif title + "See all".
 */
export function Rail({
  title,
  children,
  className,
  onSeeAll,
  seeAllLabel = 'See all',
  trailing,
}: RailProps) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
        {trailing ??
          (onSeeAll ? (
            <button
              type="button"
              onClick={onSeeAll}
              data-testid="rail-see-all"
              className="min-h-tap shrink-0 px-1 text-sm font-medium text-ink-muted transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {seeAllLabel}
            </button>
          ) : null)}
      </div>
      {/*
        Intentional horizontal rail only — page shell must not scroll sideways.
        touch-action: pan-x lets vertical gestures pass through to the page so
        a finger that starts on fridge/pantry icons can still scroll down.
      */}
      <div
        data-testid="horizontal-rail"
        className="-mx-1 flex max-w-full gap-3 overflow-x-auto px-1 pb-1 scrollbar-none touch-pan-x"
      >
        {children}
      </div>
    </section>
  );
}
