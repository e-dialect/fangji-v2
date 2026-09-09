# Dictionary keyboard coverage

The built-in `hinghwa-dialect` preset includes IPA additions (Ǿ, ɑ, ɡ, ɔ), missing
Mandarin tone letters, standalone combining marks, dictionary punctuation and
circled sense numbers. New groups are collapsed by default. Existing project
links and keyboard IDs are unchanged; preset synchronization updates the definition
on server start without a migration. Dotted circles appear only in mark labels.

Audit local CSV files without printing their text or copying them into tests:

```sh
python3 backend/tests/audit_keyboard_csv.py /path/to/first.csv /path/to/second.csv
python3 -m unittest discover -s backend/tests -p test_keyboard_audit.py
```

The audit accepts ordinary Han, ASCII, whitespace and common Chinese punctuation
from the system input method. Every remaining base-plus-mark cluster must be
constructible from complete key values and ordinary characters without Unicode
normalization. This distinguishes standalone ɔ from ɔ̃ and does not mistake a
mark embedded in another key for a standalone input. Output contains only input
index, row counts, column numbers, missing codepoint sequences and counts. A
missing sequence produces a nonzero exit status.

Local verification covered two CSVs with 15,022 and 10,557 data rows; both have zero
missing sequences. Only character inventory is included in the preset. The CSVs,
rows and book screenshots are not fixtures in this repository.

Font rebuilding and provenance are documented in
`frontend/public/fonts/phonetic/README.md`. The two non-overlapping font subsets
cover all key values and labels, retaining shaping tables for combining marks.
Frontend tests check exact insertion and JSON/UTF-8 CSV round trips; backend
Unicode integration checks import, proofreading, arbitration, export and restart
persistence using synthetic symbol sequences. Browser tests use the real preset
in both proofreading and arbitration, on desktop and mobile viewports.
