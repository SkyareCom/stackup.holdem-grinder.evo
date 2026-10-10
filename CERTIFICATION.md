# Real PioSolver validation

`main` is not changed. Work is restricted to `feat/cinematic-premium-ui`.
Reference `d89775abd6860b74bceab36fe5a751536ff0ca33` is the blob of
`core/stackup-scenario-catalog.js`, not a commit. Reports record both the actual
commit and catalog blob.

## Current scope and source files

The supplied structural catalog was recovered: 194 filters in 26 sections, with
the requested `source_sha` added to every entry.
Its existing `CERTIFIED` fields mean structural validation only. They do not prove
GTO or 1,500 solved spots per filter. The original mathematical catalog, adapter,
generator and documentation were unavailable in this session. The mathematical
projection and `reports/stackup-MATH-CERTIFICATION-REPORT.json` therefore remain
`NOT_CERTIFIED`/`PENDING_EVIDENCE`. Exactly 18 filters require solver validation:
11 ICM and 7 PKO. Every `math_checks` entry states its pending status.
The supplied validator's constant mock EVs and incomplete ICM approximation have
been removed.

The new adapter builds and solves explicit heads-up postflop **chipEV** trees via
Pio's real stdin/stdout UPI. It reads hand order, EV, equity, strategy and
exploitability from the process. It does not fabricate ranges or infer a board.
Missing binary, invalid input, UPI error, timeout, unsupported model or incomplete
output blocks validation. There is no alternate mock solver.

Semantic evidence is currently accepted only for `mode:cash`, `seats:s2` and
`street:flop`, `street:turn`, `street:river`, with the board matching the street.
Other filter labels are blocked until their physical classification and solver
model are implemented. This deliberately prevents full 194-filter certification
with the current limited adapter; relabelling a cash job as ICM cannot bypass it.

Multi-player ICM, preflop, PKO/bounties and multiway are currently unsupported and
fail. Pio's documented `set_icm` configures two active players and supplied ICM
points; it is not a nine-player `calcICM({stacks,payouts})` API. Implementing that
model and validating its payoffs requires additional real inputs and a compatible
solver. Mathematical ICM equity by itself never certifies a GTO strategy.

No Pio installation is present at `/opt/piosolver` in the execution environment.
The actual live solve cannot be verified here. Failure tests establish the
blocking behavior, not solver accuracy or GTO certification.

## Run

Node 18+ and an installed, activated PioSolver executable are required. On Linux,
`PIO_PATH` must name an executable compatible with that environment; assigning a
directory does not install Pio or activate its license. A directory is accepted
only when it contains exactly one PioSolver binary.

```bash
export PIO_PATH=/absolute/path/to/PioSOLVER-edge.exe
node core/validate-solver.js --jobs=/absolute/path/to/real-jobs.json --section=river_special
node core/generate-gto-certified.js --report=reports/solver-validation-report.json
```

The requested safety checks are:

```bash
env -u PIO_PATH node core/validate-solver.js --section=icm_special
PIO_PATH=/opt/piosolver node core/validate-solver.js --section=icm_special
node --test scripts/test-pio-certification.cjs
```

Without `PIO_PATH`, exit code is 1 and the message is exactly:
`PIO_PATH não configurado. Nenhuma certificação GTO será emitida com dados simulados. Main intocada.`

## Real job schema

The JSON document must contain a nonempty `jobs` array. Each job must contain:

| Field | Required meaning |
| --- | --- |
| `filterKey` | Existing `section:id`, consistent with the actual game |
| `spotId` | Unique real spot identifier |
| `model` | `chipEV`; other models fail |
| `board` | Three, four or five distinct cards, such as card strings `As` |
| `ranges.OOP`, `ranges.IP` | 1,326 actual combo weights in `show_hand_order` order, each in [0,1] |
| `effectiveStack` | Positive integer chips |
| `pot` | Three nonnegative integer amounts [OOP, IP, dead], total positive |
| `lines` | Complete game tree's actual cumulative betting sequences, integer chips |
| `nodeId` | Pio decision node on the specified board |
| `hero`, `hand` | `OOP` or `IP`, and the actual two-card combo |
| `expectedEv` | Finite EV obtained from the app engine, in the same chip units/convention |
| `expectedStrategy` | Engine action probabilities, in Pio child order, adding to one |

No example ranges or placeholder jobs are installed. Missing jobs fail.
By default only the 18 ICM/PKO filters with `requires_solver_validation=true`
are selected. They remain blocked without complete real solver inputs and a
compatible model. `--section` narrows execution; `--all` means all supplied jobs
for those pending filters. `--full-solve` permits explicitly supplied supported
postflop jobs. A filtered run cannot certify the entire catalog.

The following npm commands are available: `validate:solver:icm`,
`validate:solver:pko`, `validate:solver:all`, and `certify:gto`.

## Evidence and certification gate

Each real result stores input, executable and transcript SHA-256 hashes, exact
command responses, engine comparison and the source identity. Startup/license
identity is excluded from saved command responses. Evidence is written into a
unique run directory. Reports always remain `NOT_CERTIFIED` until the separate
certification gate succeeds.

EV difference must be strictly below 0.5%, action probabilities within 0.5 percentage
points, and exploitability at most 0.5% of the root pot. A passing check validates
only the supplied game tree and combo, not unrestricted poker.

The generator rejects mock/simulated markers recursively, empty reports,
unvalidated jobs, missing or inconsistent evidence, stale source hashes,
duplicates and insufficient coverage. It requires **at least 1,500 distinct real
physical spots for every one of the 194 filters**. Before issuing a GTO catalog,
it reruns all jobs with the real Pio process. Hashes are integrity checks, not
independent proof of authenticity. No certificate is written on failure, and an
existing output is never silently overwritten.

Official protocol references:
- https://piosolver.com/docs/upi/basics/
- https://piosolver.com/docs/upi/commands/

## Verification in this session

- 28 automated failure/regression tests passed, including process timeout termination.
- Structural audit passed: 194 unique filters, 26 sections, no GTO claim.
- All 13 existing bank byte hashes matched; no bank contents changed.
- `validate-app.mjs` passed after correcting its outdated ADVANCE count to 136.
- Missing `PIO_PATH` and requested `/opt/piosolver` runs both returned exit code 1,
  with no GTO artifact created.
- A fresh code review found and regression tests covered unsupported filter
  relabelling, physical duplicate identities, blank numerical evidence, stale
  implementation bytes, timeout teardown and nested mock markers.
- The pre-existing coverage audit's commented-out ROOT declaration was repaired.
  This is an execution fix; it does not increase solved-spot counts or certify banks.

Live Pio accuracy remains unverified because the executable and real jobs are absent.
