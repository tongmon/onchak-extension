import assert from 'node:assert/strict';
import test from 'node:test';
import { createFileFromAbrsCoupangDownload } from '../src/pages/abrs-automation/api/abrs-coupang-download-file.ts';

test('createFileFromAbrsCoupangDownload restores an xlsx File from base64 payload', async () => {
  const file = createFileFromAbrsCoupangDownload({
    slot: 'inventoryHealth',
    fileName: 'inventory_health_sku_info_20260706223816.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: btoa('xlsx'),
  });

  assert.equal(file.name, 'inventory_health_sku_info_20260706223816.xlsx');
  assert.equal(
    file.type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  assert.equal(await file.text(), 'xlsx');
});
