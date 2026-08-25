"""Emit `site/app/public/abbrevs.json`: the abbreviations the condition box replaces while
the visitor types (plan §9.3), from the `abbrev:` fields of the distribution's
`etc/symbols`.  Not part of the tokenizer asset on purpose: replacement happens
in the box before a condition is sent, so it never touches tokenisation, and
the asset sentinel (§8.2) must not move when this table does.

An abbreviation is emitted only when it can be replaced the moment it is
typed, without asking:
  - unambiguous — exactly one symbol declares it (`.>` serves 21 arrows);
  - two or more characters, none of them a letter or a digit — `%`, `!`, `?`,
    `:`, `|` alone and the words `Un`, `Int`, `ALL`, `EX` would rewrite the
    names people type (`?n`, `x::nat`, `Int.int`) into symbols.
The table maps abbreviation -> character; the box replaces the longest
abbreviation the text ends with.  Run from the repository root:
    python3 site/build_abbrevs.py [ISABELLE_HOME]
"""
import json, os, re, sys

def load(symbols_path: str) -> 'dict[str, str]':
    declared: 'dict[str, set[int]]' = {}
    for line in open(symbols_path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        code = re.search(r"\bcode:\s*(0x[0-9a-fA-F]+)", line)
        if not code:
            continue
        for m in re.finditer(r"\babbrev:\s*(\S+)", line):
            declared.setdefault(m.group(1), set()).add(int(code.group(1), 16))
    return {a: chr(next(iter(cs))) for a, cs in declared.items()
            if len(cs) == 1 and len(a) >= 2 and not any(ch.isalnum() for ch in a)}

def main(argv):
    home = argv[1] if len(argv) > 1 else os.environ.get("ISABELLE_HOME")
    if not home:
        sys.exit("give ISABELLE_HOME as the argument or in the environment")
    table = load(os.path.join(home, "etc", "symbols"))
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app", "public", "abbrevs.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(table.items())), f, ensure_ascii=False, indent=1)
        f.write("\n")
    prefixes = [(a, b) for a in table for b in table if a != b and b.startswith(a)]
    print(f"{len(table)} abbreviations -> {out}; "
          f"{len(prefixes)} proper-prefix pair(s): {prefixes}")

if __name__ == "__main__":
    main(sys.argv)
