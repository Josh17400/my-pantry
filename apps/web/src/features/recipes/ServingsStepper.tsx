import { cn } from '../../ui/cn';

type ServingsStepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
  label?: string;
  disabled?: boolean;
};

/**
 * Servings control — 44px tap targets, live rescale callers use scaleRecipe/planCook.
 */
export function ServingsStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  className,
  label = 'Servings',
  disabled = false,
}: ServingsStepperProps) {
  const dec = () => {
    if (disabled) return;
    onChange(Math.max(min, value - 1));
  };
  const inc = () => {
    if (disabled) return;
    onChange(Math.min(max, value + 1));
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      <div className="inline-flex items-center rounded-pill bg-surface shadow-card">
        <button
          type="button"
          onClick={dec}
          disabled={disabled || value <= min}
          aria-label="Decrease servings"
          className={cn(
            'flex min-h-tap min-w-tap items-center justify-center rounded-l-pill text-lg font-semibold text-primary',
            'disabled:opacity-40',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        >
          −
        </button>
        <span
          className="min-w-[2.5rem] text-center font-display text-lg font-semibold text-ink"
          aria-live="polite"
        >
          {value}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={disabled || value >= max}
          aria-label="Increase servings"
          className={cn(
            'flex min-h-tap min-w-tap items-center justify-center rounded-r-pill text-lg font-semibold text-primary',
            'disabled:opacity-40',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        >
          +
        </button>
      </div>
    </div>
  );
}
