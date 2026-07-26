import { cn } from './cn';

type LeafIconProps = {
  className?: string;
  /** Accessible label; decorative when omitted */
  title?: string;
};

/** Brand leaf / olive-branch motif from the mockups. */
export function LeafIcon({ className, title }: LeafIconProps) {
  const decorative = title === undefined;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-5 w-5', className)}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {/* Stem */}
      <path
        d="M16 28 V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Left leaf */}
      <path
        d="M15.5 18 C10 16 6 12 5 7 C11 7 15 11 15.5 16 Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Right leaf */}
      <path
        d="M16.5 14 C22 12 26 8 27 3 C21 4 17 8 16.5 12 Z"
        fill="currentColor"
      />
      {/* Small bud */}
      <path
        d="M16 10 C14 8 13 5 14 3 C16 4 17 7 16.5 9.5 Z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  );
}
