"""Tests for cri_scan.py — Crash Risk Index scanner.

All tests are pure computation — no network calls.
"""
import math
import pytest
import numpy as np

from cri_scan import (
    rolling_sector_correlation,
    score_vix_component,
    score_vvix_component,
    score_correlation_component,
    score_momentum_component,
    compute_cri,
    cri_level,
    cta_exposure_model,
    crash_trigger,
    SECTOR_ETFS,
)


# ══════════════════════════════════════════════════════════════════
# 1. Rolling Sector Correlation
# ══════════════════════════════════════════════════════════════════

class TestRollingCorrelation:
    """Tests for rolling_sector_correlation()."""

    def test_perfectly_correlated_returns(self):
        """All sectors moving identically → correlation ≈ 1.0."""
        n = 30
        base = np.random.randn(n).cumsum() + 100
        # All 11 sectors get the same price series
        sector_prices = {etf: base.copy() for etf in SECTOR_ETFS}
        corr, change = rolling_sector_correlation(sector_prices, window=20)
        assert corr > 0.95, f"Expected ~1.0 for identical series, got {corr}"

    def test_uncorrelated_returns(self):
        """Independent random walks → low correlation."""
        np.random.seed(42)
        n = 50
        sector_prices = {}
        for etf in SECTOR_ETFS:
            sector_prices[etf] = np.random.randn(n).cumsum() + 100
        corr, change = rolling_sector_correlation(sector_prices, window=20)
        assert corr < 0.50, f"Expected low corr for random walks, got {corr}"

    def test_window_nan_for_short_data(self):
        """Fewer bars than window → NaN."""
        n = 10  # less than window=20
        sector_prices = {etf: np.arange(1, n + 1, dtype=float) + 100 for etf in SECTOR_ETFS}
        corr, change = rolling_sector_correlation(sector_prices, window=20)
        assert np.isnan(corr), "Expected NaN when data shorter than window"

    def test_crisis_spike_simulation(self):
        """Simulate a crisis where all sectors suddenly correlate."""
        np.random.seed(123)
        n = 50
        sector_prices = {}
        for etf in SECTOR_ETFS:
            # First 30 bars: independent. Last 20 bars: correlated sell-off.
            independent = np.random.randn(30).cumsum() + 100
            selloff = np.linspace(0, -10, 20)  # uniform decline
            sector_prices[etf] = np.concatenate([independent, independent[-1] + selloff])
        corr, change = rolling_sector_correlation(sector_prices, window=20)
        # During the selloff window, all moving together → high correlation
        assert corr > 0.80, f"Expected high corr during crisis, got {corr}"

    def test_returns_5d_change(self):
        """Verify the function returns both current correlation and 5d change."""
        np.random.seed(99)
        n = 40
        base = np.random.randn(n).cumsum() + 100
        sector_prices = {etf: base + np.random.randn(n) * 0.01 for etf in SECTOR_ETFS}
        corr, change = rolling_sector_correlation(sector_prices, window=20)
        assert isinstance(corr, float)
        assert isinstance(change, float) or np.isnan(change)


# ══════════════════════════════════════════════════════════════════
# 2. CRI Score Components (each scored 0-25)
# ══════════════════════════════════════════════════════════════════

