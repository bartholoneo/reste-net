"""Reste Net — construction des livrables.

Produit :
  docs/                          édition gratuite + PWA, servie par GitHub Pages (Settings → Pages → main, /docs)
                                 docs/store.html + manifest-store.webmanifest : point d'entrée pour PWABuilder (Microsoft Store)
  dist/complet/reste-net-complet.html   fichier unique, édition complète, hors ligne (livré par Gumroad / Polar) ; jamais versionné

Usage : python build.py
"""
import base64
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = ROOT / 'app'
DOCS = ROOT / 'docs'
DIST = ROOT / 'dist'
SITE_URL = 'https://bartholoneo.github.io/reste-net/'


def read(name: str) -> str:
    return (APP / name).read_text(encoding='utf-8')


def version() -> str:
    m = re.search(r"version:\s*'([^']+)'", read('rates.js'))
    return m.group(1) if m else 'dev'


def single_file(edition: str) -> str:
    """Inline CSS, JS et icône dans un seul HTML autonome."""
    html = read('index.html')
    css = read('styles.css')
    js = '\n'.join(read(n) for n in ('rates.js', 'calc.js', 'app.js'))
    assert '</script>' not in js, 'un </script> dans le JS casserait le fichier unique'
    icon_b64 = base64.b64encode((APP / 'icons' / 'icon-192.png').read_bytes()).decode()
    data_uri = f'data:image/png;base64,{icon_b64}'
    html = html.replace('<link rel="stylesheet" href="styles.css">', f'<style>\n{css}\n</style>')
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
    html = html.replace('href="icons/icon-192.png"', f'href="{data_uri}"').replace('src="icons/icon-192.png"', f'src="{data_uri}"')
    html = html.replace("window.RESTE_NET_EDITION = window.RESTE_NET_EDITION || 'free';",
                        f"window.RESTE_NET_EDITION = '{edition}'; window.RESTE_NET_SINGLE_FILE = true;")
    inline = f'\n  <script>\n{js}\n  </script>'
    # lambda : le code JS contient des antislashs que re.sub interpréterait comme des échappements
    html = re.sub(r'\s*<script src="rates.js"></script>\s*<script src="calc.js"></script>\s*<script src="app.js"></script>',
                  lambda m: inline, html)
    return html


def build_site() -> None:
    if DOCS.exists():
        shutil.rmtree(DOCS)
    shutil.copytree(APP, DOCS, ignore=shutil.ignore_patterns('__pycache__'))
    ver = version()
    (DOCS / 'sw.js').write_text(read('sw.js').replace('__VERSION__', ver), encoding='utf-8')
    manifest = read('manifest.webmanifest')
    (DOCS / 'manifest-store.webmanifest').write_text(manifest.replace('"start_url": "./"', '"start_url": "./?src=msstore"'), encoding='utf-8')
    store_html = read('index.html').replace('href="manifest.webmanifest"', 'href="manifest-store.webmanifest"')
    store_html = store_html.replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n  <meta name="theme-color"', 1)
    (DOCS / 'store.html').write_text(store_html, encoding='utf-8')
    (DOCS / '.nojekyll').write_text('', encoding='utf-8')


def build_full() -> int:
    out = DIST / 'complet'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'reste-net-complet.html').write_text(single_file('full'), encoding='utf-8')
    (out / 'LISEZMOI.txt').write_text(
        'Reste Net — version complète\n\n'
        '1. Double-clique sur reste-net-complet.html : il s\'ouvre dans ton navigateur, sans installation, sans connexion.\n'
        '2. Garde le fichier où tu veux (clé USB, Documents) : tout fonctionne hors ligne et rien n\'est envoyé.\n'
        f'3. Ta clé de licence (reçue avec l\'achat) déverrouille aussi la version web : {SITE_URL} → « J\'ai une clé ».\n'
        '4. Les scénarios enregistrés restent dans le navigateur qui les a créés.\n\n'
        'Questions, taux à corriger : bartholoneo@gmail.com\n', encoding='utf-8')
    return (out / 'reste-net-complet.html').stat().st_size


def main() -> None:
    build_site()
    size = build_full()
    print(f'OK  version {version()}  site={DOCS}  complet={DIST / "complet"} ({size // 1024} Ko)')


if __name__ == '__main__':
    main()
