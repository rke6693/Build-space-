<!--
Thanks for the PR. Please fill the sections below — empty PR descriptions
are usually closed without review.
-->

## What this changes
<!-- One paragraph. What's different after this PR? -->

## Why
<!-- The problem this solves. Link to the issue if there is one. -->
Closes #

## How to verify
<!-- Concrete steps a reviewer can run. Curl commands, scripts, expected output. -->
```bash
# example
npm test
```

## Risk + rollout
- [ ] No public-API changes, OR breaking changes are documented in CHANGELOG
- [ ] No regressions in `npm run bench:load` p95 (paste before/after if hot-path)
- [ ] New code paths have tests
- [ ] Logs do not leak any secrets / PII

## Out of scope
<!-- What you deliberately did NOT change in this PR. Helps reviewers stay focused. -->
