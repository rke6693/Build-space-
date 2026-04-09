"""
Tests for odds conversion utilities.
"""

import pytest

from api.connectors.sportsbook import OddsConverter


class TestOddsConverter:
    """Test odds format conversions and vig removal."""

    def test_american_favorite_to_probability(self):
        # -150 favorite => ~60% implied
        prob = OddsConverter.american_to_probability(-150)
        assert pytest.approx(prob, abs=0.01) == 0.60

    def test_american_underdog_to_probability(self):
        # +200 underdog => ~33% implied
        prob = OddsConverter.american_to_probability(200)
        assert pytest.approx(prob, abs=0.01) == 0.333

    def test_american_even_money(self):
        # +100 => 50%
        prob = OddsConverter.american_to_probability(100)
        assert pytest.approx(prob, abs=0.01) == 0.50

    def test_decimal_to_probability(self):
        # 2.0 decimal => 50%
        assert OddsConverter.decimal_to_probability(2.0) == 0.5
        # 1.5 decimal => 66.7%
        assert pytest.approx(OddsConverter.decimal_to_probability(1.5), abs=0.01) == 0.667
        # Edge case
        assert OddsConverter.decimal_to_probability(0) == 0.0

    def test_fractional_to_probability(self):
        # 1/1 (evens) => 50%
        assert OddsConverter.fractional_to_probability(1, 1) == 0.5
        # 3/1 => 25%
        assert OddsConverter.fractional_to_probability(3, 1) == 0.25

    def test_probability_to_american(self):
        # 50% => +100 or -100
        result = OddsConverter.probability_to_american(0.5)
        assert abs(result) == pytest.approx(100, abs=1)

        # 75% => should be negative (favorite)
        result = OddsConverter.probability_to_american(0.75)
        assert result < 0

    def test_remove_vig_fair_prices(self):
        # Two sides adding up to 1.05 (5% vig)
        fair_yes, fair_no = OddsConverter.remove_vig(0.55, 0.50)
        assert pytest.approx(fair_yes + fair_no, abs=0.001) == 1.0

    def test_remove_vig_preserves_ratio(self):
        fair_yes, fair_no = OddsConverter.remove_vig(0.60, 0.45)
        # Ratio should be preserved
        original_ratio = 0.60 / 0.45
        fair_ratio = fair_yes / fair_no
        assert pytest.approx(original_ratio, abs=0.01) == fair_ratio

    def test_remove_vig_zero_total(self):
        fair_yes, fair_no = OddsConverter.remove_vig(0, 0)
        assert fair_yes == 0.5
        assert fair_no == 0.5

    def test_roundtrip_american(self):
        """Converting to probability and back should be close to original."""
        for odds in [-300, -150, -110, 100, 150, 300, 500]:
            prob = OddsConverter.american_to_probability(odds)
            back = OddsConverter.probability_to_american(prob)
            assert pytest.approx(abs(back), abs=2) == abs(odds)
