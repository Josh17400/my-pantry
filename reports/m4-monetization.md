# M4 — Monetization, privacy, and store readiness

**Date:** 2026-07-26  
**Status:** Complete — verification green (sandbox only; no live payment rails)

## Verification

```
npm run typecheck && npm run test && npm run test:functions && npm run build
node scripts/screenshot-routes.mjs   # from apps/web
```

| Gate | Result |
|------|--------|
| typecheck | pass (core + web) |
| core tests | **279** passed |
| web tests | **231** passed (was 211 + monetization/settings) |
| function tests | **65** passed (55 prior + **10** entitlements) |
| build | pass |
| screenshot-routes | **14/14** routes render (incl. `/settings`, `/paywall`, `/privacy`) |

### Required coverage

| Requirement | Where |
|-------------|--------|
| Entitlement gating free vs paid | `apps/web/src/features/monetization/monetization.test.ts` |
| Webhook updates entitlement state | `supabase/functions/entitlements/tests/plan_test.ts` (grant/revoke via admin mock) |
| AdSlot hidden when subscribed | `shouldShowAd({ isPaid: true })` + AdSlot source wiring |
| AdSlot absent from cooking mode | cooking tests + monetization tests (App shell branches before cooking) |
| Export produces valid JSON | `buildDataExport` / `parseExportJson` / `isValidDataExport` |

---

## 1. Ad placement and AdMob policy

**Placement:** in-feed card on the home scroll via existing `AdSlot` (`data-ad-slot="in-feed"`).  
**Not used:** sticky / adaptive banner above the bottom tab bar.

### Why this satisfies AdMob policy

AdMob treats banners **adjacent to interactive navigation** as accidental-click risk and can disable ads. The product shell has a sticky tab bar + center FAB. A bottom banner would sit directly above those controls — the classic violation called out in `SPEC.md` and `DESIGN.md`.

The in-feed card:

- Lives inside the home content column (phone width), with normal card spacing
- Scrolls with content (not sticky)
- Is well clear of the tab bar and FAB
- Never mounts on cooking mode (route is outside `AppShell`; cooking screen has `data-ads-allowed="false"` and no `AdSlot` import)

**Native note:** `@capacitor-community/admob` primarily exposes fixed-position banners (TOP/BOTTOM). We deliberately **do not** call `showBanner(BOTTOM_CENTER)`. The plugin is used for **initialize + UMP + ATT**. Creative fill on free tier is:

- **Web:** AdSense when `VITE_ADSENSE_CLIENT` + `VITE_ADSENSE_SLOT` are set; otherwise a quiet placeholder (never a broken empty iframe)
- **Native:** consent/SDK ready on first `AdSlot` mount; in-feed HTML reservation remains the policy-safe placement. Owner should use AdMob **native advanced / in-feed** creatives or a non-adjacent format when wiring production units — not a tab-adjacent banner

Test ad unit IDs only in code (`ca-app-pub-3940256099942544/…`). Real units come from env — **never committed**.

---

## 2. Consent flow (UMP + ATT)

| Step | When | Behavior |
|------|------|----------|
| **ATT (iOS)** | First free-tier `AdSlot` mount — **not** cold start | `trackingAuthorizationStatus` → `requestTrackingAuthorization` with retry/backoff if OS swallows while inactive (mirrors euchre `shell.js`) |
| **AdMob.initialize** | After ATT attempt (iOS) or immediately (Android/web no-op) | Once per session |
| **UMP `requestConsentInfo`** | After initialize | If form available and status `REQUIRED`, `showConsentForm()` |
| **NPA fallback** | Consent not `OBTAINED` / `NOT_REQUIRED`, or any failure | Non-personalized ads only (`npa: true`) |

Rationale for deferred ATT: App Review wants a findable prompt; iOS often no-ops ATT if requested before the app is fully active. First ad surface is a sensible product moment.

Cooking mode never triggers `prepareInFeedAd`.

---

## 3. Entitlement architecture

