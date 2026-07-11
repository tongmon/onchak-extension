import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('production build config targets the Zephly API origin', () => {
  const envProduction = readFileSync('.env.production', 'utf8');

  assert.match(
    envProduction,
    /^VITE_API_BASE_URL=https:\/\/zephlyglobal\.com$/m,
  );
});

test('auth storage does not treat the Zephly API origin as a legacy config', () => {
  const authStorageSource = readFileSync(
    'src/entities/auth/model/auth-storage.ts',
    'utf8',
  );

  assert.doesNotMatch(
    authStorageSource,
    /config\?\.apiBaseUrl === productionAuthApiBaseUrl/,
  );
});

test('production build migrates a previously stored local API origin to the production default', () => {
  const authStorageSource = readFileSync(
    'src/entities/auth/model/auth-storage.ts',
    'utf8',
  );

  assert.match(
    authStorageSource,
    /const localAuthApiBaseUrl = 'http:\/\/localhost:8080';/,
  );
  assert.match(
    authStorageSource,
    /defaultAuthConfig\.apiBaseUrl !== localAuthApiBaseUrl/,
  );
  assert.match(
    authStorageSource,
    /config\?\.apiBaseUrl === localAuthApiBaseUrl/,
  );
});
