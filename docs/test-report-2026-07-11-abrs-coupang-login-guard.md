# OnChak Extension ABRS Coupang Login Guard Test Report

Date: 2026-07-11

## Scope

- ABRS one-click Coupang workbook collection.
- Coupang Ads Center login redirect handling.
- Prevention of automatic submission on `xauth.coupang.com` seller credential forms.
- Production extension build version bump to `0.1.3`.

## Changes

- Start Ads Center collection from `https://advertising.coupang.com/marketing/dashboard`.
- Treat Ads Center `/user/login` pages as login pages, not data pages.
- Focus Coupang tabs and wait for a stable URL before sending content-script messages.
- Return a clear Ads Center login-session guide instead of leaking HTML/JSON parse errors.
- Stop submitting Coupang `xauth.coupang.com` credential forms from the extension runtime.

## Verification

### Unit Tests

Command:

```bash
npm test
```

Result: PASS

- 41 tests passed.
- Added source-guard coverage for Ads Center dashboard start URL and xauth credential-form safety.
- Added content coverage that HTML login responses produce a login guide instead of `Unexpected token '<'`.

### Type Check

Command:

```bash
npm run typecheck
```

Result: PASS

### Production Build

Command:

```bash
npm run build:prod
```

Result: PASS

- `dist/manifest.json` generated with version `0.1.3`.
- Runtime worker import generated as `assets/index.ts-CBd7am0E.js`.

### Playwright Live Diagnostics

Profile:

```text
/Users/admin/.playwright-profiles/onchak-coupang-wing
```

Results:

- Direct Ads Center dashboard navigation redirects to login when the Ads Center session is missing.
- ABRS popup collection can still collect Wing files when Wing session is active.
- Ads Center file collection stops with a login-session guide when Ads Center session is missing.
- Current profile still needs a real Ads Center login before 3/3 live automatic collection can pass.

Evidence:

```text
/Users/admin/refacoring_project/saiload/tmp/coupang-direct-dashboard-after-popup.png
/Users/admin/refacoring_project/saiload/tmp/coupang-login-diagnosis-popup-auto-clean-tabs.png
/Users/admin/refacoring_project/saiload/tmp/coupang-auto-network-after-no-xauth-click.json
```

## Remaining Live Scope

- Full 3/3 Coupang automatic download requires a valid Ads Center login session in the same browser profile.
- The extension no longer attempts to solve or submit the seller credential login form automatically.
