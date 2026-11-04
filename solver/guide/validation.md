# Solver User Guide validation

Checked on 2026-11-05. This is a documentation and offline integration check,
not an optimization benchmark or a live model-provider test.

## Environment

- NextEval Solver 1.0.0, installed with `python -m pip install` from its source
  directory into a clean virtual environment (not an editable install).
- Python 3.13.0, NumPy 2.5.4.

## Offline checks

Run from a checkout of this repository with Solver 1.0.0 installed:

```sh
python test/guide.py
```

All six tests passed:

1. Both downloadable objectives (sphere and Rosenbrock) with both built-in
   provider clients (OpenAI-compatible and Anthropic-compatible): real request
   serialization to a local HTTP fixture, two scripted tool turns, three
   recorded evaluations, finite results, no invalid actions, and a complete
   trace (manifest, summary and events).
2. Evaluation budget: exactly two objective calls with `maxfev=2`.
3. An external runner works without provider credentials and keeps the
   Solver's evaluation records. It is a scripted runner, not an agent tool.
4. The scripted runner example on the guide page, run as published: three
   evaluations, no model requests and no provider request.
5. `model="env"` selects the Anthropic-compatible Messages route.
6. Missing provider configuration fails before any provider request.

The test clears provider environment variables, uses a dummy credential and
allows socket connections only to the loopback address. No real credentials
and no paid provider calls are used. The written trace files are also searched
for the dummy credential to catch credential logging.

## Not established by these checks

- Real provider availability, authentication, usage limits, thinking settings
  or model quality.
- Runners for agent tools such as Codex or Claude Code.
- The Windows PowerShell commands.
- Isolation against hostile code, or a hosted Bench execution service.
