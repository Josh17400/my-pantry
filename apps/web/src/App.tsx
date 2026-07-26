import { type ReactNode, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { BarcodePage } from './routes/BarcodePage';
import { ChefPage } from './routes/ChefPage';
import { CommunityPage } from './routes/CommunityPage';
import { CookingModePage } from './routes/CookingModePage';
import { CookPage } from './routes/CookPage';
import { DbHealthPage } from './routes/DbHealthPage';
import { DesignPage } from './routes/DesignPage';
import { GroceryPage } from './routes/GroceryPage';
import { HomePage } from './routes/HomePage';
import { ImportRecipePage } from './routes/ImportRecipePage';
import { LocationsPage } from './routes/LocationsPage';
import { PantryItemPage } from './routes/PantryItemPage';
import { PantryPage } from './routes/PantryPage';
import { PaywallPage } from './routes/PaywallPage';
import { PrivacyPage } from './routes/PrivacyPage';
import { QuickAddPage } from './routes/QuickAddPage';
import { ReceiptReviewPage } from './routes/ReceiptReviewPage';
import { RecipeDetailPage } from './routes/RecipeDetailPage';
import { RecipeEditPage } from './routes/RecipeEditPage';
import { RecipesPage } from './routes/RecipesPage';
import { ScanPage } from './routes/ScanPage';
import { SettingsPage } from './routes/SettingsPage';
import { TabBar } from './ui';

/** Tab icons. Kept inline and minimal — the design system owns LeafIcon only. */
const icon = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" strokeLinejoin="round" />
    </svg>
  ),
  recipes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z" strokeLinejoin="round" />
      <path d="M8 3v18" strokeLinecap="round" />
    </svg>
  ),
  pantry: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 12h16" strokeLinecap="round" />
      <path d="M9 7.5h2M9 16.5h2" strokeLinecap="round" />
    </svg>
  ),
  lists: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" />
      <path d="m4 6 1 1 1.5-2M4 12l1 1 1.5-2M4 18l1 1 1.5-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  me: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  ),
};

/*
  Five tabs, matching mockup-01 (Home · Recipes · Inventory · Lists · Me).
  "Me" is not cosmetic: Settings was only linked from Paywall and Privacy, and
  Privacy links back to Settings — a closed loop with no entrance. On a native
  build there is no address bar, so Settings, DB Health, the barcode scanner and
  the design gallery were all unreachable.
*/
const TABS = [
  { id: '/', label: 'Home', icon: icon.home },
  { id: '/recipes', label: 'Recipes', icon: icon.recipes },
  { id: '/pantry', label: 'Pantry', icon: icon.pantry },
  { id: '/grocery', label: 'Lists', icon: icon.lists },
  { id: '/settings', label: 'Me', icon: icon.me },
] as const;

/** Longest matching tab prefix, so /recipes/123/cook still highlights Recipes. */
function activeTabFor(pathname: string): string {
  const match = TABS.filter((t) => t.id !== '/' && pathname.startsWith(t.id)).sort(
    (a, b) => b.id.length - a.id.length,
  )[0];
  return match?.id ?? '/';
}

/*
  The FAB previously went straight to /quick, which left /scan reachable only
  from the receipt review screen — itself reached from /scan. Receipt scanning,
  the product's headline feature, had no entrance at all. The "+" is the
  universal add affordance, so it offers the real choices.
*/
const ADD_ACTIONS = [
  { to: '/scan', label: 'Scan a receipt', hint: 'Add a whole shop at once' },
  { to: '/barcode', label: 'Scan a barcode', hint: 'One item, while putting away' },
  { to: '/quick', label: 'Quick eat', hint: 'A yogurt, an apple, two eggs' },
  { to: '/pantry', label: 'Add by hand', hint: 'Search the catalogue' },
] as const;

function AddSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30"
      />
      <div className="relative mb-20 w-full max-w-md px-4">
        <div className="overflow-hidden rounded-card bg-surface-raised shadow-card">
          {ADD_ACTIONS.map((a) => (
            <button
              key={a.to}
              type="button"
              onClick={() => {
                onClose();
                void navigate(a.to);
              }}
              className="min-h-tap flex w-full flex-col items-start border-b border-black/[0.04] px-4 py-3 text-left last:border-b-0 hover:bg-surface"
            >
              <span className="text-sm font-semibold text-ink">{a.label}</span>
              <span className="text-xs text-ink-muted">{a.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/*
        Phone-first: the column stays phone-width even on a desktop browser.
        pb-10 clears the FAB, which is translated up over the tab bar and would
        otherwise clip the last row of any scrolling list.
      */}
      <main className="mx-auto w-full max-w-md flex-1 pb-10">{children}</main>
      <div className="sticky bottom-0 mx-auto w-full max-w-md">
        <TabBar
          tabs={TABS}
          activeId={activeTabFor(pathname)}
          onChange={(id) => navigate(id)}
          onFabClick={() => setAddOpen(true)}
          fabLabel="Add"
        />
      </div>
      {addOpen ? <AddSheet onClose={() => setAddOpen(false)} /> : null}
    </div>
  );
}

export function App() {
  const { pathname } = useLocation();

  // /design is a full-bleed gallery and /db-health is a dev diagnostic — neither
  // belongs inside the product shell.
  if (pathname === '/design') {
    return (
      <Routes>
        <Route path="/design" element={<DesignPage />} />
      </Routes>
    );
  }

  if (pathname === '/db-health') {
    return (
      <div className="min-h-screen bg-bg">
        <header className="border-b border-black/[0.04] bg-surface">
          <nav className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
            <Link to="/" className="font-display text-sm font-semibold text-ink">
              The Good Pantry
            </Link>
            <Link to="/design" className="text-sm text-ink-muted hover:text-ink">
              Design
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-8">
          <Routes>
            <Route path="/db-health" element={<DbHealthPage />} />
          </Routes>
        </main>
      </div>
    );
  }

  // Cooking mode is a focused, hands-busy full-screen — no tab bar, no ads shell.
  if (pathname.includes('/cooking')) {
    return (
      <Routes>
        <Route path="/recipes/:id/cooking" element={<CookingModePage />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />

        <Route path="/pantry" element={<PantryPage />} />
        <Route path="/pantry/:id" element={<PantryItemPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/barcode" element={<BarcodePage />} />

        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/new" element={<RecipeEditPage />} />
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        <Route path="/recipes/:id/edit" element={<RecipeEditPage />} />
        <Route path="/recipes/:id/cook" element={<CookPage />} />
        <Route path="/recipes/:id/cooking" element={<CookingModePage />} />

        <Route path="/community" element={<CommunityPage />} />
        <Route path="/import" element={<ImportRecipePage />} />

        <Route path="/grocery" element={<GroceryPage />} />
        <Route path="/quick" element={<QuickAddPage />} />

        <Route path="/scan" element={<ScanPage />} />
        <Route path="/receipt/review" element={<ReceiptReviewPage />} />

        <Route path="/chef" element={<ChefPage />} />

        <Route path="/paywall" element={<PaywallPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
