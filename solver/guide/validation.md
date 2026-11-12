# Solver User Guide checks

Checked on 2026-11-12. This is a documentation and offline integration check,
not an optimization benchmark or a live model-provider test.

## Environment

- NextEval Solver 1.0.0, installed with `python -m pip install` from its wheel
  into a clean virtual environment.
- Python 3.13.0, NumPy 2.5.4.

## Offline checks

Run from a checkout of this repository with Solver 1.0.0 installed:

```sh
python test/guide.py
```

All eight tests passed:

1. Both objectives of the example file (sphere and Rosenbrock) with both
   built-in provider clients (OpenAI-compatible and Anthropic-compatible): real
   request serialization to a local HTTP fixture, two scripted tool turns, three
   recorded evaluations, finite results, no invalid actions, no fallback, and a
   complete trace (manifest, summary and events).
2. Evaluation budget: exactly two objective calls with `maxfev=2`.
3. An external runner works without provider credentials and keeps the
   solver's evaluation records. It is a scripted runner, not an agent tool.
4. The scripted runner example on the guide page, run as published: three
   evaluations, no model requests and no provider request.
5. The offline check on the guide page, run as published: a model that never
   calls a tool, 40 evaluations spent by the fallback, a value near zero.
6. A supplied runner that returns without `finalize` ends the run with the
   starting point; the same runner inside `FallbackRunner` has the textbook
   autopilot spend the remaining budget.
7. `model="env"` selects the Anthropic-compatible Messages route.
8. Missing provider configuration fails before any provider request.

The test clears provider environment variables, uses a dummy credential and
allows socket connections only to the loopback address. No real credentials
and no paid provider calls are used. The written trace files are also searched
for the dummy credential to catch credential logging.

## Not established by these checks

- Real provider availability, authentication, usage limits, thinking settings
  or model quality.
- The Codex and Claude Code adapters: they need the respective tools installed
  and signed in, and they are not started here.
- The Windows PowerShell commands.
- Isolation against hostile code, or a hosted Bench execution service.
