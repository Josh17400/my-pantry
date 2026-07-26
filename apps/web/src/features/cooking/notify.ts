/**
 * Timer completion notification — degrades when Notification API is denied.
 */

export async function notifyTimerDone(label: string): Promise<void> {
  const title = 'Timer done';
  const body = label ? `${label} finished` : 'Cooking timer finished';

  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      // Fallback: brief document title flash
      flashTitle(body);
      return;
    }
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      new Notification(title, { body, silent: false });
      return;
    }
    flashTitle(body);
  } catch {
    flashTitle(body);
  }
}

function flashTitle(msg: string): void {
  if (typeof document === 'undefined') return;
  const prev = document.title;
  document.title = `⏱ ${msg}`;
  window.setTimeout(() => {
    document.title = prev;
  }, 4000);
}
