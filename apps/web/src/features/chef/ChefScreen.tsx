/**
 * AI Chef chat — mobile-first, paid-tier gated, pantry-grounded.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { usePantryStore } from '../../state/pantry-store';
import { Card, cn } from '../../ui';
import { type ChefClient,liveChefClient } from './client';
import {
  buildCatalogSlice,
  buildPantrySnapshot,
  loadDietaryProfile,
  resolveEntitlement,
} from './context';
import type {
  ChatMessage,
  ChefIntent,
  EntitlementState,
} from './types';
import { SUGGESTED_PROMPTS } from './types';

function newId(): string {
  return crypto.randomUUID();
}

export type ChefScreenProps = {
  readonly client?: ChefClient;
  /** Force entitlement in tests. */
  readonly entitlementOverride?: EntitlementState;
};

export function ChefScreen({
  client = liveChefClient,
  entitlementOverride,
}: ChefScreenProps) {
  const pantryItems = usePantryStore((s) => s.items);
  const loadPantry = usePantryStore((s) => s.load);
  const householdId = usePantryStore((s) => s.householdId);

  const [entitlement, setEntitlement] = useState<EntitlementState>(
    entitlementOverride ?? 'unknown',
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadPantry();
  }, [loadPantry]);

  useEffect(() => {
    if (entitlementOverride) {
      setEntitlement(entitlementOverride);
      return;
    }
    void resolveEntitlement().then(setEntitlement);
  }, [entitlementOverride]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const pantrySnapshot = useMemo(
    () => buildPantrySnapshot(pantryItems),
    [pantryItems],
  );
  const catalog = useMemo(
    () => buildCatalogSlice(pantrySnapshot),
    [pantrySnapshot],
  );
  const dietary = useMemo(() => loadDietaryProfile(), []);

  const send = useCallback(
    async (text: string, intent?: ChefIntent) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      if (entitlement !== 'paid') return;

      const userMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        content: trimmed,
      };
      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);
      setInput('');
      setSending(true);
      setErrorBanner(null);

      const res = await client.chat({
        messages: nextHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        intent,
        pantry: pantrySnapshot,
        dietary,
        catalog,
        householdId,
      });

      setSending(false);

      if (!res.ok) {
        if (res.code === 'entitlement_required') {
          setEntitlement('free');
        }
        const detail =
          res.code === 'safety_blocked'
            ? `${res.message}${
                res.violations?.length
                  ? ` (${res.violations.map((v) => v.detail).join('; ')})`
                  : ''
              }`
            : res.message;
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'assistant',
            content: detail,
            error: true,
          },
        ]);
        if (res.code === 'budget_exceeded' || res.code === 'rate_limited') {
          setErrorBanner(res.message);
        }
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: res.message,
          groundedPantry: res.groundedPantry,
          substitutions: res.substitutions,
          recipe: res.recipe,
        },
      ]);
    },
    [
      catalog,
      client,
      dietary,
      entitlement,
      householdId,
      messages,
      pantrySnapshot,
      sending,
    ],
  );

  if (entitlement === 'unknown') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-sm text-ink-muted">Checking your plan…</p>
      </div>
    );
  }

  if (entitlement === 'free') {
    return <UpsellPanel pantryCount={pantrySnapshot.length} />;
  }

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] flex-col">
      <header className="sticky top-0 z-10 border-b border-black/[0.04] bg-bg/95 px-4 pb-3 pt-safe backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Paid · AI Chef
            </p>
            <h1 className="font-display text-xl font-semibold text-ink">
              Cook with what you have
            </h1>
          </div>
          <span className="rounded-full bg-tint-sage px-2.5 py-1 text-xs font-medium text-primary">
            {pantrySnapshot.length} in pantry
          </span>
        </div>
        {dietary.avoidAllergens.length > 0 ||
        dietary.avoidDietaryFlags.length > 0 ? (
          <p className="mt-2 text-xs text-ink-muted">
            Avoiding:{' '}
            {[...dietary.avoidAllergens, ...dietary.avoidDietaryFlags].join(
              ', ',
            )}
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">
            Tip: set avoid lists in local storage keys{' '}
            <code className="text-[10px]">tgp.avoidDietaryFlags</code> (e.g.
            gluten) until the profile screen ships.
          </p>
        )}
        {errorBanner ? (
          <p className="mt-2 rounded-lg bg-critical/10 px-3 py-2 text-xs text-critical">
            {errorBanner}
          </p>
        ) : null}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyState
            pantryCount={pantrySnapshot.length}
            onPick={(p) => void send(p)}
          />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {sending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-surface px-4 py-3 text-sm text-ink-muted shadow-card">
              Thinking…
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="sticky bottom-0 border-t border-black/[0.04] bg-bg px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="chef-input">
            Message the chef
          </label>
          <input
            id="chef-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about dinner, swaps, steps…"
            disabled={sending}
            className="min-h-tap flex-1 rounded-full border border-black/[0.06] bg-surface px-4 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="min-h-tap min-w-tap rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function UpsellPanel({ pantryCount }: { pantryCount: number }) {
  return (
    <div className="px-4 pb-8 pt-safe">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        AI Chef
      </p>
      <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
        Pantry-aware cooking help
      </h1>
      <Card className="mt-4" padding="lg" tint="sage">
        <p className="text-sm leading-relaxed text-ink">
          The AI Chef is included with a paid plan. It plans meals from{' '}
          <strong>your real pantry</strong>
          {pantryCount > 0 ? ` (${pantryCount} items in stock)` : ''}, suggests
          substitutions with ratios, and generates recipes that cook and deduct
          like any other.
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-ink-muted">
          <li>Hard allergen & gluten safety gate (server-side)</li>
          <li>Dollar budget per month — no runaway bills</li>
          <li>Never invents pantry stock you do not have</li>
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            to="/"
            className="flex min-h-tap items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-white"
          >
            Back to home
          </Link>
          <p className="text-center text-xs text-ink-muted">
            Upgrade in Settings when billing ships (M4). For local dev, set{' '}
            <code className="text-[10px]">localStorage.tgp.plan = &apos;paid&apos;</code>
            .
          </p>
        </div>
      </Card>
      <Card className="mt-3" padding="md">
        <p className="text-sm font-medium text-ink">Free alternative</p>
        <p className="mt-1 text-sm text-ink-muted">
          Cook-now matching on Home finds recipes you can make offline — no AI,
          no paywall.
        </p>
        <Link
          to="/"
          className="mt-3 inline-flex text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          See what you can cook now →
        </Link>
      </Card>
    </div>
  );
}

function EmptyState({
  pantryCount,
  onPick,
}: {
  pantryCount: number;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Card padding="md" tint="cream">
        <p className="text-sm text-ink">
          {pantryCount > 0
            ? `I'll only claim ingredients from your ${pantryCount} in-stock pantry items.`
            : 'Your pantry looks empty — add items first so answers can be grounded.'}
        </p>
      </Card>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Try asking
        </p>
        <div className="flex flex-col gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className="min-h-tap rounded-2xl border border-black/[0.06] bg-surface px-4 py-3 text-left text-sm text-ink shadow-card transition-colors hover:bg-surface-raised"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-card',
          isUser
            ? 'bg-primary text-white'
            : message.error
              ? 'bg-critical/10 text-critical'
              : 'bg-surface text-ink',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {!isUser &&
        message.groundedPantry &&
        message.groundedPantry.length > 0 ? (
          <div className="mt-3 border-t border-black/10 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
              Grounded in your pantry
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {message.groundedPantry.map((g) => (
                <li
                  key={g.ingredientId}
                  className="rounded-full bg-tint-sage/80 px-2 py-0.5 text-[11px] font-medium text-primary"
                >
                  {g.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!isUser && message.substitutions && message.substitutions.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-black/10 pt-2 text-xs">
            {message.substitutions.map((s, i) => (
              <li key={`${s.forIngredient}-${i}`}>
                <span className="font-medium">{s.forIngredient}</span>
                {' → '}
                {s.suggestion}
                {s.ratio ? ` (${s.ratio})` : ''}
              </li>
            ))}
          </ul>
        ) : null}

        {!isUser && message.recipe ? (
          <div className="mt-3 border-t border-black/10 pt-2 text-xs">
            <p className="font-semibold">{message.recipe.title}</p>
            <p className="opacity-70">
              Serves {message.recipe.servings}
              {message.recipe.prepMin != null
                ? ` · ${message.recipe.prepMin}m prep`
                : ''}
              {message.recipe.cookMin != null
                ? ` · ${message.recipe.cookMin}m cook`
                : ''}
            </p>
            <p className="mt-1 font-medium">Ingredients</p>
            <ul className="list-inside list-disc">
              {message.recipe.ingredients.map((line, i) => (
                <li key={i}>
                  {line.qty != null && line.unit
                    ? `${line.qty} ${line.unit} `
                    : ''}
                  {line.rawText}
                  {line.unknownAllergens ? ' ⚠ unknown allergens' : ''}
                </li>
              ))}
            </ul>
            <p className="mt-1 font-medium">Steps</p>
            <ol className="list-inside list-decimal">
              {message.recipe.steps.map((step, i) => (
                <li key={i}>{step.text}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}
