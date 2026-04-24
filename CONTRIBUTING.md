# Contributing to Keel

Thanks for considering it. This is a small, async project — written-first,
no live channels — so most contribution flow happens through GitHub Issues
and Pull Requests.

## Before you spend real time

- For anything bigger than a typo or a small bugfix, **open an issue first**
  and confirm the change makes sense. We'd rather discuss the approach in 5
  minutes of writing than reject a 4-hour PR.
- Major changes (new providers, breaking API changes, new endpoints) need
  alignment with [`docs/ROADMAP.md`](docs/ROADMAP.md). Out-of-roadmap PRs
  will likely be declined politely.
- Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first. The Provider /
  Cache / Judge / Repo interfaces exist for a reason — please don't bypass
  them.

## Local setup

```bash
git clone https://github.com/rke6693/build-space-.git keel
cd keel
cp .env.example .env
# fill in DATABASE_URL + at least one provider key (or set DEMO_MODE=true)
npm install
docker compose -f docker/docker-compose.yml up postgres -d
npm run db:migrate
npm run dev
```

`DEMO_MODE=true` lets you work without API keys.

## Tests

```bash
npm run typecheck
npm run lint
npm test
npm run bench:load        # for changes that touch the hot path
```

A PR is mergeable when:
- All of `typecheck`, `lint`, `test`, and CI Docker build pass
- New code paths have unit tests; new endpoints have integration tests
- No regression on `bench:load` p95 (compare before/after)
- Changelog entry added (or the PR description explicitly explains why none)

## Commit style

We follow [Conventional Commits](https://www.conventionalcommits.org/) loosely:

```
feat(router): add per-tenant override map
fix(cache): expire entries on store, not lookup
chore(deps): bump @anthropic-ai/sdk to 0.31
docs: clarify shadow-eval promotion semantics
```

Types we use: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`.
Scope is optional but appreciated.

## Code style

- TypeScript with `strict` and `exactOptionalPropertyTypes`. No `any` except
  where Hono's typings force our hand.
- Biome handles formatting and linting. `npm run lint:fix` before pushing.
- Functional > class except for things with state (cache, router, controller).
- No `console.log` in shipped code; use the `logger` from `src/util/logger.ts`.
- When adding a public function, write the doc comment first. If you can't
  describe the function in two sentences, it's doing too much.

## Adding a new provider

1. Implement `Provider` in `src/core/providers/<name>.ts`.
2. Register it in `src/server/index.ts` behind a feature flag and an env
   variable for the API key.
3. Add cost data to `src/core/pricing.ts`.
4. Add a unit test mocking the SDK (look at existing providers for the pattern).
5. Document it in [`README.md`](README.md) and [`docs/QUICKSTART.md`](docs/QUICKSTART.md).

## Reporting security issues

Don't open a public issue. See [`SECURITY.md`](SECURITY.md).

## How decisions get made

Maintainers triage issues weekly. Decisions are written down in the issue
thread; nothing is decided in a DM or a call. If you want to change
something architectural, write up a short proposal in the issue first.

## Code of conduct

Be kind. Be specific. Bring evidence. Don't waste anyone's time. Anything
genuinely abusive results in a permanent ban — no second strikes.
