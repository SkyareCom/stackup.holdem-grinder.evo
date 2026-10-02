# StackUp Solved Spot Core v1

This is the reusable solved-spot contract for StackUp poker training apps.

## Non-negotiable rule

**One counted spot = one solver-resolved decision for one concrete scenario + one hand.**

Coverage must never be increased by:
- hand-combo expansion;
- suit permutation;
- board permutation;
- cosmetic presentation variants;
- CASH/MTT context projection;
- position projection;
- AI-generated strategy without solver validation.

AI may propose the next scenario to solve. The solver/mathematical engine remains the source of strategy.

## Growth milestones

1. Publish floor: **1,500 validated solved spots per filter**.
2. Current production goal: **2,000 per filter**.
3. Expansion: 5,000.
4. Expansion: 10,000.
5. Long-term bank: **20,000+ per filter**.

The growth planner always works deficit-first: filters below 1,500 receive priority before filters already above the publish floor.

## Portable files

Copy these files to another StackUp training app:
- `core/stackup-solved-spot-contract.js`
- `data/solver/solved-spot-policy.json`
- `scripts/plan-solved-spot-growth.mjs`

The target app's coverage auditor must call `StackUpSolvedSpotContract.validateSolvedDecision()` for each scenario/hand pair.

## Required solved-spot provenance

A counted decision needs:
- solver identifier;
- solve reference (`solveId` or immutable solver node id);
- complete scenario state;
- exact postflop hand, or a solver-native preflop hand class;
- legal strategy actions;
- valid action frequencies totaling approximately 100%;
- no context or position projection.

## Storage convention for scale

Large banks should be sharded instead of becoming one giant JSON:

```
data/solver/
  solved/
    preflop/
      shard-0001.json
      shard-0002.json
    flop/
    turn/
    river/
    icm/
    pko/
```

Default shard target: 500 solved decisions. A manifest should list shard hashes, solver version, generated date and validation version.

## Migration rule

Existing solver banks remain readable. Coverage and future publishing, however, use the strict solved count. A filter is considered production-ready only when its strict count reaches the configured publish floor.
