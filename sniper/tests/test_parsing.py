"""Unit tests for sniper.parsing — money + time parsers."""

import unittest

from sniper.parsing import parse_money, parse_time_left


class TestMoney(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(parse_money("$1"), 1.0)
        self.assertEqual(parse_money("$12.50"), 12.50)
        self.assertEqual(parse_money("1,234.00"), 1234.00)
        self.assertEqual(parse_money("bid: $3"), 3.0)
        self.assertEqual(parse_money("3"), 3.0)

    def test_missing(self):
        self.assertIsNone(parse_money(""))
        self.assertIsNone(parse_money("n/a"))
        self.assertIsNone(parse_money("---"))


class TestTime(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(parse_time_left("0:03"), 3)
        self.assertEqual(parse_time_left("1:23"), 83)
        self.assertEqual(parse_time_left("3s"), 3)

    def test_ended_tokens(self):
        self.assertEqual(parse_time_left("ENDED"), 0)
        self.assertEqual(parse_time_left("Sold!"), 0)
        self.assertEqual(parse_time_left("closed"), 0)

    def test_missing(self):
        self.assertIsNone(parse_time_left(""))
        self.assertIsNone(parse_time_left("--"))


if __name__ == "__main__":
    unittest.main()
