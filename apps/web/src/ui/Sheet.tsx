import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react';

import { cn } from './cn';
import { Z_CLASS } from './layers';
import { useSheetLifecycle } from './sheet-presence';

export type SheetProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Optional test id on the dialog root (default app-sheet). */
  'data-testid'?: string;
};

/**
 * Shared bottom sheet primitive for mobile-first forms and confirmations.
 *
 * - Registers with sheet-presence (hides tab bar / FAB while open; nested-safe)
 * - Locks body scroll for the open stack; restores focus on close
 * - Renders at z-sheet so it always sits above shell chrome (z-chrome)
 * - 44px close target; safe-area aware
 */
export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  className,
  'data-testid': testId = 'app-sheet',
}: SheetProps) {
  useSheetLifecycle(open);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the sheet when it opens (a11y).
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel).focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 flex flex-col justify-end',
        Z_CLASS.sheet,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      data-sheet="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/30"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative z-10 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-surface-raised shadow-fab outline-none',
          'pb-[max(1rem,env(safe-area-inset-bottom))]',
          className,
        )}
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-black/[0.04] bg-surface-raised px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
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
          <div
            className="flex flex-col gap-2 border-t border-black/[0.04] px-4 pt-3"
            data-testid="sheet-footer"
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
