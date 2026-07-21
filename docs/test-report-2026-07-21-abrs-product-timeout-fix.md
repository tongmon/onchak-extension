# ABRS 상품 리스트 수집 시간초과 수정 검증

- 검증일: 2026-07-21
- Extension: `0.1.9` production build
- 실제 기준일: `2026-04-18`

## 재현 결과

로그인된 Coupang Wing 세션에서 상품 리스트 가져오기를 처음 실행했을 때 파일 생성이 기존 60초 제한을 넘겼다. 팝업 fallback이 이 오류를 숨기고 `content script가 연결되지 않았습니다`로 잘못 표시했다.

## 수정 내용

- 상품 리스트 Excel 생성 대기를 60초에서 최대 3분으로 연장
- content script 수신자 부재일 때만 background fallback 실행
- 실제 Coupang API 오류 및 시간초과 오류는 그대로 사용자에게 표시
- 실패한 상품 생성 요청을 background에서 중복 실행하지 않도록 정리

## 실데이터 재검증

- 새 `0.1.9` Chrome 세션에서 상품 리스트 첫 클릭 성공
- 파일: `price_inventory_260721.xlsx`
- 크기: 11,158 bytes
- XLSX ZIP signature: PASS
- Extension cache 갱신: PASS
- 저장 파일 다운로드: Chrome `complete`, 11,158 bytes

## 자동 검증

- `npm test`: 47/47 PASS
- `npm run typecheck`: PASS
- `npm run build:prod`: PASS
- `npm run test:e2e:abrs`: 8/8 PASS

검증한 production 산출물은 `/Users/admin/refacoring_project/saiload/onchak-extension/dist`에 생성했다.
