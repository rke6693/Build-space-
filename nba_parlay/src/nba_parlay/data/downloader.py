"""Downloader for shufinskiy/nba_data release assets.

The repo (https://github.com/shufinskiy/nba_data) publishes per-season NBA
datasets as compressed assets attached to GitHub releases. We discover the
matching assets via the GitHub API, download them with retries, decompress
when needed, and cache as parquet for fast subsequent loads.
"""
from __future__ import annotations

import io
import logging
import lzma
import re
import tarfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

import pandas as pd
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

LOG = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com/repos/shufinskiy/nba_data/releases"
USER_AGENT = "nba-parlay/0.1 (+https://github.com/shufinskiy/nba_data)"


@dataclass(frozen=True)
class Asset:
    name: str
    download_url: str
    dataset: str
    season: int
    extension: str  # e.g. ".csv", ".tar.xz", ".csv.xz"


_NAME_RE = re.compile(r"^(?P<dataset>[a-zA-Z]+)_(?P<season>\d{4})(?P<ext>\.[a-zA-Z.]+)$")


def _list_assets(token: Optional[str] = None) -> List[Asset]:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    assets: List[Asset] = []
    page = 1
    while True:
        resp = requests.get(GITHUB_API, headers=headers, params={"per_page": 100, "page": page}, timeout=30)
        resp.raise_for_status()
        releases = resp.json()
        if not releases:
            break
        for rel in releases:
            for a in rel.get("assets", []):
                m = _NAME_RE.match(a["name"])
                if not m:
                    continue
                assets.append(
                    Asset(
                        name=a["name"],
                        download_url=a["browser_download_url"],
                        dataset=m.group("dataset"),
                        season=int(m.group("season")),
                        extension=m.group("ext"),
                    )
                )
        page += 1
    return assets


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=2, min=2, max=16))
def _download(url: str) -> bytes:
    LOG.info("downloading %s", url)
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=120, stream=True)
    r.raise_for_status()
    return r.content


def _extract_dataframe(blob: bytes, ext: str) -> pd.DataFrame:
    """Turn a downloaded asset into a single DataFrame.

    Handles raw .csv, single-file .csv.xz, and .tar.xz archives that contain
    one or more CSVs (which we concatenate).
    """
    ext = ext.lower()
    if ext == ".csv":
        return pd.read_csv(io.BytesIO(blob), low_memory=False)
    if ext in (".csv.xz", ".xz"):
        return pd.read_csv(io.BytesIO(lzma.decompress(blob)), low_memory=False)
    if ext in (".tar.xz", ".tar.gz", ".tgz"):
        mode = "r:xz" if ext == ".tar.xz" else "r:gz"
        frames: List[pd.DataFrame] = []
        with tarfile.open(fileobj=io.BytesIO(blob), mode=mode) as tar:
            for member in tar.getmembers():
                if not member.isfile() or not member.name.endswith(".csv"):
                    continue
                f = tar.extractfile(member)
                if f is None:
                    continue
                frames.append(pd.read_csv(f, low_memory=False))
        if not frames:
            raise ValueError("archive contained no CSV files")
        return pd.concat(frames, ignore_index=True)
    raise ValueError(f"unsupported asset extension: {ext}")


def fetch_dataset(
    dataset: str,
    seasons: Iterable[int],
    cache_dir: Path,
    token: Optional[str] = None,
    refresh: bool = False,
) -> pd.DataFrame:
    """Fetch one shufinskiy dataset across the given seasons, returning a DataFrame.

    Per-season parquet files are written under ``cache_dir/raw/{dataset}/`` so
    subsequent calls skip the network entirely.
    """
    out_dir = cache_dir / "raw" / dataset
    out_dir.mkdir(parents=True, exist_ok=True)

    needed = set(seasons)
    cached: dict[int, pd.DataFrame] = {}
    if not refresh:
        for s in list(needed):
            p = out_dir / f"{dataset}_{s}.parquet"
            if p.exists():
                cached[s] = pd.read_parquet(p)
                needed.discard(s)

    if needed:
        assets = _list_assets(token=token)
        index = {(a.dataset, a.season): a for a in assets}
        for s in needed:
            asset = index.get((dataset, s))
            if asset is None:
                LOG.warning("no asset found for %s season %s", dataset, s)
                continue
            blob = _download(asset.download_url)
            df = _extract_dataframe(blob, asset.extension)
            df["__season"] = s
            df.to_parquet(out_dir / f"{dataset}_{s}.parquet")
            cached[s] = df

    if not cached:
        return pd.DataFrame()
    return pd.concat([cached[s] for s in sorted(cached)], ignore_index=True)


def fetch_many(
    datasets: Iterable[str],
    seasons: Iterable[int],
    cache_dir: Path,
    token: Optional[str] = None,
    refresh: bool = False,
) -> dict[str, pd.DataFrame]:
    return {d: fetch_dataset(d, seasons, cache_dir, token=token, refresh=refresh) for d in datasets}
