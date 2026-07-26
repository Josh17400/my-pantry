import { cn } from '../../../ui/cn';
import { confidenceOf, formatProvenanceLine } from '../lib/provenance-display';
import type { ProvenanceFields } from '../lib/provenance-display';

type ProvenanceLineProps = {
  fields: ProvenanceFields;
  nowMs?: number;
  className?: string;
  size?: 'sm' | 'md';
};

/**
 * Always shown next to a quantity — never render a number without this.
 */
export function ProvenanceLine({
  fields,
  nowMs,
  className,
  size = 'sm',
}: ProvenanceLineProps) {
  const line = formatProvenanceLine(fields, nowMs);
  const confidence = confidenceOf(fields, nowMs);
  const muted = confidence === 'verified';

  return (
    <p
      className={cn(
        'truncate',
        size === 'sm' ? 'text-xs' : 'text-sm',
        muted ? 'text-ink-muted' : 'text-low',
        className,
      )}
      title={line}
    >
      {line}
    </p>
  );
}
