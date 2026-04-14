"""Unit tests for sniper.discovery — pure filtering + slug logic.

The Playwright-driven `discover_streams` isn't exercised here; we test
the parts that don't need a browser.
"""

import unittest

from sniper.discovery import StreamCandidate, filter_candidates, normalize_href


def cs(url: str, title: str = "") -> StreamCandidate:
    return StreamCandidate(url=url, title=title)


class TestFilter(unittest.TestCase):
    def test_dedupe_by_slug(self):
        cands = [
            cs("https://www.whatnot.com/live/abc"),
            cs("https://www.whatnot.com/live/abc?ref=x"),
            cs("https://www.whatnot.com/live/def"),
        ]
        out = filter_candidates(cands, [], [])
        self.assertEqual([c.slug for c in out], ["abc", "def"])

    def test_keyword_match(self):
        cands = [
            cs("https://www.whatnot.com/live/a", "Pokemon TCG breaks"),
            cs("https://www.whatnot.com/live/b", "Vintage sneakers"),
        ]
        out = filter_candidates(cands, ["pokemon"], [])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].slug, "a")

    def test_keyword_case_insensitive(self):
        cands = [cs("https://www.whatnot.com/live/a", "POKEMON TCG")]
        out = filter_candidates(cands, ["Pokemon"], [])
        self.assertEqual(len(out), 1)

    def test_blocklist(self):
        cands = [
            cs("https://www.whatnot.com/live/a", "NSFW stream"),
            cs("https://www.whatnot.com/live/b", "Card breaks"),
        ]
        out = filter_candidates(cands, [], ["nsfw"])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].slug, "b")

    def test_empty_filters_pass_everything(self):
        cands = [
            cs("https://www.whatnot.com/live/a", "anything"),
            cs("https://www.whatnot.com/live/b", ""),
        ]
        out = filter_candidates(cands, [], [])
        self.assertEqual(len(out), 2)

    def test_empty_string_keyword_ignored(self):
        cands = [cs("https://www.whatnot.com/live/a", "Cards")]
        out = filter_candidates(cands, ["", None and ""], [])  # type: ignore[list-item]
        self.assertEqual(len(out), 1)


class TestSlug(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(cs("https://www.whatnot.com/live/abc-123").slug, "abc-123")

    def test_with_query(self):
        self.assertEqual(
            cs("https://www.whatnot.com/live/abc-123?ref=x").slug, "abc-123"
        )

    def test_no_match_falls_back_to_url(self):
        self.assertEqual(cs("https://example.com/foo").slug, "https://example.com/foo")


class TestNormalize(unittest.TestCase):
    def test_absolute_url_unchanged(self):
        self.assertEqual(
            normalize_href("https://www.whatnot.com/live/x"),
            "https://www.whatnot.com/live/x",
        )

    def test_root_relative(self):
        self.assertEqual(
            normalize_href("/live/x"), "https://www.whatnot.com/live/x"
        )

    def test_bare_relative(self):
        self.assertEqual(
            normalize_href("live/x"), "https://www.whatnot.com/live/x"
        )


if __name__ == "__main__":
    unittest.main()
