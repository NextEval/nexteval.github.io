# NextEval website

Unified public entry point for the NextEval Solver and NextEval Bench.

**Next evaluation for solvers. Next evaluation of agents.**

The shared slogan uses one `NEXT EVALUATION` word block with two aligned
endings: `for solvers.` and `of agents.` The first refers to the next function
evaluation; the second refers to evaluating agents through optimization.
`slogan.css` owns this typography across Overview, Solver, Bench, and Brand.
Do not reverse the prepositions or describe the Bench as only evaluating our
own solver. The Solver page emphasizes cyan; the Bench emphasizes gold.

- / — unified overview: solver and benchmark as one system with two views.
- /solver/ — product and architecture page for the agentic derivative-free optimizer.
- /solver/api/ — Solver Python API, with model provider setup in its own section.
- /solver/guide/ — Solver User Guide with runnable provider examples and explicit research-adapter boundaries.
- /bench/ — the interactive benchmark results: task matrix, Pareto views and task profiles.

The single-row header is a switchable path: NextEval / product / current page.
Its first disclosure switches products; the second switches pages within the
current product. Solver's Python API belongs in Solver navigation. Bench's task
setup and task protocol belong in Bench navigation. Model provider APIs are
external inference services, not either product's public interface; their
credentials stay on the runner host. On small screens the wordmark becomes the
NextEval symbol and GitHub remains available in the product menu.

The Solver and Bench repositories remain independent. This repository is a
static presentation layer only: it does not run agents, call providers, or
score submissions. The results component (`bench/results/`) is not tracked
here: `node scripts/site/build-site.mjs` downloads the slim release pinned in
`bench/results-source.json` (a public GitHub release asset of this repository),
checks every file against its pinned SHA-256 and builds `_site/` from an
allowlist of tracked pages plus those files. Pages deploys only `_site/`.
`bench/index.html` is only the unified-site navigation and mount point. The
slim release is built in `NextEval/nexteval-bench-website`
(`scripts/results-storage/site_projection.py`); see
`scripts/results-storage/PUBLIC_BUILD.md`.

`bench/archive.html` and `bench/ten-repeat.html` redirect to the current task
matrix, as do old `#profiles`, `#ranking`, and `#tasks` links.
Only reviewed public-safe numerical views enter `bench/results/data/`, never
raw agent logs or credentials. The frontend validates frozen comparisons and
renders offline OptiProfiler scores; it does not calculate scores or task means.

## Reviewed numerical snapshot

Snapshot `web-02c1a4d043ccfb375665bd25` contains 36 complete agent treatment
groups across four tasks. Its canonical source is the website's pinned map
`scripts/results-export/catalog-source-map.qwen-high-rotated-20261010.json`,
backed by private registry merge `eacb9e62d20642f18bd58d2f3b46fefd72b85834`
(data PR #28). The numerical verification receipt is kept with that source map.
The 392 mirrored component files are hash-pinned in `bench/results-source.json`.

The Qwen3.8 Flash / Claude Code / high increment retains 920 selected cells
per task: perturbed starts have 868 normal outcomes, 51 ordinary timeouts and
1 exact reviewed agent failure; noisy observations have 879 normal outcomes,
38 ordinary timeouts and 3 exact reviewed agent failures. Failures remain
distinct terminal outcomes with empty evaluation histories, not normal success.
The latest rotated increment adds 896 normal terminal outcomes and 24 ordinary
timeouts, including five empty unsuccessful histories. All 920 original
attempts remain attached without retries. Three call-limit cancellations have
exact persisted hard-stop proofs and retain their native cancellation evidence.
Every prior 35,880 numerical history row and the existing 33 accounting groups
are unchanged. Missing Qwen accounting and unresolved exact-alias release date
do not produce cost, token or release-date Pareto points. Raw logs, private
bundles and credentials remain outside this repository.

## Local preview

    node scripts/site/build-site.mjs
    cd _site && python3 -m http.server 8797

Open http://127.0.0.1:8797/.

## Browser checks

With Playwright available to Node, run `node test/site.cjs`. The check starts
and closes its own static server, checks responsive slogan layout and image
loading, and exercises the existing history and profile views. Set
`SITE_BASE_URL` to test a deployment instead. Screenshots go to
`SITE_TEST_ARTIFACTS`, or a temporary directory when unset.
Set `SITE_BROWSER_CHANNEL=chrome` to use an installed Chrome browser.

Run `node test/results.mjs` to build `_site/` and check it: every published
file is allowlisted or pinned, removed paths are absent, pages have no download
or evidence links, and the slim bundle validates with its own modules.
`test/primary-pareto-coverage.mjs`, `test/active-plan-cleanup.mjs` and
`test/model-identities.mjs` check displayed counts, plan rows and model names.
`node test/results-browser.cjs` checks the real task matrix at five widths, task
sorting, profile tolerances, histories, and legacy links. It reads `_site/`;
`RESULTS_DATA_DIRECTORY` allows local review of a separate numerical export
without publishing or copying it.

The Solver User Guide has a pinned, paid-call-free check: install its documented
Solver revision into a clean environment, then run `python test/guide.py`.
It uses only loopback HTTP fixtures. See `solver/guide/validation.md` for the
verified scope and external-runner limitations.

## Source repositories

- Organization: https://github.com/NextEval (the Solver, Bench and Bench website repositories are private)
