import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMessage, emptyState } from '../src/device/state.js';
import { parseMessage } from '../src/protocol/parse.js';

/** Feed raw frames through the parser into the cache, the way the transport does. */
const fold = (...frames: string[]) =>
  frames.reduce((state, frame) => applyMessage(state, parseMessage(frame)), emptyState());

test('folds zone frames into the cache', () => {
  const state = fold('Z1POW1', 'Z1VOL-81.0', 'Z1MUT0', 'Z1INP3', 'Z1AINDolby D+');
  assert.deepEqual(state.zones[1], {
    power: true,
    volumeDb: -81,
    muted: false,
    input: 3,
    audioFormat: 'Dolby D+',
    tone: {},
  });
});

test('keeps zones apart', () => {
  const state = fold('Z1POW1', 'Z2POW0');
  assert.equal(state.zones[1].power, true);
  assert.equal(state.zones[2].power, false);
});

test('folds identity, input names and speaker profiles', () => {
  const state = fold('IDMMRX 540', 'ICN4', 'IS3INTV / PlayStation', 'SSSP20Corner', 'IS3SP1');
  assert.equal(state.model, 'MRX 540');
  assert.equal(state.inputCount, 4);
  assert.equal(state.inputNames[3], 'TV / PlayStation');
  assert.equal(state.profileNames[2], 'Corner');
  // 0-based on the wire: input 3 is on profile 2.
  assert.equal(state.inputProfiles[3], 1);
});

test('folds tone and subwoofer trim, keeping the three apart', () => {
  const state = fold('Z1TON04.5', 'Z1TON1-3.0', 'Z1LEV12.0');
  assert.deepEqual(state.zones[1].tone, { bass: 4.5, treble: -3, subwoofer: 2 });
});

test('folds the front panel display setting', () => {
  assert.equal(fold('GCFPDI1').frontPanelInfo, 1);
  assert.equal(fold('GCFPDI0').frontPanelInfo, 0);
});

test('ignores frames it cannot make sense of', () => {
  const state = fold('Z1VOLnonsense', '!IZ9BAD', 'WAT42');
  assert.equal(state.zones[1].volumeDb, undefined);
  assert.equal(state.model, undefined);
});
