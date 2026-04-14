"""Tests for url_parse."""

from __future__ import annotations

import pytest

from ebay_sniper.url_parse import UrlParseError, parse_item_url


@pytest.mark.parametrize(
    "url,item_id",
    [
        ("https://www.ebay.com/itm/123456789012", "123456789012"),
        ("https://www.ebay.com/itm/Some-Cool-Item/123456789012", "123456789012"),
        (
            "https://www.ebay.com/itm/123456789012?hash=item1d7cd#viewItemSection",
            "123456789012",
        ),
        ("http://www.ebay.com/itm/9876543210", "9876543210"),
    ],
)
def test_parse_item_url_valid(url: str, item_id: str) -> None:
    parsed = parse_item_url(url)
    assert parsed.item_id == item_id
    assert parsed.host.endswith("ebay.com")
    assert parsed.canonical_url == f"https://{parsed.host}/itm/{item_id}"


@pytest.mark.parametrize(
    "url",
    [
        "",
        "not a url",
        "ftp://www.ebay.com/itm/123456789012",
        "https://www.amazon.com/itm/123456789012",
        "https://www.ebay.com/sch/i.html?_nkw=widget",
        "https://www.ebay.com/itm/abc",
    ],
)
def test_parse_item_url_rejects_bad(url: str) -> None:
    with pytest.raises(UrlParseError):
        parse_item_url(url)
