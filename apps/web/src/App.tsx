import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { DbHealthPage } from './routes/DbHealthPage';
import { DesignPage } from './routes/DesignPage';
import { HomePage } from './routes/HomePage';

/**
 * Shell only — no product screens (pantry / recipes / grocery land later).
 * /design is a full-bleed gallery (no scaffold chrome).
 */
export function App() {
  const { pathname } = useLocation();
  const isDesign = pathname === '/design';

  if (isDesign) {
    return (
      <Routes>
        <Route path="/design" element={<DesignPage />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-black/[0.04] bg-surface">
        <nav className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
          <Link to="/" className="font-display text-sm font-semibold text-ink">
            The Good Pantry
          </Link>
          <Link
            to="/design"
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Design
          </Link>
          <Link
            to="/db-health"
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            DB Health
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/db-health" element={<DbHealthPage />} />
          <Route path="/design" element={<DesignPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