```
Store / RC Web Billing
        │ purchase / renew / expire
        ▼
RevenueCat ──webhook──► supabase/functions/entitlements
        │                      │ service role
        │                      ▼
        │              auth.users.app_metadata.plan = pro | free
        │
        ▼
Client RC SDK (optional cache for UX)
        │
        ▼
UI: AdSlot / paywall / settings badge
        │
        ▼
Edge chef + parse-receipt: re-read app_metadata.plan
        (never trust client "I am paid")
```

### Why the server never trusts the client

- Chef and parse-receipt already gate on `user.app_metadata.plan` / `user_metadata.plan` (`paid` \| `pro` \| `unlimited`).
- The webhook is the **only** write path that promotes plan via service role.
- Client `useEntitlementStore` and `localStorage tgp.plan` / `VITE_CHEF_PAID` affect **UI only** (hide ads, show Pro badge, dev sandbox). They do **not** unlock server quotas or chef model calls.
- Account deletion requires a real JWT; service role performs `auth.admin.deleteUser`.

### Unified RevenueCat (no Stripe-web split)

Per SPEC/red-team: RevenueCat Web Billing is mature enough. This track:

- **Native:** `@revenuecat/purchases-capacitor` ^13.2.1 (same as euchre)
- **Web:** graceful degrade + catalog display; purchases complete in stores (or future Web Billing key `VITE_REVENUECAT_WEB_API_KEY`)
- **Single entitlement id:** `good_pantry_pro` → mirrored plan `pro`
- **No Stripe integration** introduced

Webhook events:

