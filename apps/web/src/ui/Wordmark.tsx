import { cn } from './cn';
import { LeafIcon } from './LeafIcon';

type WordmarkProps = {
  className?: string;
  /** Show tagline under the name */
  showTagline?: boolean;
  tagline?: string;
  /** Size preset — narrow lockup verified at 320px */
  size?: 'sm' | 'md' | 'lg';
};

const sizeMap = {
  sm: {
    text: 'text-xl leading-tight',
    leaf: 'h-4 w-4',
    tag: 'text-[0.65rem] leading-snug',
    gap: 'gap-1',
  },
  md: {
    text: 'text-2xl leading-tight sm:text-[1.75rem]',
    leaf: 'h-5 w-5',
    tag: 'text-xs leading-snug',
    gap: 'gap-1.5',
  },
  lg: {
    text: 'text-3xl leading-tight',
    leaf: 'h-6 w-6',
    tag: 'text-sm leading-snug',
    gap: 'gap-2',
  },
} as const;

/**
 * "The Good Pantry" wordmark — display serif + leaf.
 * Longer than mockup "Larder"; lockup is compact at 320px.
 */
export function Wordmark({
  className,
  showTagline = false,
  tagline = 'Everything in its place.',
  size = 'md',
}: WordmarkProps) {
  const s = sizeMap[size];

  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn('flex items-center', s.gap)}>
        <LeafIcon
          className={cn('shrink-0 text-primary', s.leaf)}
          title="The Good Pantry"
        />
        <span
          className={cn(
            'font-display font-semibold tracking-tight text-ink',
            s.text,
          )}
        >
          The Good&nbsp;Pantry
        </span>
      </div>
      {showTagline ? (
        <p
          className={cn(
            'mt-0.5 max-w-[16rem] font-sans text-ink-muted',
            s.tag,
          )}
        >
          {tagline}
        </p>
      ) : null}
    </div>
  );
}
