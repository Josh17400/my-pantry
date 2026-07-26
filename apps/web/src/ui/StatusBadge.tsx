import { cn } from './cn';
import type { StatusBand } from './tokens';
import { statusFillColor, statusTextColor } from './tokens';

type StatusBadgeProps = {
  status: StatusBand;
  /** Override default label */
  label?: string;
  className?: string;
  /** Show colored dot before text */
  showDot?: boolean;
};

const defaultLabels: Record<StatusBand, string> = {
  fresh: 'Fresh',
  low: 'Getting low',
  critical: 'Almost empty',
};

/**
 * Status chip with optional fill-dot + contrast-safe text color.
 * Dot uses low-fill for "low"; text always uses `low` (#8F5410).
 */
export function StatusBadge({
  status,
  label,
  className,
  showDot = true,
}: StatusBadgeProps) {
  const text = label ?? defaultLabels[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        className,
      )}
      style={{ color: statusTextColor[status] }}
    >
      {showDot ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: statusFillColor[status] }}
          aria-hidden
        />
      ) : null}
      {text}
    </span>
  );
}
