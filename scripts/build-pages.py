"""Stage only the browser files used by the authenticated site in a new directory."""
import json
import re
import shutil
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(sys.argv[1]).resolve()
OUTPUT.mkdir(parents=True, exist_ok=False)
pending = ['index.html', 'offline.html', 'sw.js', 'manifest.webmanifest',
           'apple-touch-icon.png', 'apple-touch-icon-precomposed.png', 'apple-touch-icon-180x180.png']
copied = set()


def include(parent, reference):
    url = urlsplit(reference)
    if url.scheme or url.netloc or not url.path or url.path.startswith('#'):
        return
    if url.path.startswith('/sculp-database/'):
        target = ROOT / url.path.removeprefix('/sculp-database/')
    else:
        target = parent / url.path
    relative = target.resolve().relative_to(ROOT).as_posix()
    if not (ROOT / relative).is_file():
        raise ValueError(f'Missing production dependency {relative}')
    pending.append(relative)


class Resources(HTMLParser):
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in ('script', 'img') and 'src' in values:
            include(ROOT, values['src'])
        if tag == 'link' and 'href' in values:
            include(ROOT, values['href'])


while pending:
    name = pending.pop()
    if name in copied:
        continue
    source = ROOT / name
    destination = OUTPUT / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    copied.add(name)
    if name == 'src/vendor/supabase.js' or source.suffix not in {'.js', '.html', '.css', '.webmanifest'}:
        continue
    content = source.read_text()
    if source.suffix == '.html':
        Resources().feed(content)
    elif source.suffix == '.webmanifest':
        for icon in json.loads(content)['icons']:
            include(source.parent, icon['src'])
    elif source.suffix == '.css':
        for ref in re.findall(r"""url\(\s*['"]?([^'")\s]+)""", content):
            include(source.parent, ref)
    else:
        for ref in re.findall(r"""(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.{1,2}/[^'"]+)['"]""", content):
            include(source.parent, ref)
        for asset in re.findall(r"""['"](assets/[\w./-]+\.(?:png|jpg|webp|svg))['"]""", content):
            include(ROOT, asset)
for name in copied:
    if name.startswith(('scripts/', 'docs/', 'src/data/', 'src/pages/demo/')) or 'demo' in Path(name).name:
        raise ValueError(f'Development file entered the release: {name}')
print(f'Staged {len(copied)} production files.')
