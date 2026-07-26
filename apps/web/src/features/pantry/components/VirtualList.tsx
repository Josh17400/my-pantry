/**
 * Windowed virtual list — no extra deps.
 * Renders only visible rows (+ overscan) for ~500-item pantry responsiveness.
 */

import {
  type CSSProperties,
  type ReactNode,
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type VirtualListProps<T> = {
  items: readonly T[];
  /** Fixed row height in px (headers and items share estimate). */
  rowHeight: number;
  /** Optional per-row height override. */
  getRowHeight?: (item: T, index: number) => number;
  overscan?: number;
  className?: string;
  style?: CSSProperties;
  renderRow: (item: T, index: number) => ReactNode;
  /** Accessible list label */
  'aria-label'?: string;
};

function defaultHeight<T>(
  _item: T,
  _index: number,
  rowHeight: number,
): number {
  return rowHeight;
}

export function VirtualList<T>({
  items,
  rowHeight,
  getRowHeight,
  overscan = 6,
  className,
  style,
  renderRow,
  'aria-label': ariaLabel = 'List',
}: VirtualListProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  const heights = useMemo(() => {
    const fn = getRowHeight ?? ((item: T, i: number) => defaultHeight(item, i, rowHeight));
    return items.map((item, i) => fn(item, i));
  }, [items, getRowHeight, rowHeight]);

  const offsets = useMemo(() => {
    const out = new Array<number>(heights.length);
    let acc = 0;
    for (let i = 0; i < heights.length; i++) {
      out[i] = acc;
      acc += heights[i]!;
    }
    return out;
  }, [heights]);

  const totalHeight = useMemo(
    () => heights.reduce((s, h) => s + h, 0),
    [heights],
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Binary search first visible index
  let start = 0;
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const top = offsets[mid]!;
    const bottom = top + heights[mid]!;
    if (bottom < scrollTop) lo = mid + 1;
    else {
      start = mid;
      hi = mid - 1;
    }
  }
  start = Math.max(0, start - overscan);

  let end = start;
  const viewBottom = scrollTop + viewportH;
  while (end < items.length && offsets[end]! < viewBottom) {
    end += 1;
  }
  end = Math.min(items.length, end + overscan);

  const slice = items.slice(start, end);

  return (
    <div
      ref={scrollerRef}
      className={className}
      style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', ...style }}
      onScroll={onScroll}
      role="list"
      aria-label={ariaLabel}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {slice.map((item, i) => {
          const index = start + i;
          const top = offsets[index]!;
          const height = heights[index]!;
          return (
            <div
              key={index}
              role="listitem"
              style={{
                position: 'absolute',
                top,
                left: 0,
                right: 0,
                height,
              }}
            >
              {renderRow(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
