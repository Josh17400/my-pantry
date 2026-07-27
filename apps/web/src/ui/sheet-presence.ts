/**
 * Nested sheet presence — no prop-drilling through screens.
 *
 * Every open sheet (or sheet-like modal) calls `acquireSheet()` and releases
 * on close/unmount. A counter (not a boolean) keeps the tab bar hidden until
 * the *last* sheet closes. The shell reads `useSheetOpenCount()` / body
 * `data-sheet-open`.
 *
 * Also owns body scroll lock + scroll restore for the open stack.
 */

import { useEffect, useSyncExternalStore } from 'react';

const BODY_ATTR = 'data-sheet-open';

let openCount = 0;
let lockedScrollY = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function syncBodyAttr(): void {
  if (typeof document === 'undefined') return;
  if (openCount > 0) {
    document.body.setAttribute(BODY_ATTR, String(openCount));
  } else {
    document.body.removeAttribute(BODY_ATTR);
  }
}

function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (openCount === 1) {
    lockedScrollY = window.scrollY;
    const { body } = document;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${lockedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
  }
}

function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (openCount === 0) {
    const { body } = document;
    body.style.overflow = '';
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    window.scrollTo(0, lockedScrollY);
  }
}

/**
 * Register one open sheet. Returns a release function (idempotent if called twice).
 * Safe to call outside React (e.g. imperative mounts).
 */
export function acquireSheet(): () => void {
  let released = false;
  openCount += 1;
  syncBodyAttr();
  lockBodyScroll();
  notify();

  return () => {
    if (released) return;
    released = true;
    openCount = Math.max(0, openCount - 1);
    syncBodyAttr();
    unlockBodyScroll();
    notify();
  };
}

export function getSheetOpenCount(): number {
  return openCount;
}

export function isAnySheetOpen(): boolean {
  return openCount > 0;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/**
 * Live open-sheet count for the shell (hide tab bar / FAB when > 0).
 */
export function useSheetOpenCount(): number {
  return useSyncExternalStore(subscribe, getSheetOpenCount, () => 0);
}

/**
 * Register presence for the lifetime of a mounted sheet-like surface.
 * Pass `active=false` to skip (e.g. controlled open prop is false).
 */
export function useSheetPresence(active = true): void {
  useEffect(() => {
    if (!active) return;
    return acquireSheet();
  }, [active]);
}

/**
 * Full open lifecycle: presence + focus restore to the element that had focus
 * before the sheet opened. Scroll lock is handled by the counter.
 */
export function useSheetLifecycle(open: boolean): void {
  useSheetPresence(open);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    return () => {
      if (
        previouslyFocused &&
        typeof previouslyFocused.focus === 'function' &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open]);
}

/** Body attribute name — useful for tests and CSS. */
export const SHEET_OPEN_BODY_ATTR = BODY_ATTR;
