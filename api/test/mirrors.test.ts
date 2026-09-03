import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { TV_KEY_NAMES } from '../src/tv/keys.js';

/**
 * The frontend declares some of the API's types by hand rather than importing them —
 * `Snapshot`, and the remote's key names. That is deliberate: the two packages build
 * separately, and a shared module would be a build-setup change neither of them needs
 * for a handful of names.
 *
 * The cost of that choice is drift, and it is silent: add a key to `tv/keys.ts` and the
 * frontend simply does not know about it; remove one and the frontend can send a name
 * the API rejects at runtime. So the mirror is checked here instead — by reading the
 * frontend's source, which is ugly but is the whole point. A test that imported the
 * frontend would be a build coupling, which is the thing being avoided.
 */
const FRONTEND_API = new URL('../../frontend/src/api.ts', import.meta.url);

describe('the frontend mirrors', () => {
  it('lists exactly the remote keys the API accepts', () => {
    const source = readFileSync(FRONTEND_API, 'utf8');

    const declaration = source.match(/export type TvKeyName =([^;]+);/);
    assert.ok(
      declaration,
      'frontend/src/api.ts no longer declares `export type TvKeyName = …;`. If it was ' +
        'renamed, rename it here too; if the frontend now imports the API type, delete ' +
        'this test.',
    );

    const mirrored = [...declaration[1]!.matchAll(/'([a-z]+)'/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      mirrored,
      [...TV_KEY_NAMES].sort(),
      'TvKeyName in frontend/src/api.ts has drifted from TV_KEYS in api/src/tv/keys.ts',
    );
  });
});
