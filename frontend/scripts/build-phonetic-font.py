from pathlib import Path
import json, hashlib, sys
from fontTools import subset
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parents[2]; source=Path(sys.argv[1]) / 'Charis-Regular.ttf'
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'c03738834bd3a43c3e4a59b11878bd6ede3ee505998242ae649ed1f9cd2edcf6'
keyboard=json.loads((root/'backend/keyboards/hinghwa-dialect.json').read_text())
points=set(range(32,127))
for sec in keyboard['sections']:
 for key in sec['keys']:points.update(map(ord,key['value']))
font=TTFont(source,recalcTimestamp=False)
assert not points-set(font.getBestCmap()),points-set(font.getBestCmap())
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
