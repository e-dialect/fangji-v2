# Task PDF rendering regression

`go test ./...` checks a synthetic PDF with inherited font resources, a shared
Form XObject, a rotated page, two-page excerpts, the EOF boundary and watermarks.
The `pdf-access` CI job additionally renders it using the shipped PDF.js, CMaps
and standard fonts in Chromium and runs the existing authorization integration.
No private book fixture is needed by CI.

For a local book, install Playwright 1.62.1 and Chromium in an external directory,
then run from the repository root (or set `BROWSER_CHANNEL=chrome` for installed
Chrome). Keep input and output under the ignored `local/` directory:

```sh
export NODE_PATH=/path/to/playwright/node_modules
FANGJI_PDF_RENDER=1 \
FANGJI_PDF_INPUT="$PWD/local/book.pdf" \
FANGJI_PDF_OUTPUT="$PWD/local/test-output/pdf" \
go test -C backend -run '^TestTaskPDFBrowserRegression$' -count=1 -timeout 45m -v
```

Without `FANGJI_PDF_INPUT`, the check uses a generated three-page fixture. Without
`FANGJI_PDF_OUTPUT`, Go removes the temporary outputs automatically. Explicit
output directories retain the source copy, one actual `buildTaskPDF` result per
starting page, a manifest and `result.json`. Use a separate output directory for
each book. The suite fails on validation, page-count, geometry, pixel, text or
watermark differences. It writes local mismatch screenshots when pixels differ.
Never commit or attach book outputs, screenshots or source files to a PR.

The comparison disables only the added Watermark optional-content group for the
source-pixel check, then renders it visibly to verify the stamp changes pixels.
Extracted text must preserve source text and contain exactly one added stamp per
page. Canvas uses `willReadFrequently` to keep Chromium from switching raster
backends halfway through pixel hashing. The visible dimensions/pixels determine
orientation: pdfcpu may express `/Rotate` through a content matrix when stamping.
This suite does not change the production rendering, watermark or access rules.

## Local full-book verification

A 321-page local source was checked at every starting page: 321 actual task PDFs
and 641 rendered task pages. Every source-pixel/text/visible-geometry comparison
passed, every stamp was visible, and the final task contained only one page.
The source and outputs remain local and are not checked in. No production PDF
change was indicated by this run. The local browser was Chrome using the shipped
PDF.js assets; CI separately verifies the synthetic source in Chromium.
