"""Tests for utility functions: retry, atomic writes, validation."""

import json
import threading
import time
from pathlib import Path

import pytest

from newsletter_engine.utils import (
    retry,
    atomic_write_json,
    load_json_safe,
    validate_date,
)


class TestRetry:
    def test_succeeds_first_try(self):
        call_count = 0

        @retry(max_attempts=3, base_delay=0.01)
        def success():
            nonlocal call_count
            call_count += 1
            return "ok"

        assert success() == "ok"
        assert call_count == 1

    def test_succeeds_after_retries(self):
        call_count = 0

        @retry(max_attempts=3, base_delay=0.01)
        def flaky():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ValueError("not yet")
            return "ok"

        assert flaky() == "ok"
        assert call_count == 3

    def test_raises_after_max_attempts(self):
        @retry(max_attempts=2, base_delay=0.01)
        def always_fails():
            raise ValueError("always fails")

        with pytest.raises(ValueError, match="always fails"):
            always_fails()

    def test_only_retries_specified_exceptions(self):
        call_count = 0

        @retry(
            max_attempts=3,
            base_delay=0.01,
            retryable_exceptions=(ValueError,),
        )
        def wrong_error():
            nonlocal call_count
            call_count += 1
            raise TypeError("wrong type")

        with pytest.raises(TypeError):
            wrong_error()
        assert call_count == 1  # No retry for TypeError


class TestAtomicWriteJson:
    def test_basic_write(self, tmp_path):
        filepath = tmp_path / "test.json"
        data = [{"key": "value"}, {"num": 42}]

        atomic_write_json(filepath, data)

        loaded = json.loads(filepath.read_text())
        assert loaded == data

    def test_overwrites_existing(self, tmp_path):
        filepath = tmp_path / "test.json"
        filepath.write_text('[{"old": true}]')

        atomic_write_json(filepath, [{"new": True}])

        loaded = json.loads(filepath.read_text())
        assert loaded == [{"new": True}]

    def test_creates_parent_dirs(self, tmp_path):
        filepath = tmp_path / "deep" / "nested" / "test.json"

        atomic_write_json(filepath, {"data": 1})

        assert filepath.exists()
        assert json.loads(filepath.read_text()) == {"data": 1}

    def test_no_temp_file_left_on_success(self, tmp_path):
        filepath = tmp_path / "test.json"
        atomic_write_json(filepath, [1, 2, 3])

        files = list(tmp_path.iterdir())
        assert len(files) == 1
        assert files[0].name == "test.json"


class TestLoadJsonSafe:
    def test_load_valid(self, tmp_path):
        filepath = tmp_path / "test.json"
        filepath.write_text('[{"id": 1}]')

        data = load_json_safe(filepath)
        assert data == [{"id": 1}]

    def test_load_missing_file(self, tmp_path):
        filepath = tmp_path / "nonexistent.json"
        data = load_json_safe(filepath)
        assert data == []

    def test_load_empty_file(self, tmp_path):
        filepath = tmp_path / "empty.json"
        filepath.write_text("")
        data = load_json_safe(filepath)
        assert data == []

    def test_load_corrupted_file(self, tmp_path):
        filepath = tmp_path / "corrupt.json"
        filepath.write_text("{ not json !!!")

        data = load_json_safe(filepath, backup_on_corrupt=True)
        assert data == []

        # Corrupted file should be moved
        corrupt_files = list(tmp_path.glob("*.corrupt.*"))
        assert len(corrupt_files) == 1

    def test_recover_from_backup(self, tmp_path):
        filepath = tmp_path / "test.json"
        backup = tmp_path / "test.backup"

        filepath.write_text("{ corrupted")
        backup.write_text('[{"recovered": true}]')

        data = load_json_safe(filepath, backup_on_corrupt=True)
        assert data == [{"recovered": True}]


class TestValidateDate:
    def test_valid_date(self):
        assert validate_date("2026-04-09") == "2026-04-09"

    def test_normalizes_date(self):
        assert validate_date("2026-01-01") == "2026-01-01"

    def test_invalid_format(self):
        with pytest.raises(ValueError, match="Invalid date format"):
            validate_date("04/09/2026")

    def test_invalid_date(self):
        with pytest.raises(ValueError, match="Invalid date format"):
            validate_date("2026-13-45")

    def test_empty_string(self):
        with pytest.raises(ValueError, match="Invalid date format"):
            validate_date("")
