#!/usr/bin/env python3
"""Generate monochrome OG text-cards (1200x630 PNG) for every published
milestone into public/og/history/<slug>.png.

Design: white card, Space Grotesk year numeral + title, Inter eyebrow/footer —
mirrors the site's editorial type system. Re-run after curating new milestones,
then commit the new PNGs and set image_url:

  update milestones set image_url = 'https://queer.guide/og/history/'||slug||'.png'
   where image_url is null;

Requires: Pillow + fontTools (pip install --break-system-packages pillow fonttools brotli).
Fonts are decompressed from the repo's woff2 into /tmp/qgfonts on each run.
Auth: Supabase Management API via macOS-keychain CLI token (house pattern).
"""
import json, subprocess, base64, urllib.request, os, glob
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

PROJECT = 'xqeacpakadqfxjxjcewc'
os.makedirs('/tmp/qgfonts', exist_ok=True)
for src, dst in [('public/fonts/space-grotesk/space-grotesk-latin-wght-normal.woff2', '/tmp/qgfonts/space-grotesk.ttf'),
                 ('public/fonts/inter/inter-latin-wght-normal.woff2', '/tmp/qgfonts/inter.ttf')]:
    if not os.path.exists(dst):
        f = TTFont(src); f.flavor = None; f.save(dst)

raw = subprocess.check_output(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w'], text=True).strip()
token = base64.b64decode(raw.replace('go-keyring-base64:', '')).decode()
req = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{PROJECT}/database/query',
    data=json.dumps({'query': "select m.slug, m.title, m.date::text, m.date_precision, coalesce(co.name, m.country_name) as country from milestones m left join countries co on co.id=m.country_id where m.status='published' order by m.slug"}).encode(),
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'},
    method='POST')
rows = json.loads(urllib.request.urlopen(req).read())

W, H = 1200, 630
FG, MUT, BG, RULE = (10, 10, 10), (102, 102, 102), (255, 255, 255), (229, 229, 229)

def font(path, size, wght=None):
    f = ImageFont.truetype(path, size)
    if wght:
        try: f.set_variation_by_axes([wght])
        except Exception: pass
    return f

sg = lambda s, w=600: font('/tmp/qgfonts/space-grotesk.ttf', s, w)
inter = lambda s, w=400: font('/tmp/qgfonts/inter.ttf', s, w)

def wrap(draw, text, fnt, maxw):
    words, lines, cur = text.split(), [], ''
    for w_ in words:
        t = (cur + ' ' + w_).strip()
        if draw.textlength(t, font=fnt) <= maxw: cur = t
        else:
            if cur: lines.append(cur)
            cur = w_
    if cur: lines.append(cur)
    return lines

MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
          'August', 'September', 'October', 'November', 'December']

def datelabel(iso, prec):
    y, m, d = iso.split('-')
    if prec == 'year': return y
    if prec == 'month': return f"{MONTHS[int(m)-1]} {y}"
    return f"{MONTHS[int(m)-1]} {int(d)}, {y}"

os.makedirs('public/og/history', exist_ok=True)
eyeb, bottomf = inter(26, 600), inter(30, 400)
M = 72
YEAR_TOP = M + 56
BOTTOM_RULE_Y = H - M - 52
TITLE_BOTTOM = BOTTOM_RULE_Y - 28

for r in rows:
    img = Image.new('RGB', (W, H), BG); dr = ImageDraw.Draw(img)
    x = M
    for ch in 'QUEER HISTORY':
        dr.text((x, M), ch, font=eyeb, fill=MUT); x += dr.textlength(ch, font=eyeb) + 4
    x = W - M
    for ch in reversed('QUEER GUIDE'):
        wch = dr.textlength(ch, font=eyeb); x -= wch; dr.text((x, M), ch, font=eyeb, fill=FG); x -= 4
    year = r['date'][:4]
    chosen = None
    for ysize in (170, 150):
        yearf = sg(ysize, 600)
        title_top = YEAR_TOP + int(ysize * 1.18) + 20
        for size in (64, 56, 50, 44, 40, 36):
            tf = sg(size, 600)
            lines = wrap(dr, r['title'], tf, W - 2 * M)
            lh = int(size * 1.18)
            if title_top + len(lines) * lh <= TITLE_BOTTOM:
                chosen = (yearf, title_top, tf, lines, lh); break
        if chosen: break
    if not chosen:
        yearf = sg(150, 600); title_top = YEAR_TOP + int(150 * 1.18) + 20
        tf = sg(36, 600); lines = wrap(dr, r['title'], tf, W - 2 * M)[:3]; lines[-1] += '…'; lh = int(36 * 1.18)
        chosen = (yearf, title_top, tf, lines, lh)
    yearf, title_top, tf, lines, lh = chosen
    dr.text((M - 6, YEAR_TOP), year, font=yearf, fill=FG)
    ty = title_top
    for ln in lines:
        dr.text((M, ty), ln, font=tf, fill=FG); ty += lh
    bottom = datelabel(r['date'], r['date_precision']) + (f" · {r['country']}" if r.get('country') else '')
    dr.line([(M, BOTTOM_RULE_Y), (W - M, BOTTOM_RULE_Y)], fill=RULE, width=2)
    dr.text((M, BOTTOM_RULE_Y + 14), bottom, font=bottomf, fill=MUT)
    img.save(f"public/og/history/{r['slug']}.png", optimize=True)

print('generated', len(glob.glob('public/og/history/*.png')))
