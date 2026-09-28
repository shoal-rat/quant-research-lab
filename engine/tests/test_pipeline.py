import numpy as np
import pytest

from qrl.alpha import ops
from qrl.research import evaluate as E
from qrl.research.evaluate import Candidate, evaluate_candidate, tier_of
from qrl.research.registry import Registry


@pytest.fixture()
def reg(tmp_path):
    return Registry(tmp_path / "lab.sqlite")


def test_pipeline_records_every_pull(reg, panel):
    stages = []
    ev = evaluate_candidate(Candidate("mom(126, 21)", universe="synthetic"), reg, on_stage=stages.append, panel=panel)
    keys = [s["key"] for s in stages]
    assert keys == ["parse", "integrity", "signal", "backtest", "risk", "skeptic", "verdict"]
    assert reg.count() == 1
    assert ev.verdict in ("reject", "reserve", "promote")
    row = reg.get(ev.trial_id)
    assert row["sr"] is not None and row["post_mean"] is not None


def test_noise_strategy_is_not_adopted(reg, panel):
    ev = evaluate_candidate(Candidate("rev(3)", universe="synthetic"), reg, panel=panel)
    assert ev.verdict != "promote"


def test_real_edge_passes_integrity_and_is_rewarded(reg, planted_panel):
    ev = evaluate_candidate(Candidate("log(volume)", universe="synthetic", mechanism="structural"), reg, panel=planted_panel)
    assert ev.report["sharpe"] > 1.0
    assert ev.report["posterior"]["mean"] > 0.3


def test_syntax_error_is_rejected_at_parse(reg, panel):
    ev = evaluate_candidate(Candidate("rank(close", universe="synthetic"), reg, panel=panel)
    assert ev.verdict == "reject" and ev.stages[0]["status"] == "fail"


def test_fuzz_catches_a_cheating_operator(reg, panel, monkeypatch):
    """If an operator ever peeks at the future, the integrity stage must fail."""
    def centered(x, d):
        return x.rolling(d, center=True, min_periods=1).mean()  # uses future bars

    monkeypatch.setitem(E.eval_expr.__globals__["FUNCS"], "ts_mean", (centered, "xw"))
    ev = evaluate_candidate(Candidate("ts_mean(returns, 21)", universe="synthetic"), reg, panel=panel)
    integ = next(s for s in ev.stages if s["key"] == "integrity")
    assert integ["status"] == "fail" and not integ["lookahead"]["ok"]


def test_duplicate_pulls_still_count(reg, panel):
    evaluate_candidate(Candidate("mom(126, 21)", universe="synthetic"), reg, panel=panel)
    ev = evaluate_candidate(Candidate("mom(126,21)", universe="synthetic"), reg, panel=panel)
    assert reg.count() == 2
    assert ev.stages[0]["duplicate_of"] is not None


def test_tiers_follow_expected_live_sharpe():
    assert tier_of(1.0) == "SSR" and tier_of(0.7) == "SR" and tier_of(0.4) == "R" and tier_of(0.1) == "N"
    assert np.isfinite(ops.ANN)
