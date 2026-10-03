#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';

const [,, input, engine, family, solverVersion, out = 'solved-spot-manifest.json'] = process.argv;
if (!input || !engine || !family || !solverVersion) {
  console.error('usage: node scripts/package-solved-bank.mjs <bank.json> <engine> <family> <solverVersion> [manifest.json]');
  process.exit(2);
}
const raw = await readFile(input);
const parsed = JSON.parse(raw);
const decisions = Array.isArray(parsed) ? parsed : (parsed.spots ?? parsed.decisions);
if (!Array.isArray(decisions) || decisions.length < 1) throw new Error('bank_has_no_decisions');
const packed = gzipSync(raw, { level: 9 });
const sha256 = createHash('sha256').update(packed).digest('hex');
const objectPath = `${engine}/${family}/${solverVersion}/${sha256}.json.gz`;
const manifest = {
  schemaVersion: 1, engine, family, solverVersion, sha256,
  decisionCount: decisions.length, objectPath, compression: 'gzip',
  validated: true, sourceCommit: process.env.GITHUB_SHA ?? '', createdAt: new Date().toISOString()
};
const roundTrip = JSON.parse(gunzipSync(packed));
const roundTripDecisions = Array.isArray(roundTrip) ? roundTrip : (roundTrip.spots ?? roundTrip.decisions);
if (roundTripDecisions.length !== decisions.length) throw new Error('gzip_roundtrip_count_mismatch');
await writeFile(`${input}.gz`, packed);
await writeFile(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
