/**
 * Standalone mount for grocery screenshot (App.tsx is owned by another track).
 * vite multipage entry: grocery-preview.html
 */
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { GroceryPage } from './routes/GroceryPage';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element');
}

createRoot(rootEl).render(
  <StrictMode>
    <GroceryPage />
  </StrictMode>,
);
