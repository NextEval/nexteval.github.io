"""Small objectives for NextEval 1.0.0; running the CLI contacts a provider."""
from __future__ import annotations

import argparse
import json

import numpy as np
from nexteval import AnthropicCompatClient, OpenAICompatClient, minimize


def make_problem(name="sphere"):
    x0 = np.array([-1.2, 1.0])
    if name == "sphere":
        return lambda x: float(x @ x), x0
    if name == "rosenbrock":
        return lambda x: float(100 * (x[1] - x[0] ** 2) ** 2 + (1 - x[0]) ** 2), x0
    raise ValueError(f"Unknown example: {name}")


def run(*, problem="sphere", provider="openai", maxfev=80, run_dir="runs", runner=None):
    fun, x0 = make_problem(problem)
    options = {
        "execution_mode": "task",
        "maxfev": maxfev,
        "seed": 7,
        "trace": "trajectory",
        "run_dir": str(run_dir),
        "return_evaluation_history": True,
    }
    model = None
    if runner is None:
        clients = {"openai": OpenAICompatClient, "anthropic": AnthropicCompatClient}
        model = clients[provider]()
        options["model_call_limit"] = 60
        options["runner_options"] = {"max_tokens": 4096}
    return minimize(fun, x0, model=model, runner=runner, toolset="core-v04", options=options)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--problem", choices=["sphere", "rosenbrock"], default="sphere")
    parser.add_argument("--provider", choices=["openai", "anthropic"], default="openai")
    parser.add_argument("--maxfev", type=int, default=80)
    parser.add_argument("--run-dir", default="runs")
    args = parser.parse_args()
    result = run(**vars(args))
    print(json.dumps({
        "x": result.x.tolist(), "fun": result.fun, "nfev": result.nfev,
        "status": result.status, "message": result.message,
        "success": result.success,
        "completion_quality": result.get("completion_quality"),
        "comparable_under_budget": result.get("comparable_under_budget"),
        "trace_path": result.trace_path,
    }, indent=2))


if __name__ == "__main__":
    main()