class TestCRIScoreComponents:
    """Tests for individual component scoring functions."""

    # ── VIX ──
    def test_vix_low_calm(self):
        """VIX < 15, flat → score near 0."""
        score = score_vix_component(vix=12.0, vix_5d_roc=0.0)
        assert 0 <= score <= 5, f"Expected low score for calm VIX, got {score}"

    def test_vix_high_crisis(self):
        """VIX > 40, rising fast → score near 25."""
        score = score_vix_component(vix=50.0, vix_5d_roc=80.0)
        assert score >= 20, f"Expected high score for crisis VIX, got {score}"

    def test_vix_moderate(self):
        """VIX ~25, moderate rise → mid-range score."""
        score = score_vix_component(vix=25.0, vix_5d_roc=20.0)
        assert 5 <= score <= 20, f"Expected mid-range, got {score}"

    def test_vix_clamped_to_25(self):
        """Score never exceeds 25."""
        score = score_vix_component(vix=100.0, vix_5d_roc=200.0)
        assert score <= 25.0

    def test_vix_floor_at_0(self):
        """Score never goes below 0."""
        score = score_vix_component(vix=5.0, vix_5d_roc=-50.0)
        assert score >= 0.0

    # ── VVIX ──
    def test_vvix_low_calm(self):
        """VVIX < 90 → score near 0."""
        score = score_vvix_component(vvix=80.0, vvix_vix_ratio=5.0)
        assert 0 <= score <= 5, f"Expected low score for calm VVIX, got {score}"

    def test_vvix_high_crisis(self):
        """VVIX > 140, high ratio → score near 25."""
        score = score_vvix_component(vvix=160.0, vvix_vix_ratio=10.0)
        assert score >= 20, f"Expected high score, got {score}"

    def test_vvix_clamped(self):
        """Score clamped to [0, 25]."""
        score = score_vvix_component(vvix=200.0, vvix_vix_ratio=20.0)
        assert 0 <= score <= 25

    # ── Correlation ──
    def test_correlation_calm(self):
        """Low correlation → score near 0."""
        score = score_correlation_component(corr=0.15, corr_5d_change=0.0)
        assert 0 <= score <= 5, f"Expected low score, got {score}"

    def test_correlation_crisis(self):
        """High correlation + spiking → score near 25."""
        score = score_correlation_component(corr=0.80, corr_5d_change=0.30)
        assert score >= 20, f"Expected high score, got {score}"

    def test_correlation_clamped(self):
        """Score clamped to [0, 25]."""
        score = score_correlation_component(corr=1.0, corr_5d_change=1.0)
        assert 0 <= score <= 25

    # ── Momentum ──
    def test_momentum_above_ma(self):
        """SPX above 100d MA → score near 0."""
        score = score_momentum_component(spx_distance_pct=2.0)
        assert 0 <= score <= 5, f"Expected low score above MA, got {score}"

    def test_momentum_below_ma_deep(self):
        """SPX 10%+ below MA → score near 25."""
        score = score_momentum_component(spx_distance_pct=-12.0)
        assert score >= 20, f"Expected high score deep below MA, got {score}"

    def test_momentum_at_ma(self):
        """SPX at MA → score near 0."""
        score = score_momentum_component(spx_distance_pct=0.0)
        assert 0 <= score <= 5

    def test_momentum_clamped(self):
        """Score clamped to [0, 25]."""
        score = score_momentum_component(spx_distance_pct=-30.0)
        assert 0 <= score <= 25

    # ── NaN inputs ──
    def test_nan_vix_returns_zero(self):
        score = score_vix_component(vix=float("nan"), vix_5d_roc=0.0)
        assert score == 0.0

    def test_nan_correlation_returns_zero(self):
        score = score_correlation_component(corr=float("nan"), corr_5d_change=0.0)
        assert score == 0.0


# ══════════════════════════════════════════════════════════════════
# 3. CRI Levels
# ══════════════════════════════════════════════════════════════════

class TestCRILevels:
    """Tests for cri_level() classification."""

    def test_low(self):
        assert cri_level(0) == "LOW"
        assert cri_level(24) == "LOW"

    def test_elevated(self):
        assert cri_level(25) == "ELEVATED"
        assert cri_level(49) == "ELEVATED"

    def test_high(self):
        assert cri_level(50) == "HIGH"
        assert cri_level(74) == "HIGH"

    def test_critical(self):
        assert cri_level(75) == "CRITICAL"
        assert cri_level(100) == "CRITICAL"

    def test_boundary_25(self):
        """25 is ELEVATED, not LOW."""
        assert cri_level(25) == "ELEVATED"

    def test_boundary_50(self):
        """50 is HIGH, not ELEVATED."""
        assert cri_level(50) == "HIGH"

    def test_boundary_75(self):
        """75 is CRITICAL, not HIGH."""
        assert cri_level(75) == "CRITICAL"


