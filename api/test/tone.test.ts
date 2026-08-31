import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TONE_MAX_DB, TONE_MIN_DB, quantiseTone } from '../src/device/tone.js';

test('puts a requested level on the 0.5 dB grid the receiver accepts', () => {
  assert.equal(quantiseTone(4.5), 4.5);
  assert.equal(quantiseTone(0.25), 0.5);
  assert.equal(quantiseTone(-2.3), -2.5);
  assert.equal(quantiseTone(0), 0);
});

test('clamps rather than letting the receiver reject the command', () => {
  // The unit answers Z1TON015; with !EZ1TON015 and leaves the level alone, so an
  // out-of-range request has to be made legal before it reaches the wire.
  assert.equal(quantiseTone(15), TONE_MAX_DB);
  assert.equal(quantiseTone(-15), TONE_MIN_DB);
});
