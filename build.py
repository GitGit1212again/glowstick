#!/usr/bin/env python3
"""Bundle src/ into dist/Glowstick.html - one self-contained offline file.

Python 3 standard library only, no third-party packages.

What it does:
  1. reads src/index.html
  2. inlines every local <link rel="stylesheet"> as a <style> block
  3. walks the ES-module graph from src/js/main.js, orders it so every module
     comes after the modules it imports (fails loudly on a cycle or a bad path)
  4. wraps each module in its own function scope that returns its exports,
     and rewrites `import` lines into destructuring from those scopes. That
     lets several modules export the same name (every view exports render())
     and supports `import * as ns`.
  5. puts it all in ONE <script type="module">
  6. copies src/assets/ verbatim

Profiles:
  python build.py           personal build -> dist/Glowstick.html, android/app/src/main/assets/app/index.html,
                            Desktop/Glowstick.html
  python build.py --store   public build   -> dist/Glowstick-store.html, android/app/src/store/assets/app/index.html
                            (profile.js flipped to "store", src/data/personal.js replaced by `PERSONAL = null`,
                            then a leak check that no string from personal.js is in the output)

Supported syntax: `import { a, b as c } from "./x.js"`, `import * as ns from`,
`import "./x.js"`, `export function|async function|const|let|class`,
`export { a, b as c }`. Not supported: default exports, re-exports,
dynamic import, live bindings of reassigned `let` exports.
"""

import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")
ENTRY = os.path.join(SRC, "js", "main.js")
OUT = os.path.join(DIST, "Glowstick-store.html" if "--store" in sys.argv else "Glowstick.html")

LINK_RE = re.compile(r'[ \t]*<link[^>]*rel=["\']stylesheet["\'][^>]*>[ \t]*\n?', re.I)
HREF_RE = re.compile(r'href=["\']([^"\']+)["\']', re.I)
SCRIPT_RE = re.compile(r'[ \t]*<script[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>[ \t]*\n?', re.I)
IMPORT_RE = re.compile(
    r'^[ \t]*import\s+(?:(\*\s+as\s+(\w+))|(\{[^}]*\}))?\s*(?:from\s+)?[\'"]([^\'"]+)[\'"]\s*;?[ \t]*$', re.M)
EXPORT_DECL_RE = re.compile(r'^([ \t]*)export\s+(?=(async\s+function|function|const|let|var|class)\s+(\w+))', re.M)
EXPORT_LIST_RE = re.compile(r'^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$\n?', re.M)
EXPORT_DEFAULT_RE = re.compile(r'^\s*export\s+default\b', re.M)


def die(msg):
    sys.stderr.write("build.py: " + msg + "\n")
    raise SystemExit(1)


# --store: a public build. The profile flips to "store" and the personal data module is replaced by a stub,
# so no personal number, names or bundled pictures are ever written into the output.
STORE = "--store" in sys.argv
OVERRIDES = {}
if STORE:
    OVERRIDES[os.path.normpath(os.path.join(SRC, "js", "profile.js"))] = "replace-profile"
    OVERRIDES[os.path.normpath(os.path.join(SRC, "data", "personal.js"))] = "export const PERSONAL = null;" + chr(10)


def read(path):
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    ov = OVERRIDES.get(os.path.normpath(path))
    if ov == "replace-profile":
        return text.replace('export const PROFILE = "personal";', 'export const PROFILE = "store";')
    if ov is not None:
        return ov
    return text


def resolve(importer, spec):
    if not spec.startswith("."):
        die("non-relative import %r in %s" % (spec, os.path.relpath(importer, ROOT)))
    target = os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    if not os.path.isfile(target):
        die("unresolved import %r from %s" % (spec, os.path.relpath(importer, ROOT)))
    if os.path.commonpath([os.path.abspath(target), SRC]) != SRC:
        die("import %r from %s escapes src/" % (spec, os.path.relpath(importer, ROOT)))
    return target


def order_modules(entry):
    ordered, done, stack = [], set(), []

    def visit(path):
        if path in done:
            return
        if path in stack:
            cycle = " -> ".join(os.path.relpath(p, SRC).replace("\\", "/") for p in stack[stack.index(path):] + [path])
            die("circular import: " + cycle)
        stack.append(path)
        for m in IMPORT_RE.finditer(read(path)):
            visit(resolve(path, m.group(4)))
        stack.pop()
        done.add(path)
        ordered.append(path)

    visit(entry)
    return ordered


def mod_id(path):
    rel = os.path.relpath(path, SRC).replace("\\", "/")
    return "__m_" + re.sub(r"[^A-Za-z0-9]", "_", rel)


def transform(path):
    """Return (wrapped_js, export_names) for one module."""
    text = read(path)
    if EXPORT_DEFAULT_RE.search(text):
        die("export default is not supported (%s)" % os.path.relpath(path, ROOT))
    exports = []

    def on_import(m):
        ns, names, spec = m.group(2), m.group(3), m.group(4)
        target = mod_id(resolve(path, spec))
        if ns:
            return "const %s = %s;" % (ns, target)
        if names:
            inner = ", ".join(
                (p.strip().replace(" as ", ": ") if " as " in p else p.strip())
                for p in names.strip("{} \n").split(",") if p.strip())
            return "const { %s } = %s;" % (inner, target)
        return "void %s;" % target  # bare import for side effects

    text = IMPORT_RE.sub(on_import, text)

    def on_decl(m):
        exports.append(m.group(3))
        return m.group(1)

    text = EXPORT_DECL_RE.sub(on_decl, text)

    def on_list(m):
        for p in m.group(1).split(","):
            p = p.strip()
            if not p:
                continue
            if " as " in p:
                local, alias = [x.strip() for x in p.split(" as ")]
                exports.append("%s: %s" % (alias, local))
            else:
                exports.append(p)
        return ""

    text = EXPORT_LIST_RE.sub(on_list, text)
    rel = os.path.relpath(path, SRC).replace("\\", "/")
    body = "\n".join("  " + ln if ln.strip() else "" for ln in text.strip("\n").split("\n"))
    wrapped = "/* ---- %s ---- */\nconst %s = (() => {\n%s\n  return { %s };\n})();" % (
        rel, mod_id(path), body, ", ".join(exports))
    return wrapped, exports


