# ABRS Coupang XLSX 수집 및 캐시 다운로드 검증

- 검증일: 2026-07-21
- Extension: `0.1.8` production build
- 장부 기준일: `2026-04-18`
- 환경: 로그인된 Coupang Wing/광고센터 실제 Chrome 세션

## 실데이터 검증

| 구분 | 파일 | 크기 | 결과 |
| --- | --- | ---: | --- |
| 재고 현황 | `inventory_health_sku_info_20260721231659.xlsx` | 5,545 bytes | PASS |
| 판매 현황 | `Statistics-20260418~20260418_(0).xlsx` | 4,054 bytes | PASS |
| 광고비/정산 | `A01549099-dailySettlement-20260418-20260418.xlsx` | 8,481 bytes | PASS |
| 상품 리스트 | `price_inventory_260721.xlsx` | 11,158 bytes | PASS |

네 파일 모두 XLSX ZIP signature(`PK`)를 확인했다. 각 행의 저장 파일 다운로드 버튼을 눌렀을 때 Chrome 다운로드 항목이 새로 생성되고 `complete` 상태와 원본 캐시 크기가 일치했다.

상품 리스트는 Wing의 상품 조회/수정 화면에서 전체 상품 엑셀 요청을 생성하고, 완료 목록을 새로고침한 뒤 파일을 수집한다. 서버 파서는 상단 설명 행을 건너뛰어 헤더를 찾고 raw Coupang 상품 파일에서는 바코드가 비어 있는 행을 제외한다.

## 자동 검증

- `npm test`: 46/46 PASS
- `npm run typecheck`: PASS
- `npm run build:prod`: PASS
- `npm run test:e2e:abrs`: 8/8 PASS
- `./gradlew :app:test --tests 'com.saiload.oms.adapter.in.web.ledger.LedgerImportApiTest.should ignore product without barcode from raw Coupang price inventory'`: PASS

## 산출물

- unpacked extension: `/Users/admin/refacoring_project/saiload/onchak-extension/dist`
- 화면 캡처: `/tmp/onchak-abrs-v0.1.8-live-20260721.png`

현재 변경은 로컬 `develop` 작업 트리에 있으며 commit/push하지 않았다.
