"""Reste Net — génération des visuels (icônes, couverture, vignette, captures).

  python make_visuals.py icons        → app/icons/icon-192.png, icon-512.png, icon-maskable-512.png
  python make_visuals.py cover        → visuels/couverture-1280x720.png, visuels/vignette-600x600.png, visuels/store-logo-300x300.png
  python make_visuals.py shots        → visuels/capture-*.png (Chrome headless sur dist/complet et docs/) + app/screenshots/comparateur.png
  python make_visuals.py all
"""
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
ICONS = ROOT / 'app' / 'icons'
VIS = ROOT / 'visuels'
TEAL = (15, 118, 110)
TEAL_DARK = (9, 78, 73)
INK = (22, 32, 42)
PAPER = (244, 246, 245)
GOLD = (201, 151, 0)
# Ordonnée (px) du haut de chaque recadrage dans les rendus pleine page ; à ajuster si la mise en page change.
CROPS = {'comparateur': 860, 'inverse': 1700, 'gratuite': 430}
FONT_BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
FONT_REG = 'C:/Windows/Fonts/segoeui.ttf'


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    """Carré arrondi teal, grand « € » blanc dont le bas est coupé par une barre dorée : « ce qui reste »."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 0 if maskable else int(size * 0.04)
    radius = int(size * (0 if maskable else 0.22))
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=TEAL)
    s = size
    f = font(FONT_BOLD, int(s * 0.66))
    text = '€'
    bbox = d.textbbox((0, 0), text, font=f)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (s - w) / 2 - bbox[0]
    y = (s - h) / 2 - bbox[1] - s * 0.04
    d.text((x, y), text, font=f, fill=(255, 255, 255))
    # barre dorée « net » en bas, légèrement inclinée
    bar_h = int(s * 0.075)
    y0 = int(s * 0.76)
    d.rounded_rectangle([int(s * 0.2), y0, int(s * 0.8), y0 + bar_h], radius=bar_h // 2, fill=GOLD)
    return img


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
    img = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(img)
    # bande teal à gauche
    d.rectangle([0, 0, 470, H], fill=TEAL)
    d.rectangle([0, H - 60, 470, H], fill=TEAL_DARK)
    icon = draw_icon(200)
    img.paste(icon, (135, 110), icon)
    d.text((235, 340), 'Reste Net', font=font(FONT_BOLD, 54), fill=(255, 255, 255), anchor='mm')
    d.text((235, 400), 'Combien il me reste vraiment ?', font=font(FONT_REG, 26), fill=(224, 242, 239), anchor='mm')
    d.text((235, H - 30), '3 € · fichier hors ligne + web · Windows', font=font(FONT_REG, 20), fill=(255, 255, 255), anchor='mm')
    # côté droit : mini tableau
    x0 = 520
    d.text((x0, 70), 'Ce que tu touches vraiment sur une vente à 5 €', font=font(FONT_BOLD, 30), fill=INK)
    d.text((x0, 115), 'Frais de plateforme, retraits, cotisations URSSAF 2026, impôt.', font=font(FONT_REG, 22), fill=(91, 103, 112))
    rows = engine_nets(5.0, [('direct', 'Entre particuliers'), ('polar', 'Polar.sh'), ('gumroad', 'Gumroad'), ('comeup', 'ComeUp'),
                             ('msstore', 'Microsoft Store'), ('fiverr', 'Fiverr'), ('itch', 'itch.io')])
    y = 175
    fb, fr = font(FONT_BOLD, 24), font(FONT_REG, 24)
    for i, (name, net, ratio) in enumerate(rows):
        d.text((x0, y), name, font=fr, fill=INK)
        bar_w = int(420 * ratio)
        d.rounded_rectangle([x0 + 230, y + 6, x0 + 230 + bar_w, y + 26], radius=10, fill=TEAL if i else GOLD)
        d.text((x0 + 230 + 420 + 16, y), net, font=fb, fill=INK)
        y += 52
    d.text((x0, 560), 'Puis ton statut : particulier occasionnel, micro-BNC, micro-BIC…', font=font(FONT_REG, 22), fill=(91, 103, 112))
    d.text((x0, 595), 'Calcul inverse · simulation mensuelle · export CSV · scénarios', font=font(FONT_REG, 22), fill=(91, 103, 112))
    d.text((x0, 650), 'Taux vérifiés, tous modifiables. Aucune donnée envoyée.', font=font(FONT_BOLD, 22), fill=TEAL)
    img.save(VIS / 'couverture-1280x720.png')

    # vignette carrée
    S = 600
    sq = Image.new('RGB', (S, S), TEAL)
    dd = ImageDraw.Draw(sq)
    ic = draw_icon(260)
    sq.paste(ic, (170, 90), ic)
    dd.text((300, 410), 'Reste Net', font=font(FONT_BOLD, 60), fill=(255, 255, 255), anchor='mm')
    dd.text((300, 475), 'Combien il me reste vraiment ?', font=font(FONT_REG, 28), fill=(224, 242, 239), anchor='mm')
    dd.text((300, 540), 'Calculateur de net · 3 €', font=font(FONT_REG, 24), fill=(255, 255, 255), anchor='mm')
    sq.save(VIS / 'vignette-600x600.png')
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


def make_shots() -> None:
    VIS.mkdir(exist_ok=True)
    full = (ROOT / 'dist' / 'complet' / 'reste-net-complet.html').resolve()
    free = (ROOT / 'docs' / 'index.html').resolve()
    if not full.exists():
        raise SystemExit('Lance d\'abord build.py')
    # Rendus pleine page puis recadrage en 1366×768 (le Store et Gumroad veulent des captures de cette taille).
    tall_full = VIS / '_full-light-tall.png'
    tall_free = VIS / '_free-light-tall.png'
    tall_dark = VIS / '_full-dark-tall.png'
    shot(full.as_uri() + '?theme=light', tall_full, 1366, 3200)
    shot(free.as_uri() + '?theme=light', tall_free, 1366, 2400)
    shot(full.as_uri() + '?theme=dark', tall_dark, 1366, 3200, dark=True)

    def crop(src: Path, top: int, out: Path) -> None:
        Image.open(src).crop((0, top, 1366, top + 768)).save(out)

    crop(tall_full, CROPS['comparateur'], VIS / 'capture-1-comparateur.png')
    crop(tall_full, CROPS['inverse'], VIS / 'capture-2-inverse.png')
    crop(tall_free, CROPS['gratuite'], VIS / 'capture-3-gratuite.png')
    crop(tall_dark, CROPS['comparateur'], VIS / 'capture-4-sombre.png')
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
