import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppendTxnInput } from '../../../db/types';
import { buildUndoTxn, type UndoPayload } from '../lib/txn-builders';

const UNDO_MS = 8000;

export type UndoState = {
  message: string;
  payload: UndoPayload;
} | null;

/**
 * After destructive-feeling actions, hold a compensating-txn plan briefly.
 */
export function useUndoStack(
  appendTxn: (txn: AppendTxnInput) => Promise<void>,
) {
  const [undo, setUndo] = useState<UndoState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setUndo(null);
  }, [clearTimer]);

  const offerUndo = useCallback(
    (message: string, payload: UndoPayload) => {
      clearTimer();
      setUndo({ message, payload });
      timerRef.current = setTimeout(() => {
        setUndo(null);
        timerRef.current = null;
      }, UNDO_MS);
    },
    [clearTimer],
  );

  const performUndo = useCallback(async () => {
    if (!undo) return;
    const { payload } = undo;
    dismiss();
    const compensating = buildUndoTxn(
      payload.original,
      payload.previousQtyBase,
    );
    await appendTxn(compensating);
  }, [undo, dismiss, appendTxn]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { undo, offerUndo, performUndo, dismiss };
}
