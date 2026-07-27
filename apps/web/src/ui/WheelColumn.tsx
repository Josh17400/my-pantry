/**
 * Single iOS-style scroll-snap picker column.
 * role="listbox" with arrow-key support and a centred selection band.
 */

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';

import { cn } from './cn';
import { selectionTick } from './haptics';

export type WheelOption = {
  value: string;
  label: string;
};

export type WheelColumnProps = {
  options: readonly WheelOption[];
  value: string;
  onChange: (value: string) => void;
  'aria-label': string;
  /** data-testid for chrome / interactivity harnesses */
  'data-testid'?: string;
  className?: string;
  /** Row height in px — min 44 for touch targets. */
  rowHeight?: number;
  /** Visible rows (odd preferred so selection is centered). */
  visibleRows?: number;
};

const DEFAULT_ROW = 44;
const DEFAULT_VISIBLE = 5;

export function WheelColumn({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  'data-testid': testId,
  className,
  rowHeight = DEFAULT_ROW,
  visibleRows = DEFAULT_VISIBLE,
}: WheelColumnProps) {
  const listId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const suppressScrollRef = useRef(false);
  const lastIndexRef = useRef(-1);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const padRows = Math.floor(visibleRows / 2);
  const height = rowHeight * visibleRows;

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const el = scrollerRef.current;
      if (!el) return;
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      suppressScrollRef.current = true;
      el.scrollTo({
        top: index * rowHeight,
        behavior: reduced ? 'auto' : behavior,
      });
      // Release suppress after scroll settles
      window.setTimeout(() => {
        suppressScrollRef.current = false;
      }, reduced ? 50 : 320);
    },
    [rowHeight],
  );

  // Sync scroll position when value changes externally
  useEffect(() => {
    if (selectedIndex < 0) return;
    if (lastIndexRef.current === selectedIndex) return;
    lastIndexRef.current = selectedIndex;
    scrollToIndex(selectedIndex, 'auto');
  }, [selectedIndex, scrollToIndex]);

  const commitIndex = useCallback(
    (index: number, haptic: boolean) => {
      const clamped = Math.max(0, Math.min(options.length - 1, index));
      const opt = options[clamped];
      if (!opt) return;
      if (opt.value !== value) {
        onChange(opt.value);
        if (haptic) void selectionTick();
      }
      lastIndexRef.current = clamped;
    },
    [onChange, options, value],
  );

  const onScroll = useCallback(() => {
    if (suppressScrollRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;

    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / rowHeight);
      const clamped = Math.max(0, Math.min(options.length - 1, idx));
      // Snap cleanly to row
      suppressScrollRef.current = true;
      el.scrollTo({ top: clamped * rowHeight, behavior: 'auto' });
      window.setTimeout(() => {
        suppressScrollRef.current = false;
      }, 40);
      commitIndex(clamped, true);
    }, 80);
  }, [commitIndex, options.length, rowHeight]);

  useEffect(() => {
    return () => {
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (options.length === 0) return;
    let next = selectedIndex;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      next = Math.min(options.length - 1, selectedIndex + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      next = Math.max(0, selectedIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = options.length - 1;
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      next = Math.min(options.length - 1, selectedIndex + visibleRows);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      next = Math.max(0, selectedIndex - visibleRows);
    } else {
      return;
    }
    commitIndex(next, true);
    scrollToIndex(next);
  }

  const activeId = `${listId}-opt-${selectedIndex}`;

  return (
    <div
      className={cn('relative min-w-0 flex-1 select-none', className)}
      data-testid={testId}
      data-picker-wheel="true"
    >
      {/* Centred selection band */}
      <div
        className="pointer-events-none absolute inset-x-1 z-10 rounded-xl border border-primary/25 bg-primary/[0.06]"
        style={{
          top: padRows * rowHeight,
          height: rowHeight,
        }}
        aria-hidden
      />
      {/* Fade masks */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-surface-raised to-transparent"
        style={{ height: padRows * rowHeight }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-surface-raised to-transparent"
        style={{ height: padRows * rowHeight }}
        aria-hidden
      />

      <div
        ref={scrollerRef}
        role="listbox"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-activedescendant={activeId}
        className={cn(
          'relative z-0 overflow-y-auto overscroll-contain outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
        style={{
          height,
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
      >
        {/* Top spacer so first option can centre */}
        <div style={{ height: padRows * rowHeight }} aria-hidden />
        {options.map((opt, i) => {
          const selected = opt.value === value;
          return (
            <div
              key={`${opt.value}-${i}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={selected}
              data-wheel-option={opt.value}
              className={cn(
                'flex items-center justify-center px-1 text-center text-base tabular-nums',
                selected
                  ? 'font-semibold text-ink'
                  : 'font-normal text-ink-muted',
              )}
              style={{
                height: rowHeight,
                minHeight: rowHeight,
                scrollSnapAlign: 'center',
              }}
              onClick={() => {
                commitIndex(i, true);
                scrollToIndex(i);
              }}
            >
              {opt.label}
            </div>
          );
        })}
        {/* Bottom spacer */}
        <div style={{ height: padRows * rowHeight }} aria-hidden />
      </div>
    </div>
  );
}
