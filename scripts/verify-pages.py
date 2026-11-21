"""Check a published Pages release against its staged files and retired routes."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from sys import argv
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

base, directory, revision = argv[1:]
if urlsplit(base).scheme != 'https':
    raise ValueError('Expected a live HTTPS Pages URL')
site = Path(directory)
expected = {p.relative_to(site).as_posix(): p.read_bytes() for p in site.rglob('*') if p.is_file()}
retired = ('monthly-demo.html', 'manifest-demo.webmanifest', 'src/app.js', 'src/data/demo.js',
           'scripts/fixtures/catalog/demo.js', 'docs/API_CONTRACT.md', 'package.json',
           'supabase/migrations/001_initial_schema.sql', 'src/domain/demo-workspace.js',
           'assets/bridal-profile.jpg', 'supabase/functions/sculpy-ai/handler.ts')


def verify(path):
    url = urljoin(base.rstrip('/') + '/', path) + '?release=' + revision
    request = Request(url, headers={'Cache-Control': 'no-cache'})
    try:
        with urlopen(request, timeout=12) as response:
            if path in expected and response.status == 200 and response.read() == expected[path]:
                return None
            return f'{path} returned {response.status} with unexpected content'
    except HTTPError as error:
        if path in retired and error.code == 404:
            return None
        return f'{path} returned {error.code}'
    except (URLError, TimeoutError) as error:
        return f'{path} could not be verified ({type(error).__name__})'


for attempt in range(8):
    with ThreadPoolExecutor(max_workers=6) as pool:
        failures = [error for error in pool.map(verify, [*expected, *retired]) if error]
    if not failures:
        print(f'{len(expected)} production files and {len(retired)} retired paths verified.')
        break
    print('\n'.join(failures), flush=True)
    if attempt == 7:
        raise SystemExit('Published URLs do not match the staged release.')
    sleep(10)
