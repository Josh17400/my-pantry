import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';
type CardVariant = 'default' | 'raised' | 'tint';

export type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: CardPadding;
  variant?: CardVariant;
  /** Soft tint wash — decorative location cards */
  tint?: 'sage' | 'tan' | 'sky' | 'cream';
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

const paddingMap: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

const tintBg: Record<NonNullable<CardProps['tint']>, string> = {
  sage: 'bg-tint-sage',
  tan: 'bg-tint-tan',
  sky: 'bg-tint-sky',
  cream: 'bg-tint-cream',
};

/**
 * Soft elevated surface — ~18px radius, generous padding, warm shadow.
 */
export function Card({
  children,
  className,
  padding = 'md',
  variant = 'default',
  tint,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card shadow-card',
        paddingMap[padding],
        variant === 'raised' && 'bg-surface-raised',
        variant === 'default' && !tint && 'bg-surface',
        tint && tintBg[tint],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
