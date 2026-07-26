import { cn } from './cn';

type AdSlotProps = {
  /**
   * Paid tier hides ads entirely.
   * Free tier shows a correctly-sized in-feed placeholder.
   */
  paidTier?: boolean;
  className?: string;
  /** For gallery / review — force visible even if paid */
  forceShow?: boolean;
};

/**
 * In-feed ad reservation — NOT pinned above the tab bar.
 *
 * AdMob forbids banners adjacent to navigation / interactive controls
 * (accidental-click policy). This slot is a home-feed card, well clear
 * of the bottom tab bar + FAB. Sized for a standard medium rectangle /
 * large banner feel (~320×100–120 logical px on phone).
 *
 * Renders nothing when `paidTier` is true.
 */
export function AdSlot({
  paidTier = false,
  className,
  forceShow = false,
}: AdSlotProps) {
  if (paidTier && !forceShow) {
    return null;
  }

  return (
    <aside
      className={cn(
        'w-full overflow-hidden rounded-card border border-dashed border-ink-muted/25 bg-surface',
        className,
      )}
      aria-label="Advertisement"
      data-ad-slot="in-feed"
    >
      <div className="flex min-h-[100px] flex-col items-center justify-center gap-1 px-4 py-5 text-center">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-muted/70">
          Ad
        </span>
        <span className="max-w-[14rem] text-xs text-ink-muted">
          Sponsored placement · free tier · in-feed only
        </span>
      </div>
    </aside>
  );
}
