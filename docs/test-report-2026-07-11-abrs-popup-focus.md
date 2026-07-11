# OnChak Extension ABRS Popup Focus Test Report

Date: 2026-07-11

## Scope

- Keep the ABRS popup usable after clicking `3개 한번에 가져오기`.
- Continue to collect Coupang files through background tabs without activating them.
- Production extension build version bump to `0.1.4`.

## Changes

- Replaced active tab focusing with passive tab preparation for ABRS batch collection.
- New Coupang collection tabs are opened with `active: false`.
- Existing Coupang tabs are waited on without calling `chrome.windows.update` or `chrome.tabs.update(... active: true)`.

## Verification

### Unit Tests

Command:

```bash
npm test
```

Result: PASS

- 41 tests passed.
- Added source guard that batch collection does not call active/focus APIs that close the popup.

### Type Check

Command:

```bash
npm run typecheck
```

Result: PASS

## Remaining Live Scope

- Chrome action popups are still owned by Chrome. If a user manually changes tabs, the popup can close.
- The extension no longer closes the popup by activating Coupang tabs during automatic collection.
