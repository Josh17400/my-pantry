import { Link } from 'react-router-dom';

import {
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
} from '../features/monetization';

export function PrivacyPage() {
  return (
    <article className="flex flex-col gap-6 px-4 py-6 pb-16" data-privacy>
      <header>
        <p className="text-xs text-ink-muted">
          Last updated {PRIVACY_LAST_UPDATED}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
          Privacy policy
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          How The Good Pantry handles receipts, pantry data, ads, and the AI
          chef.
        </p>
      </header>

      {PRIVACY_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">
            {section.title}
          </h2>
          {section.paragraphs.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-ink-muted">
              {p}
            </p>
          ))}
        </section>
      ))}

      <Link
        to="/settings"
        className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
      >
        Back to settings
      </Link>
    </article>
  );
}
