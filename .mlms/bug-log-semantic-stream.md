# Bug Log — semantic-stream Wikipedia rate limit

Date: 2026-08-06

Status: Open

Owner: Local module maintainer

## Summary

The live CANK trailer loop reaches the real `semantic-stream` npm module, but the module’s Wikipedia lookup path can fail with HTTP `429 Too many requests` during continuous word streaming.

This is not a packaging problem. The module is installed and executed as a normal npm dependency. The failure happens at runtime in the article lookup path.

## What I observed

- The trailer launcher starts the normal semantic stream.
- The stream reaches `semantic-stream/WordStream.js`.
- Wikipedia requests fail with `429 Too many requests`.
- The current deploy intentionally does not replace this with a synthetic/offline fallback.

## Expected behavior

- `semantic-stream` should continue serving words locally during my tests.
- A local test run should make it obvious whether the issue is:
  - the module itself,
  - Wikipedia rate limiting,
  - or the caller’s request pattern.

## Actual behavior

- Continuous runs can stop at the Wikipedia request layer.
- The module does not complete the word stream when Wikipedia returns `429`.

## Reproduction

1. Run the trailer or word-stream loop locally.
2. Use the normal semantic stream, not the offline/synthetic path.
3. Keep the word stream active long enough to trigger repeated Wikipedia lookups.
4. Observe the `429` failure in the stream output.

## Likely cause

- The upstream Wikipedia API is rate limiting the request pattern.
- The local caller may be too aggressive for continuous iteration.
- The bug may be in retry/backoff policy, request shaping, or caching around the module’s article lookup.

## What to test locally

- Confirm the installed `semantic-stream` version and entrypoints.
- Reproduce the `429` with a minimal local script.
- Check whether the module retries, backs off, or fails immediately.
- Verify whether cached article lookup or slower polling removes the issue.

## Notes

- Keep this strict: no synthetic fallback.
- If the local test succeeds, the remote deploy should use the same module behavior.
- If the local test still fails, the next fix belongs in the module or its caller, not in the deploy wrapper.
