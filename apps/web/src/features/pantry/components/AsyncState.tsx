import type { ReactNode } from 'react';

import { Card } from '../../../ui/Card';
import { cn } from '../../../ui/cn';

type LoadingBlockProps = {
  label?: string;
  className?: string;
};

export function LoadingBlock({
  label = 'Loading…',
  className,
}: LoadingBlockProps) {
  return (
    <div
      className={cn(
        'flex min-h-[8rem] flex-col items-center justify-center gap-2 px-4 py-8 text-ink-muted',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className="h-8 w-8 animate-pulse rounded-full bg-primary/20"
        aria-hidden
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}

type ErrorBlockProps = {
  message: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorBlock({ message, onRetry, className }: ErrorBlockProps) {
  return (
    <Card
      className={cn('border border-critical/20', className)}
      padding="md"
      role="alert"
    >
      <p className="text-sm font-medium text-critical">Something went wrong</p>
      <p className="mt-1 text-sm text-ink-muted">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-tap rounded-pill bg-primary px-4 text-sm font-medium text-white"
        >
          Try again
        </button>
      ) : null}
    </Card>
  );
}

type EmptyBlockProps = {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyBlock({ title, body, action, className }: EmptyBlockProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 py-12 text-center',
        className,
      )}
    >
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-tint-cream"
        aria-hidden
      >
        <span className="font-display text-2xl text-primary">∅</span>
      </div>
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">{body}</p>
      {action ? <div className="mt-6 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}
