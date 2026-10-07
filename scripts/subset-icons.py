"""
Cuts the Material Symbols font down to the icons the app actually draws.

The full font is ~1.4 MB and holds ~4,000 icons; the app uses a few hundred.
Run this after adding an icon (or a goal icon) and commit the result:

    pip install fonttools brotli
    python scripts/subset-icons.py

How the list is made: every quoted word in the source that is the name of an
icon in the full font is kept, and so is every such word that appeared in any
commit of the history (an old goal or alert may still carry an icon the code no
longer uses). Over-including is harmless, a missing icon would show its name as
text, so the rule errs towards keeping.

Source of truth: assets/fonts-src/material-symbols-rounded.full.woff2
Output:          assets/fonts/material-symbols-rounded.woff2
"""
import os
import re
import subprocess
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL = os.path.join(ROOT, 'assets', 'fonts-src', 'material-symbols-rounded.full.woff2')
OUT = os.path.join(ROOT, 'assets', 'fonts', 'material-symbols-rounded.woff2')
CODE_DIRS = ['components', 'services', 'i18n', 'hooks', 'contexts', 'lib', 'App.tsx', 'types.ts', 'index.tsx']
# 'name', "name", `name` and the bare text in <span>name</span>.
WORD = re.compile(r"""['"`]([a-z][a-z0-9_]{1,60})['"`]|>\s*([a-z][a-z0-9_]{1,60})\s*<""")


def ligature_names(font):
    """Icon name -> every (first glyph, components, result) that spells it."""
    cmap = font.getBestCmap()
    reverse = {glyph: chr(code) for code, glyph in cmap.items()}
    found = {}
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            sub = getattr(sub, 'ExtSubTable', sub)
            for first, ligs in getattr(sub, 'ligatures', {}).items():
                for lig in ligs:
                    seq = [first] + list(lig.Component)
                    try:
                        name = ''.join(reverse[g] for g in seq)
                    except KeyError:
                        continue
                    found.setdefault(name, []).append((first, tuple(lig.Component), lig.LigGlyph))
    return found


def words_in_tree():
    words = set()
    for entry in CODE_DIRS:
        path = os.path.join(ROOT, entry)
        files = []
        if os.path.isfile(path):
            files = [path]
        else:
            for base, _, names in os.walk(path):
                files += [os.path.join(base, n) for n in names if n.endswith(('.ts', '.tsx'))]
        for f in files:
            if os.sep + 'tests' + os.sep in f:
                continue
            for quoted, bare in WORD.findall(open(f, encoding='utf8', errors='ignore').read()):
                words.add(quoted or bare)
    return words


def words_in_history():
    words = set()
    try:
        commits = subprocess.run(['git', 'rev-list', '--all'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    except Exception:
        print('no git history: only the working tree is scanned', file=sys.stderr)
        return words
    for commit in commits:
        out = subprocess.run(
            ['git', 'grep', '-hoE', r"""['"`>][ ]*[a-z][a-z0-9_]{1,60}[ ]*['"`<]""", commit, '--', *CODE_DIRS],
            cwd=ROOT, capture_output=True, text=True, errors='ignore',
        ).stdout
        words.update(w.strip('\'"`<>') for w in out.split())
    return words


def main():
    font = TTFont(FULL)
    available = ligature_names(font)
    wanted = {w for w in (words_in_tree() | words_in_history()) if w in available}
    # The name of the font's own fallback glyphs and the letters it spells with.
    print(f'{len(wanted)} icons kept of {len(available)}')

    # Drop every ligature that spells an icon we do not use, so the subsetter's
    # closure does not pull their shapes back in.
    cmap = font.getBestCmap()
    reverse = {glyph: chr(code) for code, glyph in cmap.items()}
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            sub = getattr(sub, 'ExtSubTable', sub)
            ligatures = getattr(sub, 'ligatures', None)
            if not ligatures:
                continue
            for first in list(ligatures):
                keep = []
                for lig in ligatures[first]:
                    try:
                        name = ''.join(reverse[g] for g in [first] + list(lig.Component))
                    except KeyError:
                        keep.append(lig)
                        continue
                    if name in wanted:
                        keep.append(lig)
                if keep:
                    ligatures[first] = keep
                else:
                    del ligatures[first]

    options = subset.Options()
    options.layout_features = ['*']
    options.glyph_names = False
    options.hinting = False
    options.notdef_outline = True
    options.name_IDs = [1, 2, 3, 4, 6]
    options.flavor = 'woff2'
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[ord(c) for c in 'abcdefghijklmnopqrstuvwxyz0123456789_'])
    subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(OUT)

    kept = ligature_names(TTFont(OUT))
    missing = sorted(wanted - set(kept))
    extra = sorted(set(kept) - wanted)
    print(f'{os.path.getsize(OUT) / 1024:.0f} KB; ligatures in output: {len(kept)}')
    if missing:
        print('MISSING after subsetting:', missing)
        sys.exit(1)
    if extra:
        print('unexpected extra ligatures:', extra[:10])


if __name__ == '__main__':
    main()
