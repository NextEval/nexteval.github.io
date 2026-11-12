# NextEval website

Unified public entry point for NextEval Bench and the NextEval Solver.

**Next evaluation for solvers. Next evaluation of agents.**

The shared tagline uses one `Next evaluation` word block with two endings:
`for solvers` and `of agents`. The first refers to the next function
evaluation; the second refers to evaluating agents through optimization.
`slogan.css` owns its typography: one quiet line above a page heading. Do not
reverse the prepositions or describe the Bench as only evaluating our own
solver. The Solver ending is cyan; the Bench ending is gold.

- / — overview: what NextEval is, the two products, a preview of the Bench leaderboard, links.
- /bench/ — the interactive benchmark results: leaderboard, task matrix, waffle, profiles, Pareto views and methodology.
- /solver/ — NextEval Solver 1.0: what it is, quick start, the tool surface, runners, configuration.
- /solver/guide/ — Solver User Guide: installation, provider setup, runners, budgets, results and traces.
- /solver/api/ — Solver Python API: entry points, options, the result object, clients and runners.

## One design language

The Bench results pages set the style of the whole site. `site.css` has three parts:

1. Tokens (`--nx-*`): the colours, fonts, type sizes, page width and spacing of the Bench results component
   (`bench/results/results.css`), written once for the other pages. `test/style-tokens.mjs` fails when a token
   and the Bench value differ.
2. Base rules and the header, loaded by every page including Bench. They are kept as they were, so Bench renders
   as before.
3. Page components for the overview and the Solver pages (heading block, tabs, toolbar, sections, cards, tables,
   code, definition lists, footer), scoped to `body.site-page`. Each one follows a Bench component.

The single-row header is a switchable path: NextEval / product / current page.
Its first disclosure switches products; the second switches pages within the
current product. Wherever the two products are listed together (the product
menu, footers, the overview cards, titles and descriptions), Bench comes first
and Solver second; `test/site-pages.mjs` checks it. On small screens the wordmark becomes the NextEval symbol and
GitHub remains available in the product menu. The overview and the Solver
pages carry their icons inline and need no script for their content.

## How the site is built

This repository is a static presentation layer only: it does not run agents,
call providers, or score submissions. The results component (`bench/results/`)
is not tracked here. `node scripts/site/build-site.mjs` downloads the results
bundle pinned in `bench/results-source.json` (a public release asset of this
repository), checks every file against its pinned SHA-256 and builds `_site/`
from an allowlist of tracked pages plus those files. Pages deploys only
`_site/`. `bench/index.html` is only the unified-site navigation and mount
point.

Pages are rendered during the build:

- **Build flags** are in `site-flags.json`. `SOLVER_RELEASED` is `false` until
  NextEval Solver 1.0 is public: the pages then show "Release: coming soon"
  instead of the install command, the repository link and the version badge.
  Set it to `true` with the release. Markup: `<!--@if SOLVER_RELEASED-->`,
  `<!--@else-->`, `<!--@endif-->`. An environment variable of the same name
  overrides the file for one local build, for example
  `SOLVER_RELEASED=true node scripts/site/build-site.mjs`.
- **The Bench preview** on the overview (`<!--@bench-preview-->`) is generated
  from the pinned bundle: the counts and the first six agents of its
  leaderboard data. It always shows the pinned release and needs no script.

The results bundle contains published numerical views only, never raw agent
logs or credentials. Scores are computed offline with OptiProfiler before
release. `bench/archive.html` and `bench/ten-repeat.html` redirect to the
current task matrix, as do old `#ranking` and `#tasks` links. A view can also
be opened with a query string, for example `/bench/?view=waffle`.

## Local preview

    node scripts/site/build-site.mjs
    cd _site && python3 -m http.server 8797

Open http://127.0.0.1:8797/.

## Checks

CI runs these on every pull request and before every deploy:

- `node test/results.mjs` builds `_site/` and checks it: every published file
  is allowlisted or pinned, removed paths are absent, and the results bundle
  validates with its own modules. It also runs the presentation, terminology,
  style-token, page and redirect tests. `test/site-pages.mjs` covers the
  shared header and footer, both values of `SOLVER_RELEASED`, the Bench
  preview against the pinned data, links, text alternatives and the
  internal-word guard on every page; `test/waffle.mjs` covers the Waffle view
  and its data.
- `node test/primary-pareto-coverage.mjs`, `node test/active-plan-cleanup.mjs`
  and `node test/model-identities.mjs` check displayed counts, plan rows and
  model names.
- `node test/public-links.mjs` checks that published pages link only to public
  NextEval repositories.

The Solver User Guide has a separate offline check: install Solver 1.0.0 into a
clean environment, then run `python test/guide.py`. It uses only loopback HTTP
fixtures and makes no provider calls; see `solver/guide/validation.md`.

`test/site.cjs` and `test/results-browser.cjs` are optional Playwright checks.
They are not part of CI and predate the current pages.

## Organization

- https://github.com/NextEval
