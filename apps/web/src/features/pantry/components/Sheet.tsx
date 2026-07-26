import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

import { cn } from '../../../ui/cn';

type SheetProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Bottom sheet for mobile-first forms (adjust, recount, add item).
 * 44px close target; safe-area aware.
 */
export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  className,
}: SheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/30"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-surface-raised shadow-fab',
          'pb-[max(1rem,env(safe-area-inset-bottom))]',
          className,
        )}
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-black/[0.04] bg-surface-raised px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2
              id="sheet-title"
              className="font-display text-xl font-semibold text-ink"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-ink-muted hover:bg-bg"
            aria-label="Close sheet"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-col gap-2 border-t border-black/[0.04] px-4 pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