# ══════════════════════════════════════════════════════════════════
# 4. CTA Exposure Model
# ══════════════════════════════════════════════════════════════════

class TestCTAExposureModel:
    """Tests for cta_exposure_model()."""

    def test_normal_vol_full_exposure(self):
        """10% realized vol → 100% exposure (10%/10% = 1)."""
        result = cta_exposure_model(realized_vol=10.0)
        assert abs(result["exposure_pct"] - 100.0) < 1.0

    def test_doubled_vol_half_exposure(self):
        """20% realized vol → 50% exposure."""
        result = cta_exposure_model(realized_vol=20.0)
        assert abs(result["exposure_pct"] - 50.0) < 1.0

    def test_quad_vol_quarter_exposure(self):
        """40% realized vol → 25% exposure."""
        result = cta_exposure_model(realized_vol=40.0)
        assert abs(result["exposure_pct"] - 25.0) < 1.0

    def test_low_vol_capped_at_200(self):
        """5% realized vol → exposure would be 200%, capped at 200%."""
        result = cta_exposure_model(realized_vol=5.0)
        assert result["exposure_pct"] <= 200.0

    def test_zero_vol_safe(self):
        """Zero vol should not cause division by zero."""
        result = cta_exposure_model(realized_vol=0.0)
        assert "exposure_pct" in result
        assert not math.isnan(result["exposure_pct"])

    def test_forced_reduction_positive_when_vol_high(self):
        """High vol → forced_reduction > 0."""
        result = cta_exposure_model(realized_vol=30.0)
        assert result["forced_reduction_pct"] > 0

    def test_forced_reduction_zero_when_vol_normal(self):
        """Normal vol → no forced reduction."""
        result = cta_exposure_model(realized_vol=10.0)
        assert result["forced_reduction_pct"] == 0.0

    def test_estimated_selling_scales(self):
        """Estimated selling should increase with higher vol."""
        low = cta_exposure_model(realized_vol=15.0)
        high = cta_exposure_model(realized_vol=40.0)
        assert high["est_selling_bn"] >= low["est_selling_bn"]


# ══════════════════════════════════════════════════════════════════
# 5. Crash Trigger
# ══════════════════════════════════════════════════════════════════

class TestCrashTrigger:
    """Tests for crash_trigger() — all three conditions must fire."""

    def test_all_conditions_met(self):
        """All three: SPX < 100d MA, vol > 25%, corr > 0.60 → TRIGGERED."""
        result = crash_trigger(
            spx_below_ma=True,
            realized_vol=30.0,
            avg_correlation=0.70,
        )
        assert result["triggered"] is True

    def test_spx_above_ma_fails(self):
        """SPX above MA → not triggered."""
        result = crash_trigger(
            spx_below_ma=False,
            realized_vol=30.0,
            avg_correlation=0.70,
        )
        assert result["triggered"] is False

    def test_low_vol_fails(self):
        """Vol < 25% → not triggered."""
        result = crash_trigger(
            spx_below_ma=True,
            realized_vol=15.0,
            avg_correlation=0.70,
        )
        assert result["triggered"] is False

    def test_low_correlation_fails(self):
        """Correlation < 0.60 → not triggered."""
        result = crash_trigger(
            spx_below_ma=True,
            realized_vol=30.0,
            avg_correlation=0.40,
        )
        assert result["triggered"] is False

    def test_march_2020_scenario(self):
        """March 2020 conditions: deep below MA, vol 80%+, corr 0.85+."""
        result = crash_trigger(
            spx_below_ma=True,
            realized_vol=80.0,
            avg_correlation=0.85,
        )
        assert result["triggered"] is True
        assert result["conditions"]["spx_below_100d_ma"] is True
        assert result["conditions"]["realized_vol_gt_25"] is True
        assert result["conditions"]["avg_correlation_gt_060"] is True

    def test_boundary_vol_exactly_25(self):
        """Vol exactly 25% is borderline — should pass (> 25)."""
        result = crash_trigger(
            spx_below_ma=True,
            realized_vol=25.0,
            avg_correlation=0.70,
        )
        # 25.0 is NOT > 25.0, so should NOT trigger
        assert result["triggered"] is False

    def test_boundary_corr_exactly_060(self):
        """Correlation exactly 0.60 is borderline — should NOT pass (> 0.60)."""
        result = crash_trigger(
            spx_below_ma=True,
            realized_vol=30.0,
            avg_correlation=0.60,
        )
        assert result["triggered"] is False


