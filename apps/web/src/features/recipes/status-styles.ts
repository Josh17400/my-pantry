import type { CookLineStatus } from './core-imports';
import type { StatusPresentation } from './cook-machine';
import { presentCookStatus } from './cook-machine';

export function statusToneClass(tone: StatusPresentation['tone']): string {
  switch (tone) {
    case 'ok':
      return 'text-fresh';
    case 'warn':
      return 'text-low';
    case 'danger':
      return 'text-critical';
    case 'info':
      return 'text-primary';
    case 'muted':
    default:
      return 'text-ink-muted';
  }
}

export function statusChipClass(tone: StatusPresentation['tone']): string {
  switch (tone) {
    case 'ok':
      return 'bg-fresh/10 text-fresh';
    case 'warn':
      return 'bg-low-fill/15 text-low';
    case 'danger':
      return 'bg-critical/10 text-critical';
    case 'info':
      return 'bg-primary/10 text-primary';
    case 'muted':
    default:
      return 'bg-black/[0.04] text-ink-muted';
  }
}

export function statusLabel(status: CookLineStatus): string {
  return presentCookStatus(status).label;
}
