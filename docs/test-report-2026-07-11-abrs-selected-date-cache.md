# OnChak Extension ABRS Selected Date Cache Test Report

Date: 2026-07-11

## Scope

- Persist the selected ABRS ledger date across popup remounts and foreground changes.
- Keep existing ABRS batch file cache behavior for the selected date.
- Bump extension artifact version from `0.1.1` to `0.1.2`.

## Verification

### Unit Tests

Command:

```bash
npm run test
```

Result: PASS

- 39 tests passed.
- Added coverage for selected ABRS target-date storage runtime messages.

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

- `dist/manifest.json` generated with version `0.1.2`.

### Playwright Extension Smoke

Command:

```bash
npx playwright test --config playwright.abrs.config.mjs tests/e2e/abrs-popup.spec.ts -g "restores the selected ledger date"
```

Result: PASS

- Verified `2026-04-18` remains selected after opening another page and remounting the extension popup.

## Artifact

Generated zip:

```text
/Users/admin/refacoring_project/saiload/onchak-extension-dist-v0.1.2-prod-20260711-095256.zip
```

SHA-256:

```text
cfa5106ea4fdeeccc4fb60cc710e1056287f5281db27f8b80945fbe2979d9186
```

## Remaining Live Scope

- User Chrome should reload the unpacked extension from `dist` before validating the live popup manually.