# ══════════════════════════════════════════════════════════════════
# 6. Empty / NaN Data
# ══════════════════════════════════════════════════════════════════

class TestEmptyData:
    """Edge cases: NaN inputs, insufficient data."""

    def test_nan_vol_cta_model(self):
        """NaN vol → safe output."""
        result = cta_exposure_model(realized_vol=float("nan"))
        assert "exposure_pct" in result

    def test_nan_correlation_trigger(self):
        """NaN correlation → not triggered."""
        result = crash_trigger(
            spx_below_ma=True,
            realized_vol=30.0,
            avg_correlation=float("nan"),
        )
        assert result["triggered"] is False

    def test_nan_vol_trigger(self):
        """NaN vol → not triggered."""
        result = crash_trigger(
            spx_below_ma=True,
            realized_vol=float("nan"),
            avg_correlation=0.70,
        )
        assert result["triggered"] is False

    def test_compute_cri_with_nans(self):
        """compute_cri should handle NaN inputs gracefully."""
        result = compute_cri(
            vix=float("nan"), vix_5d_roc=0.0,
            vvix=float("nan"), vvix_vix_ratio=0.0,
            corr=float("nan"), corr_5d_change=0.0,
            spx_distance_pct=0.0,
        )
        assert 0 <= result["score"] <= 100
        assert result["level"] in ("LOW", "ELEVATED", "HIGH", "CRITICAL")

    def test_all_nan_sector_correlation(self):
        """All NaN prices → NaN correlation."""
        sector_prices = {etf: np.full(30, np.nan) for etf in SECTOR_ETFS}
        corr, change = rolling_sector_correlation(sector_prices, window=20)
        assert np.isnan(corr)


# ══════════════════════════════════════════════════════════════════
# 7. Composite CRI (integration)
# ══════════════════════════════════════════════════════════════════

class TestComputeCRI:
    """Integration tests for the full compute_cri function."""

    def test_calm_market(self):
        """All inputs calm → low score."""
        result = compute_cri(
            vix=13.0, vix_5d_roc=0.0,
            vvix=80.0, vvix_vix_ratio=6.0,
            corr=0.20, corr_5d_change=0.0,
            spx_distance_pct=3.0,
        )
        assert result["score"] < 25
        assert result["level"] == "LOW"

    def test_crisis_market(self):
        """All inputs at crisis levels → high score."""
        result = compute_cri(
            vix=55.0, vix_5d_roc=100.0,
            vvix=160.0, vvix_vix_ratio=3.0,
            corr=0.85, corr_5d_change=0.40,
            spx_distance_pct=-15.0,
        )
        assert result["score"] >= 75
        assert result["level"] == "CRITICAL"

    def test_score_is_sum_of_components(self):
        """Total score = sum of 4 components."""
        result = compute_cri(
            vix=25.0, vix_5d_roc=20.0,
            vvix=120.0, vvix_vix_ratio=5.0,
            corr=0.50, corr_5d_change=0.10,
            spx_distance_pct=-3.0,
        )
        expected = (
            result["components"]["vix"]
            + result["components"]["vvix"]
            + result["components"]["correlation"]
            + result["components"]["momentum"]
        )
        assert abs(result["score"] - expected) < 0.5  # rounding tolerance

    def test_result_has_all_fields(self):
        """Output dict has required keys."""
        result = compute_cri(
            vix=20.0, vix_5d_roc=5.0,
            vvix=100.0, vvix_vix_ratio=5.0,
            corr=0.30, corr_5d_change=0.02,
            spx_distance_pct=1.0,
        )
        assert "score" in result
        assert "level" in result
        assert "components" in result
        assert set(result["components"].keys()) == {"vix", "vvix", "correlation", "momentum"}
