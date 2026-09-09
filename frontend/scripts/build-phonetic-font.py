from pathlib import Path
import json, hashlib, sys
from fontTools import subset
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parents[2]; source=Path(sys.argv[1]) / 'Charis-Regular.ttf'
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'c03738834bd3a43c3e4a59b11878bd6ede3ee505998242ae649ed1f9cd2edcf6'
keyboard=json.loads((root/'backend/keyboards/hinghwa-dialect.json').read_text())
points=set(range(32,127))
for sec in keyboard['sections']:
 for key in sec['keys']:points.update(map(ord,key['value'] + key.get('label', '')))
font=TTFont(source,recalcTimestamp=False)
symbol_points=points-set(font.getBestCmap())
points-=symbol_points
options=subset.Options();options.layout_features=['*'];options.name_IDs=[0,1,2,3,4,5,6,13,14,16,17];options.name_languages=['*'];options.hinting=False
sub=subset.Subsetter(options=options);sub.populate(unicodes=points);sub.subset(font)
for id,name in {1:'Fangji Phonetic',2:'Regular',3:'FangjiPhonetic-Regular',4:'Fangji Phonetic Regular',6:'FangjiPhonetic-Regular',16:'Fangji Phonetic',17:'Regular'}.items():
 for record in font['name'].names:
  if record.nameID==id:record.string=name.encode(record.getEncoding())
font.flavor='woff2';out=root/'frontend/public/fonts/phonetic';out.mkdir(exist_ok=True)
p=out/'phonetic.woff2';font.save(p);digest=hashlib.sha256(p.read_bytes()).hexdigest()[:12];dest=out/f'phonetic-{digest}.woff2';p.rename(dest)
(out/'OFL.txt').write_text((source.parent/'OFL.txt').read_text())
(out/'manifest.json').write_text(json.dumps({'upstream':'Charis 7.000','source':'https://github.com/silnrsi/font-charis/releases/tag/v7.000','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'file':dest.name,'bytes':dest.stat().st_size,'codepoints':sorted(points),'layout':['GSUB','GPOS']},indent=2)+'\n')
(root/'frontend/src/phonetic-fonts.css').write_text('@font-face {\n  font-family: "Fangji Phonetic";\n  src: url("/fonts/phonetic/'+dest.name+'") format("woff2");\n  font-display: swap;\n  unicode-range: '+','.join(f'U+{cp:X}' for cp in sorted(points))+';\n}\n')
print(dest, dest.stat().st_size)

# Charis has no CJK brackets/circled numbers. Reuse the pinned Source Han
# source from the Han font build for a small, disjoint symbol subset.
if symbol_points:
 source_han=Path(sys.argv[2]) / 'SourceHanSansSC-Regular.otf'
 expected='f1d8611151880c6c336aabeac4640ef434fa13cbfbf1ffe82d0a71b2a5637256'
 assert hashlib.sha256(source_han.read_bytes()).hexdigest()==expected
 symbols=TTFont(source_han,recalcTimestamp=False)
 assert not symbol_points-set(symbols.getBestCmap())
 options=subset.Options();options.hinting=False
 sub=subset.Subsetter(options=options);sub.populate(unicodes=symbol_points);sub.subset(symbols)
 for record in symbols['name'].names:
  if record.nameID in (1,3,4,6,16):record.string=('FangjiSymbols-Regular' if record.nameID in (3,6) else 'Fangji Symbols').encode(record.getEncoding())
 if 'CFF ' in symbols:
  cff=symbols['CFF '].cff
  cff.fontNames=['FangjiSymbols-Regular']
  cff.topDictIndex[0].FamilyName='Fangji Symbols'
  cff.topDictIndex[0].FullName='Fangji Symbols'
 symbols.flavor='woff2';p=out/'symbols.woff2';symbols.save(p)
 dest=out/f'symbols-{hashlib.sha256(p.read_bytes()).hexdigest()[:12]}.woff2';p.rename(dest)
 (out/'symbols-manifest.json').write_text(json.dumps({'upstream':'Source Han Sans 2.005R','source':'https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R','sha256':expected,'file':dest.name,'bytes':dest.stat().st_size,'codepoints':sorted(symbol_points)},indent=2)+'\n')
 (out/'OFL-SourceHanSans.txt').write_text((root/'frontend/public/fonts/rare-han/SourceHanSans-OFL.txt').read_text())
 with (root/'frontend/src/phonetic-fonts.css').open('a') as css:
  css.write('@font-face {\n  font-family: "Fangji Phonetic";\n  src: url("/fonts/phonetic/'+dest.name+'") format("woff2");\n  font-display: swap;\n  unicode-range: '+','.join(f'U+{cp:X}' for cp in sorted(symbol_points))+';\n}\n')
 print(dest,dest.stat().st_size)

# Validate serialized glyph coverage, not just source cmap declarations.
for filename in ['manifest.json'] + (['symbols-manifest.json'] if symbol_points else []):
 entry=json.loads((out/filename).read_text())
 result=TTFont(out/entry['file'])
 cmap=result.getBestCmap()
 assert set(cmap)==set(entry['codepoints'])
 assert all(name!='.notdef' for name in cmap.values())
 result.close()
