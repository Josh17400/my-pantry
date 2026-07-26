import type { ReactNode } from 'react';

import { cn } from './cn';
import type { StatusBand } from './tokens';
import { statusTextColor } from './tokens';

type StatusTextProps = {
  status: StatusBand;
  children: ReactNode;
  className?: string;
  /** large = ≥18pt / 14pt bold → 3:1 is OK; still uses AA-safe tokens */
  size?: 'sm' | 'md';
};

/**
 * Colored status copy only — never uses low-fill.
 * "2 days", "Getting low", "Plenty", etc.
 */
export function StatusText({
  status,
  children,
  className,
  size = 'sm',
}: StatusTextProps) {
  return (
    <span
      className={cn(
        'font-medium',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className,
      )}
      style={{ color: statusTextColor[status] }}
    >
      {children}
    </span>
  );
}
