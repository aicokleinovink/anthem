import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../src/config.js';
import { clampDb, dbToPercent, percentToDb } from '../src/device/volume.js';

test('matches the device: -81.0 dB is 9%', () => {
  assert.equal(dbToPercent(-81), 9);
  assert.equal(percentToDb(9), -81);
});

test('clamps writes to the configured range', () => {
  assert.equal(clampDb(config.maxVolumeDb + 1), config.maxVolumeDb);
  assert.equal(clampDb(-200), config.minVolumeDb);
  assert.equal(clampDb(config.maxVolumeDb - 5), config.maxVolumeDb - 5);
});

test('percent conversion is bounded at both ends', () => {
  assert.equal(percentToDb(0), config.minVolumeDb);
  assert.equal(percentToDb(100), config.deviceMaxVolumeDb);
  assert.equal(percentToDb(150), config.deviceMaxVolumeDb);
});
