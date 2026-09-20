# NextEval numerical evidence contract, version 1

## Ownership and first principles

The benchmark produces evidence. The research repository preserves original
artifacts. The website indexes that evidence and renders derived views; it does
not own an optimization loop, execute submissions, or serve model credentials.
An experiment batch is a source/job, not the primary result identity.

The conceptual entities are:

| Entity | Identity and required evidence |
| --- | --- |
| Problem | Library + library revision + problem ID + parameters + dimension |
| Feature | Ordered feature composition, distributions, levels, implementation revision |
| Task | Problem + feature contract + evaluation budget/protocol |
| Instance | Task + realized x0 + feature/noise seeds or realization fingerprint |
| Participant | Solver commit/config + harness/version + model ID + reasoning/config; classical solvers have no model |
| Run | One participant's attempt on one instance; attempts and repeats are separate |
| Evaluation | Monotone ordinal, sampled x, observed value, evaluator-only clean value, error/nonfinite status |
| Source | Original artifact hash + repository commit/path + import adapter/version |
| Profile view | Explicit task/instance/run membership + participant set + target/reference policy + scoring engine/version |

This follows the task/agent/trial/job separation in
[Harbor](https://www.harborframework.com/docs/core-concepts) and the
algorithm/problem/trial organization of
[COCO](https://numbbo.github.io/coco-doc/apidocs/cocopp/cocopp.cococommands.html).
COCO also distinguishes function, dimension and instance in its
[experiment interface](https://numbbo.github.io/coco-doc/C/).

## Current import and storage

`index.json` is a generated index, not the primary numerical record. It contains
problem-feature discovery tasks, participant configurations, provenance sources,
and profile-view manifests. `tasks/<task-id>.json` contains all imported runs
for that logical problem/dimension/feature family, across sources. An exact
feature variant and a source-local instance ID remain attached to every run.
This distinction matters: a discovery task is not proof of identical instances.

The importer reads every solver column and repetition in the five HDF5 artifacts
previously represented on the website. It no longer restricts histories to the
models selected in a paper figure. This is not yet a scan of every experiment in
the research repository. In particular, the Qwen comparison HDF5 contains two
columns; its separate original five-solver archive is not silently substituted.

Original HDF5, JSON, PDF and PNG artifacts remain unchanged. The new catalog is
an additive projection. All actual clean objective values up to `n_evals` are
stored, not only the running minimum. Padding after `n_evals` is excluded.
NaN/Inf/-Inf are represented as explicit strings; best-so-far is null until a
finite observation exists. No coordinate or noisy value is inferred from a
clean objective history. Missing x, x0, observed values and seeds are null.
`problem_names_options` is source-level selection metadata, not row-aligned
problem identity; rows are joined by actual problem name and dimension.

Run IDs hash the source artifact and exact HDF5 locator. Reimporting identical
evidence does not multiply runs. Equal numerical curves do not prove duplicate
executions, so they are not automatically discarded. Participant variants remain
source-scoped when their full solver/harness configuration is unknown. Source
commits are not misreported as solver commits.

## Comparison admission

All recorded runs are discoverable under their problem and feature family.
Cross-source overlays are exploratory and visibly labeled. Repetition 1 in two
archives is not automatically the same random instance. Matching initial
function values does not establish matching x0 or noise realization.

Automatic cross-source pooled profiles require a verified shared instance and
protocol identity, explicit participant membership, a declared policy for
missing/failed runs and retries, and common clean-value semantics. An unknown
field fails this admission gate; it is not a wildcard. Until that evidence is
available, existing source-local profile comparisons remain independent derived
views. Their scores cannot be concatenated into a global ranking. No favorable
retry or lower objective is selected to repair an incomplete record.

Numerical termination, provider/session completion and artifact completeness
are separate statuses. In particular, a false HDF5 abnormal-termination flag
does not certify provider health; the catalog marks provider health unknown and
retains each source's known caveats.

## Rendering and future ingestion

All on-page profiles and histories are native website charts. Profiles use
OptiProfiler's exported numerical coordinates and scores, not image tracing or
a new JavaScript scoring formula. Original PDFs remain optional downloads.
The displayed 1e-6 profile is not the ten-tolerance aggregate score. A legend
toggle changes visibility only, not the reference set.

Future benchmark submissions should emit the entities above directly, with
evaluator-owned clean data kept outside the model context. Store immutable run
metadata plus a streamed evaluation ledger and separate observable agent-event
artifacts; expose only sanitized evidence to the website. Raw per-run files may
live in object storage while the catalog/index lives in a database. For this
read-only research archive, versioned JSON plus hashed source artifacts is
sufficient and keeps website and benchmark installations independent.

Rebuild with `export_catalog.py` after adding a verified source adapter. Extend
`contracts/catalog-sources.json` and append artifacts; do not add a new UI page
per batch. The registry normalizes documented feature composition/parameters;
opaque legacy stamps remain separate when those parameters are unavailable.
Any new profile is an explicit derived view over admitted run IDs. Preserve
old views as revisions instead of mutating their participant/reference set.
