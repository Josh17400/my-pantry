import { cn } from '../../../ui/cn';
import { Z_CLASS } from '../../../ui/layers';

type UndoToastProps = {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  className?: string;
};

/**
 * Transient undo affordance after destructive-feeling ledger writes.
 * Undo issues a compensating txn (caller owns that).
 * z-toast sits above sheets so undo stays reachable after a sheet write.
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
  className,
}: UndoToastProps) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-white shadow-fab',
        Z_CLASS.toast,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <p className="min-w-0 flex-1 text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={onUndo}
        className="min-h-tap shrink-0 rounded-pill bg-white/15 px-3 text-sm font-semibold uppercase tracking-wide"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="min-h-tap min-w-tap shrink-0 text-sm text-white/80"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
