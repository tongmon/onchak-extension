# Margin Calculator Draft And Source URL Test Report

Date: 2026-07-20

## Scope

- Rename the popup section to `마진율 계산기`.
- Persist margin calculator inputs in `chrome.storage.local` while editing.
- Restore the cached draft after the popup loses foreground or is reopened.
- Add an optional product source URL to calculation results and uploads.
- Store and return `productSourceUrl` from the backend.
- Show the product source URL in the OnChak margin result detail modal.

## Verification

- `npm test`: PASS, 43 tests.
- `npm run typecheck`: PASS.
- `npm run build:prod`: PASS, `dist/manifest.json` version `0.1.5`.
- `npx playwright test --config playwright.abrs.config.mjs`: PASS, 5 tests.
- `npm run vitest -- --run`: PASS, OnChak 52 tests.
- `npm run build`: PASS, OnChak production build.
- `./gradlew :app:test --tests 'com.saiload.oms.adapter.in.web.margin.MarginResultApiTest'`: PASS.

## Remaining Scope

- Changes are local on `develop` and have not been committed or pushed.
- No production deployment or `zephlyglobal.com` runtime verification was performed.
