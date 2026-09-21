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
- /bench/ — the interactive benchmark explorer and archived evidence portal.

The Solver and Bench repositories remain independent. This repository is a
static presentation layer only: it does not run agents, call providers, or
score submissions. The Bench page is copied from the reviewed release of
NextEval/nexteval-bench-website so that the Pages deployment is self-contained.

## Local preview

    python3 -m http.server 8797

Open http://127.0.0.1:8797/.

## Browser checks

Run `node test/assets.cjs` to check that every profile in the comparison
manifest is tracked by Git and matches its archived SHA-256 hash. Pages
deployment runs this check before uploading the site. Compressed comparison
files are explicitly included even when a global Git ignore excludes `*.gz`.

With Playwright available to Node, run `node test/site.cjs`. The check starts
and closes its own static server, checks responsive slogan layout and image
loading, and exercises the existing history and profile views. Set
`SITE_BASE_URL` to test a deployment instead. Screenshots go to
`SITE_TEST_ARTIFACTS`, or a temporary directory when unset.
Set `SITE_BROWSER_CHANNEL=chrome` to use an installed Chrome browser.

## Source repositories

- Solver: https://github.com/NextEval/nexteval
- Bench: https://github.com/NextEval/nexteval-bench
- Bench website source: https://github.com/NextEval/nexteval-bench-website
