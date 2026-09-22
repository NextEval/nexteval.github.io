# Solver User Guide validation

Checked on 2026-09-22. This is a documentation and offline integration receipt,
not an optimization benchmark or a live model-provider receipt.

## Source and environment

- Solver source: `cb58fd74901de2476fe15b60ee4cfc993ca04095` (1.0.0).
- Clean virtual environment: macOS, Python 3.12.7, NumPy 2.5.3.
- Installed directly from the pinned public Git URL, not an editable checkout.
- Research references: `d18c37ee620aad2a83e38a86154d867242c25022`.
  The research repository is private; its archived adapters are not part of the
  public Solver package. Their historical Solver pin is `60f4bb0`.

## Offline checks

Run from this website checkout with the pinned Solver installed:

```sh
python test/guide.py
```

All five test methods passed:

1. Both downloadable objectives (sphere and Rosenbrock), both built-in provider
   clients (OpenAI-compatible and Anthropic-compatible): real request serialization
   to a local HTTP fixture, two scripted tool turns, three recorded evaluations,
   finite incumbents, no invalid actions, persistent manifest/summary/events.
2. Evaluation budget truncation: exactly two objective calls with `maxfev=2`.
3. `model="env"` selects the Anthropic-compatible Messages route.
4. An offline external-runner contract fixture works without provider credentials
   and preserves the evaluation ledger. This fixture is neither Codex nor Claude Code.
5. Missing provider configuration fails without a provider request.

The test process clears provider environment values, uses a dummy fixture
credential and restricts socket connections to loopback. No real account tokens
or paid provider calls are used. The dummy credential is also checked against
persisted trace JSON files to catch accidental credential logging.

## Browser checks

`node test/site.cjs` covers scoped navigation, API/guide routes at eight viewport
widths, code copying, downloadable example and validation files, section links,
Python syntax, Bench task links and existing charts. `node test/bench.cjs` covers
the separate Bench interactions and both archived features.

## Not established by these checks

- Real provider availability, authentication, quotas, thinking receipts or model quality.
- Codex/Claude Code research-adapter compatibility with Solver `cb58fd7`.
- Generic GPT/Claude subscription or coding-plan integration.
- Windows/Linux execution of these examples.
- Isolation against hostile code or a hosted Bench execution API.

No frozen experiment bundle, paper result, Solver source or research adapter was
changed for this publication.
