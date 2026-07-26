/**
 * Time-of-day greeting — "Good morning, Alex".
 * Pure; accepts injected clock for tests.
 */

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

const DEFAULT_NAME = 'Alex';

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

export function fullGreeting(
  name: string = DEFAULT_NAME,
  now: Date = new Date(),
): string {
  return `${greetingPhrase(greetingPeriod(now))}, ${name}`;
}

export const DEFAULT_USER_DISPLAY_NAME = DEFAULT_NAME;
