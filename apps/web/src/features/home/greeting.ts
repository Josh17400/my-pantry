/**
 * Time-of-day greeting — "Good morning, Sam" or "Good afternoon" alone.
 * Pure; accepts injected clock for tests. Never invents a default name.
 */

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export function greetingPeriod(now: Date = new Date()): GreetingPeriod {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function greetingPhrase(
  period: GreetingPeriod = greetingPeriod(),
): string {
  switch (period) {
    case 'morning':
      return 'Good morning';
    case 'afternoon':
      return 'Good afternoon';
    case 'evening':
      return 'Good evening';
    case 'night':
      return 'Good evening';
  }
}

/**
 * Full greeting. When `name` is missing/blank, returns the period phrase alone
 * ("Good afternoon") — never invents "Alex" or any placeholder person.
 */
export function fullGreeting(
  name?: string | null,
  now: Date = new Date(),
): string {
  const phrase = greetingPhrase(greetingPeriod(now));
  const trimmed = name?.trim();
  if (!trimmed) return phrase;
  return `${phrase}, ${trimmed}`;
}

/**
 * Best-effort display name from auth fields.
 * Prefers explicit display name; otherwise email local-part (capitalized).
 * Returns null when nothing usable is available.
 */
export function displayNameFromUser(user: {
  email?: string | null;
  displayName?: string | null;
} | null | undefined): string | null {
  if (!user) return null;
  const explicit = user.displayName?.trim();
  if (explicit) return explicit;
  const email = user.email?.trim();
  if (!email) return null;
  const local = email.split('@')[0]?.trim();
  if (!local) return null;
  // "jane.doe" → "Jane"
  const first = local.split(/[._+-]/)[0] ?? local;
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
