# iOS CI setup (TestFlight from GitHub Actions)

The workflow at `.github/workflows/ios.yml` builds the Capacitor iOS app and
uploads it to TestFlight. It is **manual-trigger only** and does nothing until
the secrets below exist.

This runbook is adapted from the owner's working euchre-game pipeline
(`C:\Users\joshu\euchre-game\CI_SETUP.md`). Same four App Store Connect API
secrets, same cert-persistence pattern, same failure modes.

## Bundle identity

| Field | Value |
|---|---|
| App name | My Pantry |
| Bundle id | `com.mypantry.app` |
| Capacitor config | `native/capacitor.config.json` |
| Fastlane Appfile | `native/ios/fastlane/Appfile` |

## 1. Set the four App Store Connect secrets

Prerequisites: an App Store Connect API key (App Manager role) — you have the
key ID, the issuer ID, and the downloaded `AuthKey_XXXXXXXXXX.p8` file — plus
your Apple Developer Team ID (developer.apple.com → Membership).

Replace `OWNER/REPO` with this GitHub repo (e.g. `Josh17400/larder`).

PowerShell (this machine):

```powershell
gh secret set ASC_KEY_ID    --repo OWNER/REPO --body "YOUR_KEY_ID"
gh secret set ASC_ISSUER_ID --repo OWNER/REPO --body "YOUR_ISSUER_UUID"
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\AuthKey_XXXXXXXXXX.p8"))
gh secret set ASC_KEY_P8    --repo OWNER/REPO --body $b64
gh secret set APPLE_TEAM_ID --repo OWNER/REPO --body "YOUR_TEAM_ID"
```

(macOS/Linux equivalent for the key:
`gh secret set ASC_KEY_P8 --repo OWNER/REPO --body "$(base64 -i AuthKey_XXXXXXXXXX.p8)"`)

## 2. Persistent Distribution cert (also required)

Ephemeral GitHub runners cannot keep a private key between jobs. Minting a
fresh Distribution cert every run hits Apple's cert cap after ~2 builds. The
euchre-game Fastfile therefore imports a **persistent** `.p12` from secrets.

One-time (on a Mac CI run or local Mac with the API key):

```bash
cd native/ios
export ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_P8=... APPLE_TEAM_ID=...
export CERT_EXPORT_PASS='choose-a-strong-password'
fastlane ios mint_cert
# produces native/ios/build/dist_full.p12
```

Then store it (PowerShell):

```powershell
$p12 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\dist_full.p12"))
gh secret set IOS_CERT_P12_B64 --repo OWNER/REPO --body $p12
gh secret set CERT_EXPORT_PASS --repo OWNER/REPO --body "the-password-you-chose"
```

If you already minted a cert for euchre-game under the **same** Apple team,
you can reuse that same `.p12` + password for this app (Distribution certs are
team-scoped, not app-scoped). Profiles are per-bundle-id and are minted
automatically each run via the API key.

## 3. One-time App Store Connect setup

1. Register bundle id `com.mypantry.app` (developer.apple.com → Identifiers).
   Cloud signing can often auto-register it, but doing it manually avoids a
   first-run surprise.
2. Create the app record in App Store Connect (My Apps → "+") with that
   bundle id. **TestFlight upload fails until this exists.**

No ads / IAP capabilities are required for this shell (those land in M2/M4).

## 4. Trigger a build

```powershell
gh workflow run ios.yml --repo OWNER/REPO
gh run watch --repo OWNER/REPO   # follow the latest run
```

Or use the "Run workflow" button on the Actions tab. Each run's build number
is the GitHub run number, so re-runs never collide in TestFlight.

### What the workflow does

1. `npm ci` at repo root (workspaces: `packages/*`, `apps/*`)
2. `npm run build` → Vite production bundle into `apps/web/dist`
3. `npm ci` + `npx cap sync ios` under `native/`
4. `fastlane ios beta` under `native/ios`

## First-run failure modes (expected, all fixable without code changes)

- **"Could not find app" / upload_to_testflight fails** — the app record
  doesn't exist in App Store Connect yet (step 3 above), or the API key lacks
  the App Manager role.
- **Signing errors in the archive step** — missing or wrong
  `IOS_CERT_P12_B64` / `CERT_EXPORT_PASS`, or the bundle id is unknown
  (register it, step 3.1). If it complains about certificate limits, revoke
  stale Distribution certs at developer.apple.com.
- **Xcode version mismatch** — the workflow pins `runs-on: macos-26`. If
  GitHub renames/retires that image, switch to `macos-latest` or add a
  `maxim-lobanov/setup-xcode` step; Capacitor 8 needs Xcode 16.4+.
- **`export_method: "app-store-connect"` rejected** — already set to
  `"app-store"` in `native/ios/fastlane/Fastfile` (same fix as euchre-game).
- **Missing export compliance** — after a successful upload, TestFlight may
  hold the build asking about encryption. Answer once in ASC, or add
  `ITSAppUsesNonExemptEncryption = NO` to `native/ios/App/App/Info.plist` to
  silence it permanently (the app only uses HTTPS).

## Local notes (Windows)

- `npx cap add ios` / `npx cap sync ios` work on Windows; they only generate
  project files. Building the `.ipa` is CI's job (no Xcode here).
- Do **not** run `cap open ios` — there is no Mac.
- Web dev loop: `npm run dev` from the repo root (Vite on :5173). DB Health
  shows "Not applicable" in the browser; the 7-step self-test runs only
  inside the native WebView.
