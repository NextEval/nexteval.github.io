# NextEval website

Unified public entry point for the NextEval Solver and NextEval Bench.

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

## Source repositories

- Solver: https://github.com/NextEval/nexteval
- Bench: https://github.com/NextEval/nexteval-bench
- Bench website source: https://github.com/NextEval/nexteval-bench-website
