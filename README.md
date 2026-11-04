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
- /solver/guide/ — Solver User Guide: installation, provider setup, external agent sessions and traces.
- /bench/ — the interactive benchmark results: leaderboard, task matrix, Pareto views and task profiles.

The single-row header is a switchable path: NextEval / product / current page.
Its first disclosure switches products; the second switches pages within the
current product. Solver's Python API belongs in Solver navigation. Bench's task
setup and task protocol belong in Bench navigation. Model provider APIs are
external inference services, not either product's public interface; their
credentials stay on the runner host. On small screens the wordmark becomes the
NextEval symbol and GitHub remains available in the product menu.

## How the site is built

This repository is a static presentation layer only: it does not run agents,
call providers, or score submissions. The results component (`bench/results/`)
is not tracked here. `node scripts/site/build-site.mjs` downloads the results
bundle pinned in `bench/results-source.json` (a public release asset of this
repository), checks every file against its pinned SHA-256 and builds `_site/`
from an allowlist of tracked pages plus those files. Pages deploys only
`_site/`. `bench/index.html` is only the unified-site navigation and mount
point.

The results bundle contains published numerical views only, never raw agent
logs or credentials. Scores are computed offline with OptiProfiler before
release. `bench/archive.html` and `bench/ten-repeat.html` redirect to the
current task matrix, as do old `#ranking` and `#tasks` links.

## Local preview

    node scripts/site/build-site.mjs
    cd _site && python3 -m http.server 8797

Open http://127.0.0.1:8797/.

## Checks

CI runs these on every pull request and before every deploy:

- `node test/results.mjs` builds `_site/` and checks it: every published file
  is allowlisted or pinned, removed paths are absent, and the results bundle
  validates with its own modules. It also runs the presentation, terminology
  and redirect tests.
- `node test/primary-pareto-coverage.mjs`, `node test/active-plan-cleanup.mjs`
  and `node test/model-identities.mjs` check displayed counts, plan rows and
  model names.
- `node test/public-links.mjs` checks that published pages link only to public
  NextEval repositories.

The Solver User Guide has a separate offline check: install Solver 1.0.0 into a
clean environment, then run `python test/guide.py`. It uses only loopback HTTP
fixtures and makes no provider calls; see `solver/guide/validation.md`.

`test/site.cjs`, `test/results-browser.cjs` and `test/hero-legibility.cjs` are
optional Playwright checks. They are not part of CI, and some of their
assertions predate the current pages.

## Organization

- https://github.com/NextEval
