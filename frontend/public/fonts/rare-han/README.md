# Fangji Rare Han

These are renamed, unhinted WOFF2 subsets of **Source Han Sans SC Regular 2.005R** and **Plangothic P1/P2 Regular V2.9.5795**.
Upstream: https://github.com/Fitzgerald-Porthmouth-Koenigsegg/Plangothic_Project/releases/tag/V2.9.5795

Source Han Sans release: https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R

Copyright 2014-2025 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. See `SourceHanSans-OFL.txt`.

Copyright (c) 2024 by Fitzgerald P. Köeingsegg. All rights reserved.
Licensed under SIL Open Font License 1.1; see `OFL.txt`. Original copyright and license metadata are also retained inside each font. The modified family is named **Fangji Rare Han**, avoiding upstream reserved names. Source Han Sans ancestry and other upstream contributors are documented in the upstream repository.

Only CJK Extension A, B–J and compatibility ideographs present in the source fonts are included. Each subset contains at most 512 code points within a 512-code-point window; the exact supported ranges, sizes and source SHA-256 hashes are in `manifest.json`. Common ASCII and the basic CJK block U+4E00–9FFF are excluded. The CSS uses exact `unicode-range` coverage, so ordinary pages do not download fallback fonts. Normal system fonts stay first in each font stack. The editor checks only extension characters that occur in its current fields and shows their code points when the supplemental font fails or has no matching face.

## Rebuild

Use Python 3.9+ in a temporary environment:

```sh
python3 -m venv /tmp/fangji-font-tools
/tmp/fangji-font-tools/bin/pip install fonttools==4.60.2 brotli==1.1.0
# Download PlangothicP1-Regular.ttf and PlangothicP2-Regular.ttf from the pinned
# release above, plus LICENSE-OFL.txt from that tag, saved as OFL.txt.
# Also download OTF/SimplifiedChinese/SourceHanSansSC-Regular.otf and
# LICENSE.txt (saved as SourceHanSans-OFL.txt) from Source Han Sans tag 2.005R.
/tmp/fangji-font-tools/bin/python scripts/build-rare-fonts.py /path/to/sources
```

Run the command from `frontend`. No source fonts, Python packages or network access are needed for normal `npm run build` or Docker builds. The committed subsets are required runtime assets. When replacing the source version, update the pinned hashes in the script, review glyph coverage/license, and remove obsolete hashed assets only after generating and verifying the replacement manifest.

The assets are same-origin and work with the existing CSP; cross-origin CORS is unnecessary. Nginx sends `Cache-Control: public, max-age=31536000, immutable` only for successful responses with hashed font paths, preserves existing security headers, and returns 404 for missing font files. JSON, license and documentation files are not cached as immutable.

PDF rendering still relies on the source PDF's embedded or substituted fonts. This fallback supports the web interface's imported text, editing, keyboards, previews and comparisons; it does not rewrite PDF files.
