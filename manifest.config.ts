import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Onchak Extension',
  description:
    'Production-grade MV3 starter architecture with React, TypeScript, Mantine, Zustand, React Query, and Feature-Sliced Design.',
  version: packageJson.version,
  minimum_chrome_version: '120',
  action: {
    default_title: 'Onchak Extension',
    default_popup: 'src/app/entrypoints/popup/index.html',
  },
  options_page: 'src/app/entrypoints/options/index.html',
  permissions: ['storage'],
  host_permissions: ['https://*/*', 'http://*/*'],
  background: {
    service_worker: 'src/app/entrypoints/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://*/*', 'http://*/*'],
      js: ['src/app/entrypoints/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
});

