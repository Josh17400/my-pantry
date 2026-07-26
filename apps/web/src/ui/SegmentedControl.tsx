import type { ReactNode } from 'react';

import { cn } from './cn';

export type SegmentOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

type SegmentedControlProps<T extends string = string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Accessible name for the control group */
  'aria-label'?: string;
};

/**
 * Pill segmented control (Overview / Recipes / Fridge / Pantry).
 * Active segment uses primary olive fill + white label.
 */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel = 'Section',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        // min-w-0 keeps the pill rail from expanding the page (flex overflow trap).
        'flex min-w-0 w-full max-w-full gap-1 overflow-x-auto rounded-pill bg-surface p-1 shadow-card scrollbar-none touch-pan-x',
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex min-h-tap min-w-0 flex-1 items-center justify-center gap-1.5 rounded-pill px-2 py-2 text-xs font-medium transition-colors sm:px-3.5 sm:text-sm',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              selected
                ? 'bg-primary text-white shadow-sm'
                : 'bg-transparent text-ink-muted hover:text-ink',
            )}
          >
            {opt.icon ? (
              <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
                {opt.icon}
              </span>
            ) : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
