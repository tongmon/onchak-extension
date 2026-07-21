# ABRS Auth Session Dist Verification

Date: 2026-07-20
Extension version: `0.1.7`

## Artifact

- Dist directory: `/Users/admin/refacoring_project/saiload/onchak-extension/dist`
- ZIP: `/Users/admin/refacoring_project/saiload/onchak-extension-dist-v0.1.7-prod-20260720-abrs-auth-session.zip`
- SHA-256: `c38924f55092672e8483ad188bf1404808f229f7d300fe65fd67c3c03ae6ee2a`
- `dist/manifest.json`: `Onchak Extension`, version `0.1.7`
- API origin: `https://zephlyglobal.com`

## Dist-Based Production Test

Playwright loaded the generated `dist` directory as an unpacked Chrome extension.

- Extension ID: `badehielmafamdjagofjjanpdooonfpb`
- Production login through the Extension UI: HTTP 200
- Selected ledger date: `2026-04-18`
- Production `POST /api/ledger/imports`: HTTP 200
- Import ID: `LI-6A062DF82541403E9E411ABF3E0FCA7D`
- UI result: `업로드 완료`
- Backend import status after upload: `PARSED`
- Exact-date summary: one import, one day, sales 22,000 KRW, ad spend 1,209 KRW, one trend point

Uploaded files:

- `inventory_health_sku_info_20260617214805.xlsx`
- `Statistics-20260418~20260418_(0).xlsx`
- `A01549099-dailySettlement-20260418-20260418.xlsx`

The reported `inventory_health_sku_info_20260720231509.xlsx` was not available on disk, so the existing `04_18` inventory workbook was used.

## Additional Verification

- `npm test`: PASS, 45/45
- `npm run build:prod`: PASS
- Playwright unauthorized upload scenario: PASS
- ZIP integrity test: PASS
- macOS metadata entries removed from the ZIP

## Deployment Note

The `0.1.7` Extension handles HTTP 401 by clearing the stale local session and returning to the login screen. The backend R2DBC session persistence change is still local and must be deployed separately to preserve sessions across future backend restarts.
