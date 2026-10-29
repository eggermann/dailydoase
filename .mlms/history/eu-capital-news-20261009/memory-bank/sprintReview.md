# Sprint Review
## Loop 1 Review
### What Changed
- Added a separate collector for 27 EU capital-city coordinates with 100 km radius searches.
- Added a static HTML builder with title/date deduplication, matched-capital metadata, and newest-first ordering.
- Stored per-capital JSON, aggregate JSON, and `articles.html` in `news-capitals/` inside the isolated worktree.
### Acceptance Criteria Result
- [x] Ran today's 100 km collection and produced the HTML.
- [x] HTML is deduplicated and ordered newest first.
- [x] Existing dirty checkout remained untouched.
- [ ] All 27 capital queries succeeded; Stockholm returned HTTP 402 after API quota exhaustion.
### Verification Result
- `node --check` passed for both new scripts.
- Manual output check: date 2026-10-09, 26 successful capitals, 2,462 raw hits, 1,966 HTML cards, sorted descending by publication date.
### Issues / Gaps
- Stockholm has no results in this run because the API quota was exhausted during its request.
### User Demo Notes
- Open `news-capitals/articles.html` from the isolated `eu-capital-news` worktree.

## Loop 1 Retrospective
### What Worked
- The detached worktree kept the user's existing uncommitted changes safe.
- Separate data folder preserved the older country-source collection.
### What Was Confusing
- The main checkout's `.env` was not present in the isolated worktree; the requested run read it by absolute path without copying the secret.
### What To Improve Next Loop
- Check remaining API quota before beginning a 27-query run, so the last capitals can be prioritized or resumed.
### Process Decision
- Stop and present the verified output; retry Stockholm only after quota reset or at the user's direction.
