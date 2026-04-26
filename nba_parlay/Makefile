.PHONY: install fetch train daily test lint

install:
	pip install -e .[dev]

fetch:
	nba-parlay fetch

train:
	nba-parlay train

daily:
	nba-parlay daily

dry:
	nba-parlay daily --dry-run

test:
	pytest -q

lint:
	ruff check src tests
