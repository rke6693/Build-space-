"""Shared utilities: retry decorator, atomic file operations, validation."""

import functools
import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import TypeVar, Callable

logger = logging.getLogger(__name__)

T = TypeVar("T")


def retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    backoff_factor: float = 2.0,
    retryable_exceptions: tuple = (Exception,),
):
    """Retry decorator with exponential backoff.

    Args:
        max_attempts: Total attempts (1 = no retry).
        base_delay: Initial delay in seconds.
        max_delay: Cap on delay between retries.
        backoff_factor: Multiplier for each subsequent delay.
        retryable_exceptions: Tuple of exception types to retry on.
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> T:
            last_exception = None
            delay = base_delay
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as e:
                    last_exception = e
                    if attempt == max_attempts:
                        logger.error(
                            f"{func.__qualname__} failed after {max_attempts} attempts: {e}"
                        )
                        raise
                    logger.warning(
                        f"{func.__qualname__} attempt {attempt}/{max_attempts} failed: {e}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    time.sleep(delay)
                    delay = min(delay * backoff_factor, max_delay)
            raise last_exception  # unreachable, but satisfies type checker
        return wrapper
    return decorator


def atomic_write_json(filepath: Path, data: list | dict, indent: int = 2):
    """Write JSON to a file atomically using tmp + rename.

    Writes to a temporary file in the same directory, then renames.
    This prevents corruption if the process crashes mid-write.
    """
    filepath.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=filepath.parent,
        prefix=f".{filepath.stem}_",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=indent, default=str)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, filepath)  # atomic on POSIX
    except BaseException:
        # Clean up temp file on any failure
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def load_json_safe(filepath: Path, backup_on_corrupt: bool = True) -> list | dict:
    """Load JSON from a file with corruption recovery.

    If the file is corrupted:
    1. Backs up the corrupted file (if backup_on_corrupt=True)
    2. Looks for backup files
    3. Returns empty list as last resort

    Returns:
        Parsed JSON data.
    """
    if not filepath.exists():
        return []

    text = filepath.read_text().strip()
    if not text:
        return []

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Corrupted JSON in {filepath}: {e}")

        if backup_on_corrupt:
            # Save the corrupted file for forensics
            corrupt_path = filepath.with_suffix(f".corrupt.{int(time.time())}")
            try:
                filepath.rename(corrupt_path)
                logger.warning(f"Corrupted file moved to {corrupt_path}")
            except OSError:
                pass

        # Try to find a backup
        backup = filepath.with_suffix(".backup")
        if backup.exists():
            try:
                data = json.loads(backup.read_text())
                logger.info(f"Recovered from backup: {backup}")
                return data
            except json.JSONDecodeError:
                logger.error(f"Backup also corrupted: {backup}")

        logger.warning(f"No recovery possible for {filepath}, returning empty list")
        return []


def validate_date(date_str: str) -> str:
    """Validate and normalize a date string to YYYY-MM-DD.

    Raises:
        ValueError: If date_str is not a valid date.
    """
    from datetime import datetime
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        raise ValueError(
            f"Invalid date format: '{date_str}'. Expected YYYY-MM-DD."
        )
