# DCFR line-bank integration gate — 2026-10-10

## Verified evidence
- GitHub Actions run 38056961962 succeeded for commit 6c70a24; source-bank integrity: 13 banks, 453359 strategy entries, zero structural failures.
- data/solver/line-bank.json is EMPTY (0 spots) in the expansion branch; never treat it as a solved bank.
- PR #36 changes only the generator and workflow, not a populated line-bank.json.
- build-line-bank.yml generates 20 per-runout artifacts and aggregates them **inside the runner**. Its commit step runs only when github.ref == refs/heads/main; PR executions therefore do not persist the aggregate to the branch.
- The workflow's 1-day shard artifact retention risks loss of evidence; a successful job alone does not integrate the generated data.

## Required before packaging or publication
1. Preserve and retrieve the aggregate generated line-bank.json as a downloadable artifact with its SHA-256, upstream commit, run ID and parameters.
2. Validate 20 runouts, canonical scenario+exact-hand uniqueness, solver metadata, board integrity, and >=1500 unique decisions per applicable filter.
3. Integrate the actual aggregate by reviewed commit on the designated feature branch only (never main).
4. Implement independent solver replay with original ranges, board, pot, stack, sizing, iterations and solver version; compare strategy and EV with documented numerical tolerances.
5. Keep empty-bank packaging failure and all Supabase publication gates fail-closed until independent replay and 194-filter parity pass.

STATUS: NOT_CERTIFIED. This document records investigation, not solver certification.
