import { cn } from '../../ui/cn';

type AllergenUnknownBadgeProps = {
  className?: string;
  /** Compact chip vs inline warning */
  compact?: boolean;
};

/**
 * Safety flag for free-text / unmatched lines.
 * Unknown allergens must never be treated as clear.
 */
export function AllergenUnknownBadge({
  className,
  compact = false,
}: AllergenUnknownBadgeProps) {
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1 rounded-pill font-medium',
        compact
          ? 'bg-critical/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-critical'
          : 'bg-critical/10 px-2.5 py-1 text-xs text-critical',
        className,
      )}
      title="Allergens unknown — treat as unsafe"
    >
      <span aria-hidden>⚠</span>
      {compact ? 'Allergens unknown' : 'Allergens unknown — treat as unsafe'}
    </span>
  );
}
