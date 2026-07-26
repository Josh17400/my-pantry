/**
 * Offline receipt image queue — scan when connectivity returns.
 * Images are already compressed client-side before enqueue.
 */

import type { CompressedImage } from './types';

const STORAGE_KEY = 'tgp.receipt.offline-queue.v1';

export type QueuedReceipt = {
  readonly id: string;
  readonly enqueuedAt: string;
  readonly images: readonly CompressedImage[];
  readonly locale?: string;
};

export type OfflineQueue = {
  list(): QueuedReceipt[];
  enqueue(images: readonly CompressedImage[], locale?: string): QueuedReceipt;
  remove(id: string): void;
  clear(): void;
};

function readRaw(): QueuedReceipt[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QueuedReceipt[];
  } catch {
    return [];
  }
}

function writeRaw(items: readonly QueuedReceipt[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `q_${crypto.randomUUID()}`;
  }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const localOfflineQueue: OfflineQueue = {
  list: () => readRaw(),
  enqueue: (images, locale) => {
    const item: QueuedReceipt = {
      id: newId(),
      enqueuedAt: new Date().toISOString(),
      images: [...images],
      locale,
    };
    writeRaw([...readRaw(), item]);
    return item;
  },
  remove: (id) => {
    writeRaw(readRaw().filter((q) => q.id !== id));
  },
  clear: () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  },
};

export function createMemoryOfflineQueue(
  initial: readonly QueuedReceipt[] = [],
): OfflineQueue {
  let items = [...initial];
  return {
    list: () => [...items],
    enqueue: (images, locale) => {
      const item: QueuedReceipt = {
        id: newId(),
        enqueuedAt: new Date().toISOString(),
        images: [...images],
        locale,
      };
      items = [...items, item];
      return item;
    },
    remove: (id) => {
      items = items.filter((q) => q.id !== id);
    },
    clear: () => {
      items = [];
    },
  };
}

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}
