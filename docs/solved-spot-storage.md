# Solved Spot External Storage

Status: migration-ready. The current Git banks remain fallback until storage parity is verified.

## Non-negotiable invariants
- 1 counted spot = 1 validated solver decision.
- Externalization does not alter validation, deduplication, classifiers or coverage semantics.
- Git stores code, schemas, coverage, growth/route plans, lightweight manifests and checksums.
- Full solved-decision payloads live in private object storage.
- Never commit or ship a service-role/secret key to the app.

## Object layout
solved-spots/<engine>/<family>/<solver-version>/<sha256>.json.gz

Objects are immutable and content-addressed. Repeating the same payload is idempotent.

## Migration gate
1. Generate + strict-validate bank using existing pipeline.
2. Canonicalize/compress and calculate SHA-256.
3. Upload to private storage.
4. Register metadata only after upload succeeds.
5. Verify downloaded SHA/count against local validated bank.
6. Recalculate coverage with identical counts.
7. Only after parity, stop persisting that heavy payload in Git.

## Runtime
The training runtime should request only partitions needed by active filters. During migration, local Git banks remain fallback so no training path is broken.
