"""Reste Net — génération des visuels (icônes, couverture, vignette, captures).

  python make_visuals.py icons        → app/icons/icon-192.png, icon-512.png, icon-maskable-512.png
  python make_visuals.py cover        → visuels/couverture-1280x720.png, visuels/vignette-600x600.png, visuels/store-logo-300x300.png
  python make_visuals.py shots        → visuels/capture-*.png (Chrome headless sur dist/complet et docs/) + app/screenshots/comparateur.png
  python make_visuals.py all
"""
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
ICONS = ROOT / 'app' / 'icons'
VIS = ROOT / 'visuels'
# Palette « papier crayon » (alignée sur styles.css)
PAPER = (244, 238, 225)
CARD = (251, 247, 238)
INK = (43, 43, 48)
PENCIL = (95, 92, 87)
LINE = (154, 149, 139)
MARKER = (255, 231, 106)
RED = (192, 57, 43)
BLUE = (47, 95, 143)
# Ordonnée (px) du haut de chaque recadrage dans les rendus pleine page ; à ajuster si la mise en page change.
# Les découpes (1366×768) sont calées sur la position réelle des sections, mesurée dans Chrome (voir measure()).
TALL_FULL, TALL_FREE = 7000, 3600
FONT_BOLD = str(ROOT / 'visuels' / 'fonts' / 'Caveat-Variable.ttf')
FONT_REG = str(ROOT / 'visuels' / 'fonts' / 'PatrickHand-Regular.ttf')


def font_title(size: int) -> ImageFont.FreeTypeFont:
    """Caveat en graisse 700 (police variable)."""
    f = font(FONT_BOLD, size)
    try:
        f.set_variation_by_axes([700])
    except Exception:
        pass
    return f


