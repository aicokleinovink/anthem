import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commands } from '../src/protocol/commands.js';
import { parseMessage, splitFrames, toBoolean, toNumber } from '../src/protocol/parse.js';

test('splits a buffer into complete frames and keeps the remainder', () => {
  const { frames, rest } = splitFrames('Z1POW1;Z1VOL-81.0;Z1MU');
  assert.deepEqual(frames, ['Z1POW1', 'Z1VOL-81.0']);
  assert.equal(rest, 'Z1MU');
});

test('parses zone frames, preferring PVOL over POW', () => {
  assert.deepEqual(parseMessage('Z1PVOL9'), { kind: 'zone', zone: 1, key: 'PVOL', value: '9' });
  assert.deepEqual(parseMessage('Z1POW1'), { kind: 'zone', zone: 1, key: 'POW', value: '1' });
  assert.deepEqual(parseMessage('Z2VOL-81.0'), { kind: 'zone', zone: 2, key: 'VOL', value: '-81.0' });
});

test('parses tone frames, including a value that starts with the key digit', () => {
  // Z1TON0 + "0.5": the key ends in a digit and so does the payload, which is exactly
  // the case the longest-first key ordering exists to get right.
  assert.deepEqual(parseMessage('Z1TON00.5'), { kind: 'zone', zone: 1, key: 'TON0', value: '0.5' });
  assert.deepEqual(parseMessage('Z1TON1-3.0'), { kind: 'zone', zone: 1, key: 'TON1', value: '-3.0' });
  assert.deepEqual(parseMessage('Z1LEV12.0'), { kind: 'zone', zone: 1, key: 'LEV1', value: '2.0' });
});

test('parses global frames and input names', () => {
  assert.deepEqual(parseMessage('IDMMRX 540'), { kind: 'global', key: 'IDM', value: 'MRX 540' });
  assert.deepEqual(parseMessage('IS1INHDMI 1'), { kind: 'inputName', input: 1, value: 'HDMI 1' });
});

test('parses the front panel display setting', () => {
  assert.deepEqual(parseMessage('GCFPDI1'), { kind: 'global', key: 'GCFPDI', value: '1' });
});

test('parses speaker profile frames, keeping IS...IN and IS...SP apart', () => {
  assert.deepEqual(parseMessage('IS3SP1'), { kind: 'inputProfile', input: 3, value: '1' });
  assert.deepEqual(parseMessage('SSSP10Center'), { kind: 'profileName', profile: 1, value: 'Center' });
  assert.deepEqual(parseMessage('SSSP20Corner'), { kind: 'profileName', profile: 2, value: 'Corner' });
  // Still an input name, not a profile.
  assert.equal(parseMessage('IS2INAirplay').kind, 'inputName');
});

test('flags rejected commands and unknown frames', () => {
  assert.equal(parseMessage('!Z9POW1').kind, 'error');
  assert.equal(parseMessage('WAT42').kind, 'unknown');
});

test('coerces payloads without producing NaN', () => {
  assert.equal(toNumber('-81.0'), -81);
  assert.equal(toNumber('abc'), undefined);
  assert.equal(toBoolean('1'), true);
  assert.equal(toBoolean('x'), undefined);
});

test('builds the verified command strings', () => {
  assert.equal(commands.power(1, true), 'Z1POW1;');
  assert.equal(commands.volumeDbQuery(1), 'Z1VOL?;');
  assert.equal(commands.volumePercent(2, 45.4), 'Z2PVOL45;');
  assert.equal(commands.muteToggle(1), 'Z1MUTt;');
  // VUP/VDN take no argument on this firmware; 'Z1VDN3;' is rejected as invalid.
  assert.equal(commands.volumeDown(1), 'Z1VDN;');
  assert.equal(commands.volumeUp(1), 'Z1VUP;');
  assert.equal(commands.model(), 'IDM?;');
  assert.equal(commands.input(1, 3), 'Z1INP3;');
  assert.equal(commands.inputNameQuery(3), 'IS3IN?;');
  assert.equal(commands.audioFormatQuery(1), 'Z1AIN?;');
  // 0-based on the wire: value 1 selects profile 2.
  assert.equal(commands.inputProfile(3, 1), 'IS3SP1;');
  assert.equal(commands.inputProfileQuery(3), 'IS3SP?;');
  assert.equal(commands.profileNameQuery(2), 'SSSP20?;');
  assert.equal(commands.frontPanelInfoQuery(), 'GCFPDI?;');
  assert.equal(commands.frontPanelInfo(0), 'GCFPDI0;');
  // Always one decimal, which is the form the receiver itself uses.
  assert.equal(commands.tone(1, 'bass', 4.5), 'Z1TON04.5;');
  assert.equal(commands.tone(1, 'treble', -3), 'Z1TON1-3.0;');
  assert.equal(commands.tone(1, 'subwoofer', 2), 'Z1LEV12.0;');
  // Never "-0.0": the unit has only ever been asked for "0.0".
  assert.equal(commands.tone(1, 'bass', -0), 'Z1TON00.0;');
  assert.equal(commands.toneQuery(1, 'subwoofer'), 'Z1LEV1?;');
});
