import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const projectRoot = process.cwd();
const extensionPath = path.resolve(projectRoot, 'dist');
const manifestPath = path.join(extensionPath, 'manifest.json');
const profileDir =
  process.env.ONCHAK_ABRS_PROFILE_DIR ??
  path.join(os.homedir(), '.playwright-profiles', 'onchak-coupang-wing');
const startUrl = process.env.ONCHAK_ABRS_START_URL ?? 'https://wing.coupang.com';

if (!fs.existsSync(manifestPath)) {
  console.error(
    `Extension build was not found at ${manifestPath}. Run "npm run build" first.`,
  );
  process.exit(1);
}

fs.mkdirSync(profileDir, { recursive: true });

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(startUrl);

console.log(`OnChak extension loaded from: ${extensionPath}`);
console.log(`Persistent profile directory: ${profileDir}`);
console.log('Log in to Coupang Wing in this browser window when prompted.');
console.log('Close the browser window or press Ctrl+C to stop the launcher.');

process.on('SIGINT', () => {
  void context.close();
});

await new Promise((resolve) => {
  context.on('close', resolve);
});
