# Rare character support implementation plan

**Goal:** Resolve #55: render 𢶀𠮷㙟𰻞䲠 and preserve supplementary characters through editing, comparison and storage.
**Architecture:** Self-host renamed OFL font subsets from pinned Plangothic sources, limited to CJK extension/compatibility ranges. Split into at most 512-code-point WOFF2 files with exact unicode-range declarations and content-hashed URLs. Retain system fonts first. Provide a code-point notice if a needed fallback cannot load. SQLite/PocketBase already store UTF-8; validate round trips rather than migrating schema.
**Tech Stack:** Vue, CSS Font Loading API, fontTools/Brotli, Node tests, Go/SQLite.

1. Generate committed runtime font assets and license with `frontend/scripts/build-rare-fonts.py`; record source hashes, subset coverage and reproducible instructions.
2. Add fallback to all text font stacks and inherited form controls; configure same-origin immutable font caching with missing files returning 404.
3. Correct UTF-16 splitting in diff, avatar initials and text previews; preserve DOM selection offsets for insertion.
4. Add regression tests for supplementary character diff, insertion, CSV export and database round trip; run frontend/backend tests and build.
5. Use a browser to check actual glyphs, ordinary-page zero font requests, narrow downloads and loading failure notice. Commit and open separate PR against main.

No data migration. Code rollback removes fallback fonts; Unicode data stays unchanged. PDF glyphs remain governed by the source PDF.

Validation completed: 32 frontend tests and production build; Go suite; disposable server CSV import/inspection, source and structured JSON, two submissions, arbitration and 4000-code-point note boundary, auto-approval, volunteer nickname/filename, and post-restart persistence. Real Chrome workflow verified localStorage reload, editor submit, arbitration UI and exact downloaded CSV rows. Chrome, Firefox and WebKit verified five actual fallback glyphs, only five subset requests (309,156 bytes), ordinary-page zero requests and failure notices. Nginx MIME/cache/CSP/404/304 tests are included in the container CI test.
