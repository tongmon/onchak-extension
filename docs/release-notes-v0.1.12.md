# v0.1.12

- 서버에서 세션 유효성을 확인하고, 만료 시 다시 로그인해 보관된 결과·첨부를 이어서 처리합니다. MFA 등록·인증과 서버 로그아웃을 지원합니다.
- 초안·결과·ABRS 첨부는 API 환경과 계정별로 보관합니다. 업그레이드 전 소유자가 확인되는 기존 자료만 해당 계정으로 옮깁니다.
- 마진 결과에 입력 통화·환율·판매가와 계산 버전을 보존합니다. 월 매출과 월 마진을 구분하고 부가세·ROAS를 Web/Backend SOURCING_MARGIN_V2에 맞췄습니다.
- 같은 계산 결과의 재시도는 clientResultId를 유지합니다. 서버 접수 응답을 확인한 뒤 보관한 결과를 정리합니다.
- ABRS 파일 다운로드 권한을 추가했습니다. 접수 후 날짜와 importId가 지정된 웹 검토 링크를 제공합니다. 접수 완료와 계산 완료를 구분합니다.

Backend/Web v0.3.1과 함께 사용합니다. `npm test` 58개 및 실제 Chromium E2E 13개, local/production 빌드를 검증했습니다. 실제 Coupang 계정의 신규 다운로드는 별도 확인이 필요합니다.

기존 unpacked 확장은 같은 dist 경로를 교체하고 확장 및 대상 탭을 새로고침합니다. 새 경로에서 설치할 때는 변경된 extension ID가 서버 CORS 허용 목록에 있는지 확인합니다. 기본 production API는 https://zephlyglobal.com이며 local 빌드는 http://localhost:8080을 사용합니다.
