"""KONTROLA KODU — spustite z korena projektu:  python3 nastroje/kontrola.py

Hlada dve veci, ktore obe skoncia bielou obrazovkou:
  1. identifikatory, ktore sa pouzivaju, ale nie su nikde definovane ani importovane
     (zmazana funkcia, na ktoru este niekto ukazoval),
  2. importy z vlastnych suborov, ktore cielovy subor vobec neexportuje
     (preklep v nazve alebo export, ktory sa zabudlo dopisat)."""
import re, pathlib, sys

GLOBALY = set('''
window document localStorage sessionStorage console navigator location history caches fetch crypto
setTimeout clearTimeout setInterval clearInterval requestAnimationFrame queueMicrotask
Object Array String Number Boolean Math JSON Date Map Set WeakMap Promise Error TypeError RangeError
Intl RegExp Symbol Proxy Reflect BigInt Infinity NaN undefined null true false
URL URLSearchParams Blob File FileReader FormData Headers Request Response AbortController
TextEncoder TextDecoder Uint8Array Int8Array ArrayBuffer DataView atob btoa structuredClone
Event CustomEvent Element HTMLElement Node DocumentFragment MutationObserver IntersectionObserver
alert confirm prompt isNaN parseInt parseFloat encodeURIComponent decodeURIComponent
if for while switch return function class const let var new typeof instanceof void delete in of
try catch finally throw else do await async yield import export default extends super this case break continue
'''.split())

def analyzuj(cesta):
    s = cesta.read_text()
    definovane = set()
    for m in re.finditer(r'\b(?:function|class)\s+([A-Za-z_$][\w$]*)', s): definovane.add(m.group(1))
    for m in re.finditer(r'\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)', s): definovane.add(m.group(1))
    # rozbalenie: const { a, b } = ...   a   const [a, b] = ...
    for m in re.finditer(r'\b(?:const|let|var)\s*[\{\[]([^}\]]*)[\}\]]\s*=', s):
        for kus in m.group(1).split(','):
            kus = kus.split(':')[-1].split('=')[0].strip().lstrip('.')
            if re.fullmatch(r'[A-Za-z_$][\w$]*', kus): definovane.add(kus)
    # parametre funkcii a sipkovych funkcii
    for m in re.finditer(r'(?:function\s*[\w$]*\s*|\)\s*=>|\(([^()]*)\)\s*=>)', s):
        pass
    for m in re.finditer(r'\(([^()]{0,200}?)\)\s*=>', s):
        for kus in re.split(r'[,{}\[\]]', m.group(1)):
            kus = kus.split(':')[-1].split('=')[0].strip().lstrip('.')
            if re.fullmatch(r'[A-Za-z_$][\w$]*', kus): definovane.add(kus)
    for m in re.finditer(r'function\s*[\w$]*\s*\(([^()]{0,300}?)\)', s):
        for kus in re.split(r'[,{}\[\]]', m.group(1)):
            kus = kus.split(':')[-1].split('=')[0].strip().lstrip('.')
            if re.fullmatch(r'[A-Za-z_$][\w$]*', kus): definovane.add(kus)
    for m in re.finditer(r'\b([A-Za-z_$][\w$]*)\s*=>', s): definovane.add(m.group(1))
    for m in re.finditer(r'catch\s*\(\s*([A-Za-z_$][\w$]*)', s): definovane.add(m.group(1))
    for m in re.finditer(r'for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)', s): definovane.add(m.group(1))

    importovane = set()
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from', s):
        for kus in m.group(1).split(','):
            kus = kus.split(' as ')[-1].strip()
            if kus: importovane.add(kus)
    for m in re.finditer(r'import\s+([A-Za-z_$][\w$]*)\s+from', s): importovane.add(m.group(1))
    for m in re.finditer(r'import\s*\*\s*as\s+([A-Za-z_$][\w$]*)', s): importovane.add(m.group(1))

    zname = definovane | importovane | GLOBALY

    # volania fn(...) a odkazy typu onclick: fn
    podozrive = {}
    bez_retazcov = re.sub(r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"|`(?:[^`\\]|\\.)*`|/\*.*?\*/|//[^\n]*", "''", s, flags=re.S)
    for m in re.finditer(r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(', bez_retazcov):
        n = m.group(1)
        if n not in zname:
            podozrive.setdefault(n, s[:m.start()].count('\n') + 1)
    for m in re.finditer(r'\bon\w+:\s*([A-Za-z_$][\w$]*)\s*[,}]', bez_retazcov):
        n = m.group(1)
        if n not in zname:
            podozrive.setdefault(n, s[:m.start()].count('\n') + 1)
    return podozrive

def exportovane(cesta):
    """Nazvy, ktore subor naozaj exportuje."""
    s = cesta.read_text()
    von = set()
    for m in re.finditer(r'export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)', s):
        von.add(m.group(1))
    for m in re.finditer(r'export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)', s):
        von.add(m.group(1))
    # export { a, b as c }
    for m in re.finditer(r'export\s*\{([^}]*)\}', s):
        for kus in m.group(1).split(','):
            kus = kus.split(' as ')[-1].strip()
            if re.fullmatch(r'[A-Za-z_$][\w$]*', kus): von.add(kus)
    for m in re.finditer(r'export\s+(?:const|let|var)\s*\{([^}]*)\}\s*=', s):
        for kus in m.group(1).split(','):
            kus = kus.split(':')[-1].split('=')[0].strip()
            if re.fullmatch(r'[A-Za-z_$][\w$]*', kus): von.add(kus)
    return von


def chybajuceExporty(cesta):
    """Importy z vlastnych suborov, ktore cielovy subor neexportuje."""
    s = cesta.read_text()
    chyby = []
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from\s*[\'"](\.[^\'"]+)[\'"]', s):
        ciel = (cesta.parent / m.group(2)).resolve()
        if not ciel.exists():
            chyby.append((s[:m.start()].count('\n') + 1, f'subor {m.group(2)} neexistuje'))
            continue
        mame = exportovane(ciel)
        for kus in m.group(1).split(','):
            meno = kus.split(' as ')[0].strip()
            if meno and meno not in mame:
                chyby.append((s[:m.start()].count('\n') + 1,
                              f'{meno} — {ciel.name} to neexportuje'))
    return chyby


celkom = 0
for f in sorted(pathlib.Path('js').rglob('*.js')) + [pathlib.Path('sw.js')]:
    for r, popis in chybajuceExporty(f):
        print(f'{f}:{r}  →  {popis}')
        celkom += 1
    naslo = analyzuj(f)
    for n, r in sorted(naslo.items(), key=lambda x: x[1]):
        print(f'{f}:{r}  →  {n}')
        celkom += 1
print(f'\nnájdených podozrivých: {celkom}')
