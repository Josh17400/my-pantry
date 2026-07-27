/**
 * Pantry form helpers + re-export of the shared sheet primitive.
 * Modal chrome lives in ui/Sheet; do not re-implement fixed overlays here.
 */
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

import { cn } from '../../../ui/cn';
export type { SheetProps } from '../../../ui/Sheet';
export { Sheet } from '../../../ui/Sheet';

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted"
    >
      {children}
    </label>
  );
}

export function FieldInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      className={cn(
        'min-h-tap w-full rounded-2xl border border-black/[0.06] bg-surface px-3 text-base text-ink placeholder:text-ink-muted/70',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
      {...rest}
    />
  );
}

export function FieldSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select
      className={cn(
        'min-h-tap w-full rounded-2xl border border-black/[0.06] bg-surface px-3 text-base text-ink',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, children, type = 'button', ...rest } = props;
  return (
    <button
      type={type}
      className={cn(
        'min-h-tap w-full rounded-pill bg-primary px-4 text-sm font-semibold text-white shadow-sm',
        'disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, children, type = 'button', ...rest } = props;
  return (
    <button
      type={type}
      className={cn(
        'min-h-tap w-full rounded-pill bg-bg px-4 text-sm font-semibold text-ink',
        'disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export type { ChangeEvent };
