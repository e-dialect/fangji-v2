# Dictionary keyboard coverage

The built-in `hinghwa-dialect` preset includes IPA additions (Ǿ, ɑ, ɡ, ɔ), missing
Mandarin tone letters, standalone combining marks, dictionary punctuation and
circled sense numbers. Only the 24-key common-proofreading group opens by default; other groups are collapsed. Existing project
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

## Group order and correction workflow

The fixed order is common proofreading, nasalized vowels, IPA vowels, consonants
and notation, dictionary romanization, dictionary marks, circled sense numbers,
superscript tones, combining marks, Mandarin pinyin, BUC lowercase and BUC uppercase.
The mobile initial tab and the sole initially expanded desktop group are both
common proofreading. This prioritizes frequent correction tasks without moving
keys around as a person types.

Frequency comes from the two local CSVs; likely OCR difficulty comes from the
maintainer's experience. Frequency is not an estimated OCR error rate. Nasalized
letters are prominent, while Mandarin and BUC remain available by category.
Mandarin pinyin is organized by a/e/i/o/u/ü and tones 1–4, plus standalone ü.

All previous insertion values are preserved byte-for-byte. The shortcut group
reuses full-category values, and the total counts distinct insertion values.
Precomposed and decomposed spellings are not normalized. The only added value in
the regrouping is ǖ. Font rebuilding includes it. Similar glyphs have explicit
identification hints; combining-mark labels use a dotted circle but insert only
the mark after the preceding letter.
