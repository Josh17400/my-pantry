import { cn } from './cn';

type FabProps = {
  onClick?: () => void;
  className?: string;
  /** Accessible label */
  label?: string;
  disabled?: boolean;
};

/**
 * Floating olive + button, centered over the tab bar.
 * Parent layout typically positions with absolute/fixed.
 */
export function Fab({
  onClick,
  className,
  label = 'Add item',
  disabled = false,
}: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-fab',
        'transition-transform active:scale-95',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:pointer-events-none disabled:opacity-50',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-7 w-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
