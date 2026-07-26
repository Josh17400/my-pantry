import type { ReactNode } from 'react';

import { cn } from './cn';
import { Fab } from './Fab';

export type TabId = string;

export type TabItem = {
  id: TabId;
  label: string;
  icon: ReactNode;
};

type TabBarProps = {
  tabs: readonly TabItem[];
  activeId: TabId;
  onChange: (id: TabId) => void;
  /** Center FAB — quick add */
  onFabClick?: () => void;
  fabLabel?: string;
  /** Show center FAB (default true). When true, tabs split around it. */
  showFab?: boolean;
  className?: string;
};

/**
 * Bottom navigation — safe-area aware for iPhone home indicator.
 * FAB sits centered, raised over the bar.
 */
export function TabBar({
  tabs,
  activeId,
  onChange,
  onFabClick,
  fabLabel = 'Add item',
  showFab = true,
  className,
}: TabBarProps) {
  const mid = Math.ceil(tabs.length / 2);
  const left = showFab ? tabs.slice(0, mid) : tabs;
  const right = showFab ? tabs.slice(mid) : [];

  return (
    <nav
      aria-label="Main"
      data-testid="app-tab-bar"
      className={cn(
        'relative border-t border-black/[0.04] bg-surface-raised shadow-tab',
        className,
      )}
    >
      {showFab ? (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="pointer-events-auto">
            <Fab onClick={onFabClick} label={fabLabel} />
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          'grid min-h-[3.5rem] items-end pb-safe',
          showFab ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-1',
        )}
      >
        <div
          className={cn(
            'flex items-stretch justify-around',
            showFab && 'pr-2',
          )}
        >
          {left.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              onSelect={onChange}
            />
          ))}
        </div>

        {showFab ? (
          <div className="w-16 shrink-0" aria-hidden />
        ) : null}

        {showFab ? (
          <div className="flex items-stretch justify-around pl-2">
            {right.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                active={tab.id === activeId}
                onSelect={onChange}
              />
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function TabButton({
  tab,
  active,
  onSelect,
}: {
  tab: TabItem;
  active: boolean;
  onSelect: (id: TabId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-tap min-w-tap flex-1 flex-col items-center justify-center gap-0.5 px-1 pt-2 pb-1.5 text-[0.65rem] font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
        active ? 'text-primary' : 'text-ink-muted hover:text-ink',
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center [&_svg]:h-5 [&_svg]:w-5',
          active && 'text-primary',
        )}
        aria-hidden
      >
        {tab.icon}
      </span>
      <span className="truncate">{tab.label}</span>
    </button>
  );
}
