import { cn } from '../../ui';
import { sourceLabelsFor, sourceToneClass } from './source-labels';

type SourceChipsProps = {
  sources: readonly string[];
  className?: string;
};

/** Provenance chips — why this line is on the list. */
export function SourceChips({ sources, className }: SourceChipsProps) {
  const labels = sourceLabelsFor(sources);
  if (labels.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {labels.map((s) => (
        <span
          key={s.kind}
          className={cn(
            'inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium leading-tight',
            sourceToneClass(s.tone),
          )}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}
