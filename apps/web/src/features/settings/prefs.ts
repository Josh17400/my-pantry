/**
 * Settings preferences — dietary, notifications, units.
 * Dietary keys match chef context (tgp.avoidAllergens, etc.).
 */

import type {
  DietarySettings,
  NotificationPrefs,
  UnitsDisplayPref,
} from '../monetization/types';

const KEYS = {
  allergens: 'tgp.avoidAllergens',
  dietaryFlags: 'tgp.avoidDietaryFlags',
  dietaryNotes: 'tgp.dietaryNotes',
  notifications: 'tgp.notificationPrefs',
  units: 'tgp.unitsDisplay',
} as const;

export const ALLERGEN_OPTIONS = [
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
] as const;

export const DIETARY_FLAG_OPTIONS = [
  'gluten',
  'pork',
  'alcohol',
  'beef',
  'shellfish-derived',
] as const;

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  dailyShoppingBrief: true,
  quietHoursStart: 21,
  quietHoursEnd: 8,
};

function readJsonArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export function loadDietarySettings(): DietarySettings {
  return {
    avoidAllergens: readJsonArray(KEYS.allergens),
    avoidDietaryFlags: readJsonArray(KEYS.dietaryFlags),
    notes: (() => {
      try {
        return localStorage.getItem(KEYS.dietaryNotes) ?? '';
      } catch {
        return '';
      }
    })(),
  };
}

export function saveDietarySettings(settings: DietarySettings): void {
  localStorage.setItem(
    KEYS.allergens,
    JSON.stringify([...settings.avoidAllergens]),
  );
  localStorage.setItem(
    KEYS.dietaryFlags,
    JSON.stringify([...settings.avoidDietaryFlags]),
  );
  if (settings.notes.trim()) {
    localStorage.setItem(KEYS.dietaryNotes, settings.notes.trim());
  } else {
    localStorage.removeItem(KEYS.dietaryNotes);
  }
}

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(KEYS.notifications);
    if (!raw) return { ...DEFAULT_NOTIFICATIONS };
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      dailyShoppingBrief:
        typeof parsed.dailyShoppingBrief === 'boolean'
          ? parsed.dailyShoppingBrief
          : DEFAULT_NOTIFICATIONS.dailyShoppingBrief,
      quietHoursStart: clampHour(
        parsed.quietHoursStart ?? DEFAULT_NOTIFICATIONS.quietHoursStart,
      ),
      quietHoursEnd: clampHour(
        parsed.quietHoursEnd ?? DEFAULT_NOTIFICATIONS.quietHoursEnd,
      ),
    };
  } catch {
    return { ...DEFAULT_NOTIFICATIONS };
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(
    KEYS.notifications,
    JSON.stringify({
      dailyShoppingBrief: prefs.dailyShoppingBrief,
      quietHoursStart: clampHour(prefs.quietHoursStart),
      quietHoursEnd: clampHour(prefs.quietHoursEnd),
    }),
  );
}

export function loadUnitsDisplay(): UnitsDisplayPref {
  try {
    const v = localStorage.getItem(KEYS.units);
    if (v === 'metric' || v === 'us_retail') return v;
  } catch {
    /* ignore */
  }
  return 'us_retail';
}

export function saveUnitsDisplay(units: UnitsDisplayPref): void {
  localStorage.setItem(KEYS.units, units);
}

function clampHour(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const h = Math.floor(n);
  if (h < 0) return 0;
  if (h > 23) return 23;
  return h;
}

/** Whether local hour is inside quiet hours (supports wrap past midnight). */
export function isInQuietHours(
  hour: number,
  prefs: NotificationPrefs,
): boolean {
  const h = clampHour(hour);
  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;
  if (start === end) return false;
  if (start < end) return h >= start && h < end;
  // wraps midnight: e.g. 21 → 8
  return h >= start || h < end;
}
