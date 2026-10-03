#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const [,, gzPath, manifestPath] = process.argv;
if (!gzPath || !manifestPath) process.exit(2);
const [gz, manifestRaw] = await Promise.all([readFile(gzPath), readFile(manifestPath,'utf8')]);
const manifest=JSON.parse(manifestRaw);
const sha=createHash('sha256').update(gz).digest('hex');
if (sha !== manifest.sha256) throw new Error('sha256_mismatch');
const bank=JSON.parse(gunzipSync(gz));
const decisions=Array.isArray(bank)?bank:(bank.spots??bank.decisions);
if (!Array.isArray(decisions) || decisions.length !== manifest.decisionCount) throw new Error('decision_count_mismatch');
console.log(JSON.stringify({ok:true,sha256:sha,decisionCount:decisions.length,objectPath:manifest.objectPath}));
