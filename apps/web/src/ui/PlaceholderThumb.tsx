import { cn } from './cn';
import { LeafIcon } from './LeafIcon';
import type { TintName } from './tokens';

const tintClass: Record<TintName, string> = {
  sage: 'bg-tint-sage',
  tan: 'bg-tint-tan',
  sky: 'bg-tint-sky',
  cream: 'bg-tint-cream',
};

type PlaceholderThumbProps = {
  /** Ingredient / item name — first letter used as monogram */
  name: string;
  tint?: TintName;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

const sizeMap = {
  sm: { box: 'h-12 w-12', letter: 'text-lg', leaf: 'h-3 w-3' },
  md: { box: 'h-16 w-16', letter: 'text-2xl', leaf: 'h-3.5 w-3.5' },
  lg: { box: 'h-24 w-24', letter: 'text-4xl', leaf: 'h-5 w-5' },
} as const;

/**
 * Deliberate placeholder until food photography ships.
 * Leaf motif + bold initial on a warm tint wash — never looks broken.
 */
export function PlaceholderThumb({
  name,
  tint = 'cream',
  className,
  size = 'md',
}: PlaceholderThumbProps) {
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  const s = sizeMap[size];

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl',
        tintClass[tint],
        s.box,
        className,
      )}
      role="img"
      aria-label={`${name} (placeholder)`}
    >
      <LeafIcon
        className={cn(
          'absolute right-1 top-1 text-primary/25',
          s.leaf,
        )}
      />
      <span
        className={cn(
          'font-display font-semibold leading-none text-primary',
          s.letter,
        )}
      >
        {initial}
      </span>
    </div>
  );
}
