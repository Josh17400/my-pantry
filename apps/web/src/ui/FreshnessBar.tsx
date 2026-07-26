import { cn } from './cn';
import type { StatusBand } from './tokens';
import { statusFillColor, statusTextColor } from './tokens';

type FreshnessBarProps = {
  /** 0–1 remaining fraction (1 = full / fresh) */
  value: number;
  status: StatusBand;
  /** e.g. "3 days left", "1 week left" */
  label: string;
  className?: string;
  /** Hide the text label (bar only) */
  showLabel?: boolean;
};

/**
 * Progress bar + day count, colored by status band.
 * Fill uses statusFillColor (low-fill for low); label uses statusTextColor.
 */
export function FreshnessBar({
  value,
  status,
  label,
  className,
  showLabel = true,
}: FreshnessBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const fill = statusFillColor[status];
  const text = statusTextColor[status];

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div
        className="h-1.5 min-w-[3.5rem] flex-1 overflow-hidden rounded-full bg-bar-track"
        role="progressbar"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${clamped * 100}%`, backgroundColor: fill }}
        />
      </div>
      {showLabel ? (
        <span
          className="shrink-0 text-xs font-medium tabular-nums"
          style={{ color: text }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
