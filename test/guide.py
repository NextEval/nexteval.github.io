"""Offline guide checks. HTTP requests are restricted to a loopback fixture."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import nexteval

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("guide_example", ROOT / "solver/guide/examples/optimize.py")
example = importlib.util.module_from_spec(spec)
spec.loader.exec_module(example)

POLL = {
    "tool": "poll_set", "parameters": {"basis": "maximal_positive", "count": 2},
    "purpose": "geometry", "rationale": "offline protocol check",
}


class LocalProvider(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.requests.append((self.path, request))
        count = len(self.server.requests)
        name, arguments = ("execute_action", POLL) if count == 1 else ("finalize", {"reason": "offline check complete"})
        if self.path == "/v1/chat/completions":
            body = {"model": "offline-model", "choices": [{"message": {
                "role": "assistant", "content": None, "tool_calls": [{
                    "id": f"call_{count}", "type": "function",
                    "function": {"name": name, "arguments": json.dumps(arguments)},
                }],
            }, "finish_reason": "tool_calls"}], "usage": {"prompt_tokens": 10, "completion_tokens": 10}}
        elif self.path == "/v1/messages":
            body = {"id": f"msg_{count}", "type": "message", "role": "assistant", "model": "offline-model",
                    "content": [{"type": "tool_use", "id": f"call_{count}", "name": name, "input": arguments}],
                    "stop_reason": "tool_use", "usage": {"input_tokens": 10, "output_tokens": 10}}
        else:
            self.send_error(404)
            return
        raw = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class GuideTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), LocalProvider)
        self.server.requests = []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)
        url = f"http://127.0.0.1:{self.server.server_port}/v1"
        self.env = {
            "NEXTEVAL_OPENAI_BASE_URL": url, "NEXTEVAL_OPENAI_MODEL": "offline-model",
            "NEXTEVAL_OPENAI_API_KEY": "offline-fixture-only",
            "ANTHROPIC_BASE_URL": url, "ANTHROPIC_MODEL": "offline-model",
            "ANTHROPIC_AUTH_TOKEN": "offline-fixture-only",
        }
        self.environment = patch.dict(os.environ, self.env, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        original_connect = socket.create_connection

        def local_only(address, *args, **kwargs):
            if address[0] != "127.0.0.1":
                raise AssertionError(f"External network forbidden: {address[0]}")
            return original_connect(address, *args, **kwargs)

        self.network_guard = patch("socket.create_connection", local_only)
        self.network_guard.start()
        self.addCleanup(self.network_guard.stop)

    def close_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def check_trace(self, result, count):
        self.assertEqual(result.nfev, count)
        self.assertEqual(result.ledger_length, count)
        path = Path(result.trace_path)
        self.assertTrue((path / "manifest.json").is_file())
        summary = json.loads((path / "summary.json").read_text())
        events = [json.loads(line) for line in (path / "events.jsonl").read_text().splitlines()]
        self.assertEqual(summary["nfev"], count)
        self.assertEqual(sum(e["type"] == "evaluation" for e in events), count)
        for file in path.glob("*.json*"):
            self.assertNotIn("offline-fixture-only", file.read_text())

    def test_both_objectives_and_clients(self):
        self.assertEqual(nexteval.__version__, "1.0.0")
        for problem in ("sphere", "rosenbrock"):
            fun, x0 = example.make_problem(problem)
            initial = fun(x0)
            self.assertAlmostEqual(initial, 2.44 if problem == "sphere" else 24.2)
            for provider in ("openai", "anthropic"):
                with self.subTest(problem=problem, provider=provider):
                    self.server.requests.clear()
                    result = example.run(problem=problem, provider=provider, run_dir=self.temp.name)
                    self.check_trace(result, 3)
                    self.assertLessEqual(result.fun, initial)
                    self.assertEqual(len(self.server.requests), 2)
                    self.assertEqual(result.invalid_action_count, 0)
                    self.assertEqual(result.execution_mode, "task")

    def test_budget_is_enforced(self):
        result = example.run(maxfev=2, run_dir=self.temp.name)
        self.check_trace(result, 2)
        self.assertEqual(len(self.server.requests), 1)

    def test_external_runner_without_provider(self):
        class OfflineRunner:
            def describe(self):
                return {"harness_id": "offline-guide-contract-check"}

            def run(self, task, gateway):
                first = gateway.call("execute_action", POLL)
                assert first["ok"], first
                gateway.call("finalize", {"reason": "offline integration check"})
                return {"stop": "completed"}

        with patch.dict(os.environ, {}, clear=True):
            result = example.run(runner=OfflineRunner(), run_dir=self.temp.name)
        self.check_trace(result, 3)
        self.assertEqual(self.server.requests, [])
        self.assertIsNone(result.model_request_count)

    def test_env_means_anthropic(self):
        fun, x0 = example.make_problem()
        result = nexteval.solve(fun, x0, options={"model": "env", "maxfev": 5, "trace": "off"})
        self.assertEqual(result.nfev, 3)
        self.assertTrue(all(path == "/v1/messages" for path, _ in self.server.requests))

    def test_missing_auth_fails_before_objective(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(nexteval.ProviderConfigurationError):
                example.run(run_dir=self.temp.name)
        self.assertEqual(self.server.requests, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
