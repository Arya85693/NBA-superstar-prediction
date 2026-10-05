"""Supabase calls in the price sync survive dropped connections."""
import httpx
import pytest

import sync_prices_to_supabase as sync


class _FlakyRequest:
    def __init__(self, failures: int):
        self.failures = failures
        self.calls = 0

    def execute(self):
        self.calls += 1
        if self.calls <= self.failures:
            raise httpx.RemoteProtocolError("Server disconnected")
        return "ok"


def test_execute_retries_dropped_connection(monkeypatch):
    monkeypatch.setattr(sync.time, "sleep", lambda _s: None)
    req = _FlakyRequest(failures=2)
    assert sync._execute(req, "truncate") == "ok"
    assert req.calls == 3


def test_execute_gives_up_after_limit(monkeypatch):
    monkeypatch.setattr(sync.time, "sleep", lambda _s: None)
    req = _FlakyRequest(failures=sync.RETRY_ATTEMPTS)
    with pytest.raises(httpx.RemoteProtocolError):
        sync._execute(req, "truncate")
    assert req.calls == sync.RETRY_ATTEMPTS
