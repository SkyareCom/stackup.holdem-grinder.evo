# STACKUP HOLD'EM GRINDER — Scaling Architecture

## Commercial boundary

GRINDER is an independent product. Its plans are GRINDER FREE, GRINDER EDGE and GRINDER FULL. No Grinder plan grants the complete paid tier of another StackUp product.

Shared ecosystem services may identify the user and coordinate benefits, but Grinder owns its training, progress, stats, content rules and product conversion funnel.

## Phase 1 architecture (now to 1,000 users)

- Static/PWA frontend on CDN/GitHub Pages.
- `core/stackup-runtime.js` provides product-scoped identity, plan metadata, entitlements, analytics queue, feature flags and API client.
- PostgreSQL is the future system of record.
- StackUp ID is the shared identity key; anonymous usage remains possible until login is available.
- Payments are server-authoritative. The client may cache a subscription snapshot but never decides billing truth.
- Analytics are product-scoped with `product=grinder`.
- No microservices yet. Start with one Grinder API plus shared identity/billing services.

## Service boundaries

### Shared across StackUp

- StackUp ID / authentication
- customer and payment provider mapping
- subscriptions and entitlement issuance
- coupons / benefits / cross-sell eligibility
- analytics ingestion
- notification preferences
- fraud / abuse controls

### Grinder-specific

- spot library
- training generation
- scenario rules
- training sessions and attempts
- Grinder progress and stats
- recommendations
- Grinder FREE / EDGE / FULL feature gates

A failure in EVO-specific APIs must never be on the critical path for Grinder training.

## API boundary

Recommended namespaces:

- `/v1/identity/*` — shared
- `/v1/billing/*` — shared
- `/v1/entitlements?product=grinder` — shared
- `/v1/analytics/events/batch` — shared ingestion
- `/v1/grinder/training/*` — Grinder
- `/v1/grinder/spots/*` — Grinder
- `/v1/grinder/progress/*` — Grinder
- `/v1/grinder/stats/*` — Grinder

Every shared request must carry the product identity. The browser runtime sends `X-StackUp-Product: grinder`.

## Plans and gating

Current runtime defines the commercial capability model, but enforcement is intentionally OFF until backend billing exists.

- FREE: core training, basic spots, basic stats
- EDGE: advanced training, history, goals, advanced stats, recommendations
- FULL: complete training, advanced personalization, premium content, early access

Do not hide or lock the current production UI merely because the runtime defaults to FREE. Enable gates only after server-side entitlements are authoritative.

## Analytics

Minimum metrics per Grinder:

- DAU / WAU / MAU
- D1 / D7 / D30
- training started → completed
- FREE → EDGE
- EDGE → FULL
- renewal / churn
- ARPU / ARPPU / LTV / CAC
- cross-sell viewed → trial → converted
- % users with 2+ paid StackUp apps

PII must not be sent inside arbitrary analytics properties.

## Scaling phases

### 0–1,000 users
One API deployment, managed Postgres, object storage only if assets become dynamic. Daily backups. Basic logs and uptime checks.

### 1,000–10,000
Connection pooling, indexed queries, background job queue for emails/analytics aggregation, CDN for dynamic assets, structured logs and error tracking.

### 10,000–100,000
Redis for hot configuration/entitlements, read replicas when query evidence requires them, async analytics pipeline, rate limiting by StackUp ID/IP, automated restore drills.

### 100,000–1,000,000
Separate shared identity/billing workload from Grinder API, queue-based event ingestion, autoscaling stateless API replicas, database partitioning for high-volume attempts/events, warehouse for product analytics.

### 1,000,000+
Multi-region CDN, regional API strategy where latency requires it, dedicated event streaming/warehouse, regional disaster recovery, stricter SLOs. Do not shard operational data until metrics show the database is the bottleneck.

## Reliability rules

- Server is source of truth for paid access.
- Idempotency keys for purchase/upgrade/cancel mutations.
- Webhooks are verified and replay-safe.
- Subscription events are append-audited.
- Analytics failure must never block training.
- Cross-sell failure must never block Grinder.
- Feature flags provide kill switches for risky launches.
- Every schema change is backward compatible during rolling deployment.

## Next implementation order

1. Connect a real API base URL.
2. Implement StackUp ID login/session exchange.
3. Add server-side subscription + entitlement endpoints.
4. Wire existing training start/completion events.
5. Persist training sessions and progress.
6. Add EDGE/FULL pricing UI driven by remote product config.
7. Add cross-sell offers as separate destination-product entitlements/trials.
8. Add warehouse dashboards only after event quality is verified.

## Cost principle

Scale from evidence. Prefer managed services and one deployable Grinder API until load, team size or failure isolation justifies splitting it. Product boundaries should be strong in data/contracts before they become separate infrastructure.
