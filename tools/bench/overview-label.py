import json, sys
from PIL import Image, ImageDraw, ImageFont
raw, labels, out = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(raw).convert('RGB'); d = ImageDraw.Draw(im)
S = im.size[0] / 412.0   # device scale
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', int(15*S))
except Exception: font = ImageFont.load_default()
for L in json.load(open(labels)):
    if L['behind']: continue
    x, y = L['sx']*S, L['sy']*S
    d.ellipse([x-5*S, y-5*S, x+5*S, y+5*S], fill=(255,60,60), outline=(0,0,0))
    t = L['id']; bb = d.textbbox((0,0), t, font=font)
    d.rectangle([x+7*S, y-(bb[3]-bb[1])/2-3*S, x+7*S+(bb[2]-bb[0])+6*S, y+(bb[3]-bb[1])/2+3*S], fill=(0,0,0))
    d.text((x+10*S, y-(bb[3]-bb[1])/2-bb[1]), t, fill=(255,255,255), font=font)
im.save(out); print(out, im.size)
