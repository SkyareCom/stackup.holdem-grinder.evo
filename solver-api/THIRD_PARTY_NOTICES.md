# Third-party notices

## DCFR-SOLVER

The production solver service builds and runs **DCFR-SOLVER** by exinori.

- Repository: `exinori/DCFR-SOLVER`
- License: MIT
- Usage in StackUp Grinder: preflop blueprint/chart generation and postflop DCFR solves.

The upstream license is copied into the production container at
`/licenses/DCFR-SOLVER-LICENSE`.

No GTOpen or TexasSolver binaries are bundled by this production service.
Their adapter identifiers remain supported by the front-end normalization layer
for future licensed/configured integrations.


## poker_solver — push/fold chart bank

StackUp includes the short-stack heads-up push/fold chart bank from **amaster97/poker_solver**.

- Repository: `amaster97/poker_solver`
- License: MIT
- Included data: `data/solver/pushfold-hu-v1.json`
- Covered depths: 2–15 BB
- Decisions: SB jam/fold and BB call/fold vs SB jam
- Upstream convergence gate: final exploitability below 0.05 bb/100; the included v1 bank reports 0.0001 bb/100.
- Usage in StackUp Grinder: validated short-stack / push-fold training only. It is not used as a substitute for multiway, ICM, or PKO decisions.

The upstream MIT license is retained at `data/solver/pushfold-hu-v1.LICENSE.txt`.