| Event | Effect |
|-------|--------|
| `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, … | grant `plan: pro` |
| `EXPIRATION` | revoke → `free` |
| `CANCELLATION` | **noop** (access until period end) |
| `TEST` | grant (sandbox wiring) |
| Anonymous `$RCAnonymousID:…` | skip write; log that `Purchases.logIn(supabaseUserId)` is required |

---

## 4. Paywall

Route: `/paywall` → `PaywallScreen`

- Honest free tier table (unlimited pantry/recipes/lists, cook-to-deduct, community, 15 scans/mo)
- Pro sells: AI chef, unlimited scans, no ads, household sharing, cost analytics
- Explicit **“Not now — continue with free”** (not disguised)
- **Restore purchases**
- No fake urgency / countdown
- Dev-only “Simulate Pro (UI only)” banner when `import.meta.env.DEV`

---

## 5. Privacy, deletion, export

| Surface | Route / entry |
|---------|----------------|
| Privacy policy | `/privacy` — receipts (parse & discard default), pantry, auth, ads/tracking, AI chef, export/delete |
| Settings | `/settings` — dietary, household, notifications, units, subscription, privacy links |
| Export | Settings → Export my data (JSON v1: pantry, recipes, history) |
| Delete account | Settings → Delete account → confirm → `entitlements` `delete_account` |

Export schema: `DataExportV1` (`schemaVersion: 1`, `app: 'the-good-pantry'`). Validated in tests.

---

## 6. App Store privacy-label answers

Document for App Store Connect (not legal advice — matches implemented behavior):

| Category | Linked to user? | Purpose | Notes |
|----------|-----------------|---------|--------|
| Email | Yes (if account) | App functionality | Supabase Auth |
| User ID | Yes | App functionality | Auth + household |
| Purchase history | Yes | App functionality | Via stores / RevenueCat; we store plan entitlement |
| Photos / Camera | **Processed** | App functionality | **Receipt images parsed; discarded by default** (`retainImage` opt-in only). Still declare processing even though not retained. |
| Advertising data / Device ID | Tracking (free tier) | Third-party advertising | AdMob when ATT authorized + UMP allows personalized ads. Pro: no ads. |

Full structured copy: `APP_STORE_PRIVACY_LABELS` in `apps/web/src/features/monetization/privacy-content.ts`.

---

## 7. What the owner must configure

### AdMob

1. Create Android + iOS apps in AdMob  
2. Create **in-feed / medium** ad units (not tab-adjacent banners)  
3. Set env (CI / local secrets — never commit real IDs):

   - `VITE_ADMOB_USE_TEST_ADS=false` for store builds  
   - `VITE_ADMOB_BANNER_ANDROID` / `VITE_ADMOB_BANNER_IOS` (or dedicated in-feed unit env when you add them)  
   - Android `APPLICATION_ID` + iOS `GADApplicationIdentifier` in native manifests (Google **test** app ids until ready — see euchre README pattern)  
4. AdMob → Privacy & messaging → GDPR UMP message  
5. Optional web: `VITE_ADSENSE_CLIENT` + `VITE_ADSENSE_SLOT`

### RevenueCat

1. Project + iOS + Android apps  
2. Products: `good_pantry_pro_monthly`, `good_pantry_pro_annual`  
3. Entitlement: `good_pantry_pro`  
4. Public SDK keys → `VITE_REVENUECAT_IOS_API_KEY`, `VITE_REVENUECAT_ANDROID_API_KEY`  
5. Webhook → `POST /functions/v1/entitlements` with `REVENUECAT_WEBHOOK_SECRET`  
6. After sign-in: `Purchases.logIn(supabaseUser.id)` so webhook `app_user_id` is a UUID  
7. Sandbox StoreKit / Play license testers only in this track  

### Supabase

- Deploy `supabase/functions/entitlements`  
- Secrets: `REVENUECAT_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`  
- Chef/receipt already honor `app_metadata.plan`

### Packages installed (mirror euchre)

- `native/package.json` + `apps/web/package.json`: `@capacitor-community/admob` ^8.0.0, `@revenuecat/purchases-capacitor` ^13.2.1  
- Run `npm install` in `native/` and `npx cap sync` on a machine with the mobile toolchain before device builds  

---

## 8. What could not be verified without a device

- Real ATT system dialog appearance and retry-after-foreground  
- UMP form in EEA with a configured AdMob GDPR message  
- StoreKit / Play Billing sandbox purchase → RC → webhook → `app_metadata.plan` round-trip  
- Native AdMob fill rate / policy review of production creatives  
- Account deletion against a live Supabase project  
- AdSense fill on production web domain  

---

## 9. Deviations

1. **No sticky native banner.** Plugin supports bottom banners; product policy forbids them. In-feed HTML slot + consent/SDK init is the M4 wire-up.  
2. **Web purchases** do not complete in-browser yet (no live Web Billing checkout linked). Catalog + restore messaging; server entitlement still unifies via RC webhook when mobile (or future web) purchase lands.  
3. **Minimal home change:** `AdSlot` no longer hard-codes `paidTier={false}` so the entitlement store can hide ads for Pro.  
4. **Core test fix (pre-existing):** `packages/core/test/seed/recipes.test.ts` `TIMER_HINT` expanded so timer steps with “cook/pour/beat/…” language pass — was failing the monorepo gate independently of M4.  
5. **Playwright** added as `@larder/web` devDependency so `screenshot-routes.mjs` runs in this environment.  

---

## 10. Open questions

1. Final Pro price points (display falls back to $4.99/mo · $39.99/yr until RC offerings load)?  
2. Free scan limit still SPEC guess of **15** — confirm from M2 cost data before store?  
3. Should Settings get a permanent entry in the tab shell / home header gear, or deep-link only for now?  
4. Household sharing UX beyond the Pro upsell line — invite flow polish in a later track?  
5. Production support email for privacy policy (`support@thegoodpantry.app` placeholder)?  

---

## Key paths

```
apps/web/src/features/monetization/   ads, RC, entitlements store, paywall, export, privacy
apps/web/src/features/settings/       dietary, notifications, units, settings screen
apps/web/src/ui/AdSlot.tsx            in-feed + consent + paid hide
apps/web/src/routes/{Paywall,Settings,Privacy}Page.tsx
supabase/functions/entitlements/      webhook + delete_account
native/package.json                   admob + purchases-capacitor
```