def personal_literals():
    """Every quoted string literal in src/data/personal.js (names, numbers, tier names, mascot lines) that is NOT
    also written in the neutral sources. A line the personal build shares word for word with the neutral code is
    already public, so it cannot count as a leak."""
    personal = os.path.join(SRC, "data", "personal.js")
    with open(personal, "r", encoding="utf-8") as fh:
        raw = fh.read()
    body = re.sub(r"^\s*//.*$", "", raw, flags=re.M)  # ignore the comment lines
    literals = set(re.findall(r'"([^"\n]{3,})"', body))
    literals.discard("./mascots.js")
    neutral = []
    for folder, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if d != "data"]
        for name in files:
            if name.endswith((".js", ".html", ".css")):
                with open(os.path.join(folder, name), "r", encoding="utf-8") as fh:
                    neutral.append(fh.read())
    neutral = "\n".join(neutral)
    return sorted(s for s in literals if s not in neutral)


def leak_check(html):
    """Store build: fail if anything from the real personal data module made it into the bundle.
    Every quoted string literal in src/data/personal.js (names, numbers, tier names) must be absent, and
    so must any bundled picture data and the personal profile marker."""
    bad = [s for s in personal_literals() if s in html]
    if re.search(r"data:image/(?:webp|png|jpe?g);base64,", html):
        bad.append("data:image/...;base64 (bundled pictures)")
    if 'PROFILE = "personal"' in html:
        bad.append('PROFILE = "personal"')
    if "PERSONAL = null" not in html:
        bad.append("personal.js was not replaced by the stub")
    if bad:
        die("store build leaks personal data: " + ", ".join(repr(b) for b in bad))
    print("leak check: no string from src/data/personal.js (%d checked), no bundled pictures, profile is store" % len(personal_literals()))


def main():
    index_path = os.path.join(SRC, "index.html")
    if not os.path.isfile(index_path):
        die("missing " + index_path)
    html = read(index_path)

    def inline_css(m):
        tag = m.group(0)
        href_m = HREF_RE.search(tag)
        if not href_m:
            return tag
        href = href_m.group(1)
        if href.startswith("http") or href.startswith("//"):
            return tag
        p = os.path.normpath(os.path.join(SRC, href))
        if not os.path.isfile(p):
            die("unresolved stylesheet %r in src/index.html" % href)
        return "<style>\n/* ---- %s ---- */\n%s</style>\n" % (href, read(p))

    html = LINK_RE.sub(inline_css, html)

    modules = order_modules(ENTRY)
    parts = [transform(p)[0] for p in modules]
    bundle = "<script type=\"module\">\n" + "\n\n".join(parts) + "\n</script>\n"

    def inline_js(m):
        src = m.group(1)
        if src.startswith("http") or src.startswith("//"):
            return m.group(0)
        if os.path.normpath(os.path.join(SRC, src)) != os.path.normpath(ENTRY):
            die("src/index.html loads %r; only js/main.js is bundled" % src)
        return bundle

    html, n = SCRIPT_RE.subn(inline_js, html)
    if n != 1:
        die("expected exactly one <script src=...> in src/index.html, found %d" % n)

    if STORE:
        leak_check(html)

    os.makedirs(DIST, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)

    assets = os.path.join(SRC, "assets")
    if os.path.isdir(assets):
        dest = os.path.join(DIST, "assets")
        if os.path.isdir(dest):
            shutil.rmtree(dest)
        shutil.copytree(assets, dest)
        print("copied assets/ verbatim")

    # downstream copies. Personal: the main Android asset set (packaged by the `personal` Gradle flavor) and a
    # copy on the Desktop (only if a Desktop folder already exists; it is never created). Store: only the `store`
    # flavor's asset set, so the public APK can never pick up the personal bundle and the personal bundle never
    # lands where the store build reads from.
    if STORE:
        dests = (os.path.join(ROOT, "android", "app", "src", "store", "assets", "app", "index.html"),)
    else:
        dests = [os.path.join(ROOT, "android", "app", "src", "main", "assets", "app", "index.html")]
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        if os.path.isdir(desktop):
            dests.append(os.path.join(desktop, "Glowstick.html"))
    for dest in dests:
        try:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copyfile(OUT, dest)
            print("copied to", dest)
        except OSError as e:
            print("could not copy to %s: %s" % (dest, e))

    size = os.path.getsize(OUT)
    print("%d modules bundled" % len(modules))
    print("wrote %s (%d bytes, %.1f KB)" % (os.path.relpath(OUT, ROOT), size, size / 1024))
    print("PROFILE: %s" % ("STORE (public: no personal data, no bundled pictures)" if STORE else "PERSONAL (owner's build)"))


if __name__ == "__main__":
    main()
