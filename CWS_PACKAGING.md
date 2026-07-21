# Chrome Web Store 패키징

## 1. 빌드

```bash
npm ci
npm run build:prod
```

`dist/manifest.json`이 생성되었는지 확인합니다.

## 2. ZIP 생성

ZIP 내부 최상위에 `manifest.json`이 있어야 합니다. `dist` 폴더 자체나 프로젝트 루트를 압축하지 않습니다.

### macOS / Linux / Git Bash

```bash
(cd dist && zip -r ../onchak-extension-0.1.4.zip .)
```

### Windows PowerShell

```powershell
Compress-Archive -Path .\dist\* -DestinationPath .\onchak-extension-0.1.4.zip -Force
```

## 3. 구조 확인

정상 예시:

```text
manifest.json
service-worker-loader.js
icons/
assets/
src/
```

잘못된 예시:

```text
dist/manifest.json
```

또는

```text
onchak_ext/manifest.config.ts
```