def wobbly_rect(d: ImageDraw.ImageDraw, box, fill=None, outline=INK, width=4, seed=1) -> None:
    """Rectangle « dessiné à la main » : contour légèrement irrégulier, double trait."""
    import random
    rnd = random.Random(seed)
    x0, y0, x1, y1 = box
    def pts(jit):
        n = 14
        out = []
        for i in range(n + 1):
            out.append((x0 + (x1 - x0) * i / n, y0 + rnd.uniform(-jit, jit)))
        for i in range(1, n + 1):
            out.append((x1 + rnd.uniform(-jit, jit), y0 + (y1 - y0) * i / n))
        for i in range(1, n + 1):
            out.append((x1 - (x1 - x0) * i / n, y1 + rnd.uniform(-jit, jit)))
        for i in range(1, n):
            out.append((x0 + rnd.uniform(-jit, jit), y1 - (y1 - y0) * i / n))
        return out
    if fill:
        d.polygon(pts(1.5), fill=fill)
    d.line(pts(2.5) + [pts(2.5)[0]], fill=outline, width=width, joint='curve')
    d.line(pts(3.5) + [pts(3.5)[0]], fill=outline + (90,) if len(outline) == 3 else outline, width=max(1, width // 2), joint='curve')


def grain(img: Image.Image, strength: int = 10) -> Image.Image:
    """Grain de papier : léger bruit gris mélangé à l'image (alpha conservé)."""
    noise = Image.effect_noise(img.size, strength).convert('L')
    layer = Image.merge(img.mode, [noise] * len(img.getbands()))
    if img.mode == 'RGBA':
        layer.putalpha(img.getchannel('A'))
    return Image.blend(img, layer, 0.06)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    """Feuille de papier, grand « € » au crayon graphite, trait de surligneur jaune dessous."""
    big = 1024
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    pad = 0 if maskable else int(big * 0.05)
    radius = int(big * (0 if maskable else 0.16))
    d.rounded_rectangle([pad, pad, big - pad, big - pad], radius=radius, fill=PAPER + (255,))
    if not maskable:
        wobbly_rect(d, [pad + 78, pad + 78, big - pad - 78, big - pad - 78], outline=INK, width=10, seed=7)
    # surligneur sous le symbole
    hl = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.rounded_rectangle([int(big * 0.2), int(big * 0.66), int(big * 0.8), int(big * 0.76)], radius=40, fill=MARKER + (230,))
    hl = hl.rotate(-3, resample=Image.BICUBIC, center=(big / 2, big * 0.71))
    img.alpha_composite(hl)
    f = font_title(int(big * 0.78))
    text = '€'
    bbox = d.textbbox((0, 0), text, font=f)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (big - w) / 2 - bbox[0]
    y = (big - h) / 2 - bbox[1] - big * 0.05
    d.text((x + 6, y + 6), text, font=f, fill=INK + (60,))   # ombre crayon
    d.text((x, y), text, font=f, fill=INK + (255,))
    img = grain(img, 12)
    return img.resize((size, size), Image.LANCZOS)


def make_icons() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    draw_icon(512).save(ICONS / 'icon-512.png')
    draw_icon(512).resize((192, 192), Image.LANCZOS).save(ICONS / 'icon-192.png')
    draw_icon(512, maskable=True).save(ICONS / 'icon-maskable-512.png')
    print('icônes :', sorted(p.name for p in ICONS.iterdir()))


def engine_nets(price: float, platforms: list) -> list:
    """Nets par vente calculés par le vrai moteur (calc.js via Node), triés du meilleur au pire."""
    import json
    ids = json.dumps([p[0] for p in platforms])
    script = (
        "global.window={};require(process.argv[1]+'/rates.js');const C=require(process.argv[1]+'/calc.js');"
        "const R=global.window.RESTE_NET_RATES;const out={};"
        f"for(const id of {ids}){{const p=R.platforms.find(x=>x.id===id);const opts={{}};(p.options||[]).forEach(o=>{{opts[o.id]=!!o.default;}});"
        f"out[id]=C.compute(p,{{price:{price},nSales:1,nWithdrawals:1,usdToEur:R.usdToEur,options:opts,status:null,tax:{{}}}}).perSale.net;}}"
        "console.log(JSON.stringify(out));")
    res = subprocess.run(['node', '-e', script, str(ROOT / 'app')], capture_output=True, text=True, check=True)
    nets = json.loads(res.stdout)
    rows = [(label, f'{nets[pid]:.2f} €'.replace('.', ','), nets[pid] / price) for pid, label in platforms]
    rows.sort(key=lambda r: -r[2])
    return rows


def make_cover() -> None:
    VIS.mkdir(exist_ok=True)
    W, H = 1280, 720
    img = Image.new('RGBA', (W, H), PAPER + (255,))
    d = ImageDraw.Draw(img, 'RGBA')
    # feuille de gauche : cadre au crayon, icône, titre
    wobbly_rect(d, [40, 40, 450, H - 40], fill=CARD + (255,), outline=INK, width=4, seed=11)
    icon = draw_icon(190)
    img.alpha_composite(icon, (150, 95))
    d.text((245, 350), 'Reste Net', font=font_title(84), fill=INK, anchor='mm')
    # soulignement au surligneur
    d.rounded_rectangle([120, 392, 370, 404], radius=6, fill=MARKER + (230,))
    d.text((245, 440), 'Combien il me reste vraiment ?', font=font(FONT_REG, 32), fill=PENCIL, anchor='mm')
    d.text((245, H - 85), '3 € · fichier hors ligne + web · Windows', font=font(FONT_REG, 24), fill=PENCIL, anchor='mm')
    # côté droit : relevé au crayon
    x0 = 520
    d.text((x0, 60), 'Ce que tu touches vraiment sur une vente à 5 €', font=font_title(42), fill=INK)
    d.text((x0, 125), 'Frais de plateforme, retraits, cotisations URSSAF 2026, impôt.', font=font(FONT_REG, 26), fill=PENCIL)
    rows = engine_nets(5.0, [('direct', 'Entre particuliers'), ('polar', 'Polar.sh'), ('gumroad', 'Gumroad'), ('gplay', 'Google Play'),
                             ('msstore', 'Microsoft Store'), ('fiverr', 'Fiverr'), ('itch', 'itch.io')])  # ComeUp absent : prix minimum 15 €
    y = 185
    fb, fr = font_title(38), font(FONT_REG, 27)
    for i, (name, net, ratio) in enumerate(rows):
        d.text((x0, y), name, font=fr, fill=INK)
        bar_w = int(400 * ratio)
        # barre au surligneur (la meilleure) ou hachures au crayon
        if i == 0:
            d.rounded_rectangle([x0 + 240, y + 8, x0 + 240 + bar_w, y + 30], radius=4, fill=MARKER + (235,))
        else:
            d.rounded_rectangle([x0 + 240, y + 8, x0 + 240 + bar_w, y + 30], radius=4, outline=INK + (255,), width=2)
            for hx in range(x0 + 244, x0 + 240 + bar_w - 4, 9):
                d.line([(hx, y + 28), (hx + 8, y + 10)], fill=PENCIL + (170,), width=2)
        d.text((x0 + 240 + 400 + 18, y - 6), net, font=fb, fill=INK)
        d.line([(x0, y + 44), (x0 + 700, y + 44)], fill=LINE + (120,), width=1)
        y += 53
    d.text((x0, 565), 'Puis ton statut : particulier occasionnel, micro-BNC, micro-BIC…', font=font(FONT_REG, 25), fill=PENCIL)
    d.text((x0, 600), 'Calcul inverse · simulation mensuelle · export CSV · scénarios', font=font(FONT_REG, 25), fill=PENCIL)
    d.text((x0, 648), 'Taux vérifiés, tous modifiables. Aucune donnée envoyée.', font=font_title(36), fill=BLUE)
    grain(img, 10).convert('RGB').save(VIS / 'couverture-1280x720.png')

    # vignette carrée
    S = 600
    sq = Image.new('RGBA', (S, S), PAPER + (255,))
    dd = ImageDraw.Draw(sq, 'RGBA')
    wobbly_rect(dd, [28, 28, S - 28, S - 28], fill=CARD + (255,), outline=INK, width=4, seed=5)
    ic = draw_icon(250)
    sq.alpha_composite(ic, (175, 75))
    dd.text((300, 400), 'Reste Net', font=font_title(88), fill=INK, anchor='mm')
    dd.rounded_rectangle([175, 442, 425, 454], radius=6, fill=MARKER + (230,))
    dd.text((300, 490), 'Combien il me reste vraiment ?', font=font(FONT_REG, 30), fill=PENCIL, anchor='mm')
    dd.text((300, 540), 'Calculateur de net · 3 €', font=font(FONT_REG, 26), fill=INK, anchor='mm')
    grain(sq, 10).convert('RGB').save(VIS / 'vignette-600x600.png')
    draw_icon(300).convert('RGB').save(VIS / 'store-logo-300x300.png')
    print('couverture, vignette, logo store écrits dans', VIS)


def chrome() -> str:
    for p in (r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
              r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'):
        if Path(p).exists():
            return p
    raise SystemExit('Chrome ou Edge introuvable')


def shot(url: str, out: Path, width: int = 1366, height: int = 768, dark: bool = False) -> None:
    profile = tempfile.mkdtemp(prefix='rn-shot-')
    args = [chrome(), '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--window-size={width},{height}',
            f'--user-data-dir={profile}', '--no-first-run', '--virtual-time-budget=4000', f'--screenshot={out}']
    if dark:
        args.append('--force-dark-mode')
    args.append(url)
    subprocess.run(args, check=True, capture_output=True, timeout=90)
    time.sleep(0.2)


MEASURE_JS = ("<script>setTimeout(function(){var o={};document.querySelectorAll('section.card').forEach(function(s){"
              "o[s.id]=Math.round(s.getBoundingClientRect().top+scrollY)});document.title='POS'+JSON.stringify(o)},1500)</script>")


def measure(src: Path, width: int = 1366, height: int = 7000) -> dict:
    """Position verticale (px) du haut de chaque section, rendue par Chrome à la largeur donnée.
    Une copie temporaire de la page, placée à côté de l'original pour garder ses ressources, écrit les positions dans <title>."""
    tmp = src.with_name('_mesure_' + src.name)
    tmp.write_text(src.read_text(encoding='utf-8').replace('</body>', MEASURE_JS + '</body>'), encoding='utf-8')
    try:
        profile = tempfile.mkdtemp(prefix='rn-pos-')
        args = [chrome(), '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--window-size={width},{height}',
                f'--user-data-dir={profile}', '--no-first-run', '--virtual-time-budget=4000', '--dump-dom', tmp.as_uri() + '?theme=light']
        out = subprocess.run(args, check=True, capture_output=True, timeout=90).stdout.decode('utf-8', 'replace')
        m = re.search(r'<title>POS(\{.*?\})</title>', out)
        if not m:
            raise SystemExit('mesure des sections impossible (titre non trouvé)')
        return json.loads(m.group(1))
    finally:
        tmp.unlink(missing_ok=True)


def make_shots() -> None:
    VIS.mkdir(exist_ok=True)
    full = (ROOT / 'dist' / 'complet' / 'reste-net-complet.html').resolve()
    free = (ROOT / 'docs' / 'index.html').resolve()
    if not full.exists():
        raise SystemExit('Lance d\'abord build.py')
    pos_full, pos_free = measure(full), measure(free)
    CROPS = {'comparateur': pos_full['resultsCard'] - 30, 'tresorerie': pos_full['cashCard'] - 30, 'objectif': pos_full['goalCard'] - 30,
             'statut': pos_full['compareCard'] - 30, 'inverse': pos_full['inverseCard'] - 30, 'gratuite': max(0, pos_free['statusCard'] - 400)}
    print('sections (px) :', CROPS)
    # Rendus pleine page puis recadrage en 1366×768 (le Store et Gumroad veulent des captures de cette taille).
    tall_full = VIS / '_full-light-tall.png'
    tall_free = VIS / '_free-light-tall.png'
    tall_dark = VIS / '_full-dark-tall.png'
    shot(full.as_uri() + '?theme=light', tall_full, 1366, TALL_FULL)
    shot(free.as_uri() + '?theme=light', tall_free, 1366, TALL_FREE)
    shot(full.as_uri() + '?theme=dark', tall_dark, 1366, TALL_FULL, dark=True)

    def crop(src: Path, top: int, out: Path) -> None:
        Image.open(src).crop((0, top, 1366, top + 768)).save(out)

    crop(tall_full, CROPS['comparateur'], VIS / 'capture-1-comparateur.png')
    crop(tall_full, CROPS['inverse'], VIS / 'capture-2-inverse.png')
    crop(tall_free, CROPS['gratuite'], VIS / 'capture-3-gratuite.png')
    crop(tall_dark, CROPS['comparateur'], VIS / 'capture-4-sombre.png')
    crop(tall_full, CROPS['tresorerie'], VIS / 'capture-5-tresorerie.png')
    crop(tall_full, CROPS['objectif'], VIS / 'capture-6-objectif.png')
    crop(tall_full, CROPS['statut'], VIS / 'capture-7-statut-jalons.png')
    (ROOT / 'app' / 'screenshots').mkdir(exist_ok=True)
    Image.open(VIS / 'capture-1-comparateur.png').convert('RGB').save(ROOT / 'app' / 'screenshots' / 'comparateur.png')
    for tmp in (tall_full, tall_free, tall_dark):
        tmp.unlink(missing_ok=True)
    print('captures :', sorted(p.name for p in VIS.glob('capture-*.png')))


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('icons', 'all'):
        make_icons()
    if what in ('cover', 'all'):
        make_cover()
    if what in ('shots', 'all'):
        make_shots()
