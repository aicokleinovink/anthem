import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStatus, seekUrl } from '../src/player/bluos.js';

const BASE = 'http://192.168.2.15:11000';

/** A trimmed copy of what the Node actually returns for Spotify Connect. */
const SPOTIFY = `<?xml version="1.0" encoding="UTF-8"?>
<status etag="a5052bf9decc70950cb8734fca56abe2"><album>Wu-Tang Forever</album>
<artist>Wu-Tang Clan</artist>
<image>https://i.scdn.co/image/ab67616d000</image>
<secs>129</secs><service>Spotify</service><state>stream</state>
<title1>Severe Punishment (feat. U-God &amp; RZA)</title1>
<title2>Wu-Tang Clan</title2><title3>Wu-Tang Forever</title3><totlen>290</totlen></status>`;

test('reads a playing track', () => {
  const { now, etag } = parseStatus(SPOTIFY, BASE);
  assert.equal(etag, 'a5052bf9decc70950cb8734fca56abe2');
  assert.equal(now.state, 'playing'); // BluOS says "stream" for a service
  assert.equal(now.title, 'Severe Punishment (feat. U-God & RZA)'); // entity decoded
  assert.equal(now.artist, 'Wu-Tang Clan');
  assert.equal(now.album, 'Wu-Tang Forever');
  assert.equal(now.elapsed, 129);
  assert.equal(now.duration, 290);
  assert.equal(now.service, 'Spotify');
});

test('reads whether the track can be seeked', () => {
  const seekable = (xml: string) => parseStatus(xml, BASE).now.canSeek;
  // Verified against the unit: Spotify Connect reports canSeek="1".
  assert.equal(seekable('<status><canSeek>1</canSeek></status>'), true);
  assert.equal(seekable('<status><canSeek>0</canSeek></status>'), false);
  // Absent entirely — live radio — is not seekable.
  assert.equal(seekable('<status><state>stream</state></status>'), false);
});

test('seeks to a whole second, never below zero', () => {
  assert.equal(seekUrl(93.6), '/Play?seek=94');
  assert.equal(seekUrl(-4), '/Play?seek=0');
});

test('maps the states we care about', () => {
  const state = (raw: string) =>
    parseStatus(`<status><state>${raw}</state></status>`, BASE).now.state;
  assert.equal(state('play'), 'playing');
  assert.equal(state('stream'), 'playing');
  assert.equal(state('pause'), 'paused');
  assert.equal(state('stop'), 'stopped');
  assert.equal(state('connecting'), 'loading');
});

test('makes a relative artwork path absolute', () => {
  const { now } = parseStatus('<status><image>/Artwork?service=LocalMusic</image></status>', BASE);
  assert.equal(now.image, `${BASE}/Artwork?service=LocalMusic`);
});

test('handles live radio, which has no length', () => {
  const { now } = parseStatus(
    '<status><state>stream</state><title1>BBC 6 Music</title1><secs>84</secs></status>',
    BASE,
  );
  assert.equal(now.duration, null);
  assert.equal(now.elapsed, 84);
});

test('falls back to title2/title3 when artist and album are absent', () => {
  const { now } = parseStatus(
    '<status><title1>Track</title1><title2>Someone</title2><title3>Somewhere</title3></status>',
    BASE,
  );
  assert.equal(now.artist, 'Someone');
  assert.equal(now.album, 'Somewhere');
});

test('connecting is a track change, not a stop', () => {
  // The Node reports this between tracks; treating it as stopped makes the player
  // vanish and come back every time you skip.
  const { now } = parseStatus('<status><state>connecting</state></status>', BASE);
  assert.equal(now.state, 'loading');
});
