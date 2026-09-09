# BUC and phonetic characters

This renamed **Fangji Phonetic** subset comes from SIL Charis 7.000 under OFL. See OFL.txt and manifest.json for the source URL, source checksum, output filename and exact code point coverage. Together with the disjoint Source Han Sans symbol subset, it includes every value and display-label character in the shipped keyboard, including BUC lowercase/uppercase and IPA, together with ASCII bases so base letters and combining marks use the same font. GSUB/GPOS layout tables are retained for stacked marks such as `a̤̍`, `e̤̍`, `ṳ̍` and `n̂`.

Rebuild with the same fonttools/brotli environment as the Han subsets:

```
python frontend/scripts/build-phonetic-font.py /path/to/Charis-7.000 /path/to/han-font-sources
```

The Charis WOFF2 and small Source Han Sans symbol WOFF2 are separate from the large Han shards. `symbols-manifest.json` pins the Source Han Sans 2.005R source and exact symbol coverage; `OFL-SourceHanSans.txt` contains its license. The symbol file supplies brackets, circled numbers and other dictionary marks that Charis does not cover. It loads when matching Latin/phonetic characters occur, including ASCII on ordinary pages. Han shards remain on demand; the browser matches rendered characters to CSS `unicode-range` and chooses the files without a backend request to choose a shard. There is no background prefetch of all shards. Both use content-hashed URLs and immutable caching.
