#!/usr/bin/env python3
"""
build-basemap.py — regenerate docs/assets/img/world.svg from Natural Earth.

The site ships no bitmaps in its pages; scene art is SVG. This script builds the one
shared cartographic asset that "atlas" scenes reference with
    <use href="../assets/img/world.svg#land" transform="matrix(...)"/>
so nine chapters share one cached file instead of inlining coastlines.

Coordinate space: plain equirectangular degrees, x = lon + 180, y = 90 - lat
(0..360 × 0..180). Scenes never do this arithmetic by hand — scripts/mapkit.py
computes the <use> transform and every marker position for a lon/lat window.

Layers (each a <g> or <path> with an id, no fill/stroke of its own, so the <use>
element's presentation attributes inherit into it):
  #land     — Natural Earth 1:50m land, Douglas-Peucker simplified
  #lakes    — 1:50m lakes (scalerank <= 3)
  #rivers   — 1:50m river centrelines (scalerank <= 4), fill="none"
  #r-<slug> — the same rivers grouped by canonical name (r-nile, r-tigris, …),
              pathLength="1" so a scene can draw one with the .draw primitive
  #deep     — sea deeper than 200 m (1:10m bathymetry). Paint a rectangle in the
              land colour, then #deep in the sea colour, and you have the
              approximate Last Glacial Maximum coastline (sea level then was
              ~120-130 m lower; the 200 m isobath approximates the shelf edge, so
              this slightly over-draws exposed land and must be captioned as
              approximate).

Needs network once (downloads GeoJSON from the natural-earth-vector repo into a
cache dir), then pure stdlib. Natural Earth is public domain.

    python3 scripts/build-basemap.py [--cache DIR]
"""
import argparse, json, os, re, sys, tempfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets", "img", "world.svg")
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"

# canonical river ids: slug -> Natural Earth names that belong to it
RIVERS = {
    "nile": ["Nile", "Rosetta Branch", "Damietta Branch", "Albert Nile", "Victoria Nile",
             "Bahr el Jebel", "El Bahr el Abyad", "El Bahr el Azraq", "Abay", "Kagera"],
    "tigris": ["Tigris", "Dicle", "Shatt al Arab"],
    "euphrates": ["Euphrates", "Firat", "Al Furat"],
    "indus": ["Indus"],
    "ganges": ["Ganges", "Brahmaputra", "Yarlung", "Dihang"],
    "huang": ["Huang"],
    "yangtze": ["Yangtze", "Chang Jiang", "Jinsha", "Tongtian", "Tuotuo"],
    "mekong": ["Mekong", "Lancang"],
    "irrawaddy": ["Ayeyarwady", "Irrawaddy Delta", "Nmai"],
    "amur": ["Amur", "Heilong Jiang", "Argun’"],
    "mississippi": ["Mississippi", "Missouri", "Ohio"],
    "amazon": ["Amazonas", "Ucayali", "Madeira", "Negro"],
    "orinoco": ["Orinoco"],
    "parana": ["Paraná"],
    "niger": ["Niger", "Bénoué", "Benue"],
    "congo": ["Congo", "Lualaba", "Ubangi", "Kasai"],
    "zambezi": ["Zambezi", "Shire"],
    "senegal": ["Sénégal", "Bafing"],
    "orange": ["Orange", "Vaal"],
    "volga": ["Volga"],
    "danube": ["Danube", "Donau", "Bratul Chillia", "Bratul Sulina", "Bratul Sfintu Gheorghe", "Borcea"],
    "dnipro": ["Dnipro", "Dnepre"],
    "rhine": ["Rhine", "Rhein", "Rhin", "Nederrijn", "Waal", "Lek"],
    "murray": ["Murray", "Darling", "Barwon"],
    "yukon": ["Yukon"],
    "mackenzie": ["Mackenzie"],
    "stlawrence": ["St. Lawrence"],
    "columbia": ["Columbia", "Snake"],
    "riogrande": ["Rio Grande"],
    "amudarya": ["Amu  Darya", "Amu Darya"],
    "syrdarya": ["Syr Darya"],
    "jordan": ["Jordan"],
    "tarim": ["Tarim"],
    "ob": ["Ob", "Irtysh", "Ertis", "Ertix"],
    "yenisey": ["Yenisey", "Verkhniy Yenisey", "Malyy Yenisey", "Angara"],
    "lena": ["Lena"],
}


def fetch(name, cache):
    path = os.path.join(cache, name + ".geojson")
    if not os.path.exists(path):
        print("downloading", name, file=sys.stderr)
        urllib.request.urlretrieve(BASE + name + ".geojson", path)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dp(points, tol):
    """Iterative Douglas-Peucker on a list of (x, y)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    t2 = tol * tol
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        dd = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if dd == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / dd
                t = max(0.0, min(1.0, t))
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best:
                best, idx = d, i
        if best > t2 and idx > 0:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def to_xy(ring):
    return [(lon + 180.0, 90.0 - lat) for lon, lat, *_ in ring]


def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def ring_path(pts, closed):
    """Relative path commands keep the file small."""
    out = ["M" + fmt(pts[0][0]) + " " + fmt(pts[0][1])]
    px, py = pts[0]
    rel = []
    for x, y in pts[1:]:
        dx, dy = round(x - px, 2), round(y - py, 2)
        if dx == 0 and dy == 0:
            continue
        rel.append(fmt(dx) + (" " if not fmt(dy).startswith("-") else "") + fmt(dy))
        px, py = px + dx, py + dy
    if rel:
        out.append("l" + " ".join(rel).replace(" -", "-"))
    if closed:
        out.append("z")
    return "".join(out)


def ring_area(pts):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def polygons(fc, tol, min_area):
    parts = []
    for f in fc["features"]:
        g = f["geometry"]
        if not g:
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                pts = dp(to_xy(ring), tol)
                if len(pts) >= 4 and ring_area(pts) >= min_area:
                    parts.append(ring_path(pts, True))
    return "".join(parts)


def lines(features, tol):
    parts = []
    for f in features:
        g = f["geometry"]
        if not g:
            continue
        ls = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for line in ls:
            pts = dp(to_xy(line), tol)
            if len(pts) >= 2:
                parts.append(ring_path(pts, False))
    return "".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(tempfile.gettempdir(), "hht-ne-cache"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    land = fetch("ne_50m_land", args.cache)
    lakes = fetch("ne_50m_lakes", args.cache)
    rivers = fetch("ne_50m_rivers_lake_centerlines", args.cache)
    deep = fetch("ne_10m_bathymetry_K_200", args.cache)

    land_d = polygons(land, 0.07, 0.03)
    lakes_fc = {"features": [f for f in lakes["features"] if f["properties"].get("scalerank", 9) <= 3]}
    lakes_d = polygons(lakes_fc, 0.05, 0.05)
    riv = [f for f in rivers["features"] if f["properties"].get("scalerank", 9) <= 4]
    rivers_d = lines(riv, 0.06)
    deep_d = polygons(deep, 0.15, 0.4)

    by_name = {}
    for f in rivers["features"]:
        by_name.setdefault((f["properties"].get("name") or "").strip(), []).append(f)
    named = []
    for slug, names in RIVERS.items():
        feats = [f for n in names for f in by_name.get(n, [])]
        if not feats:
            print("warning: no features for river", slug, file=sys.stderr)
            continue
        named.append(f'<path id="r-{slug}" pathLength="1" d="{lines(feats, 0.03)}"/>')

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180">
<!-- Human History Tour shared basemap. GENERATED by scripts/build-basemap.py from
     Natural Earth (public domain) — do not hand-edit. Equirectangular degrees:
     x = lon + 180, y = 90 - lat. Use via <use href="world.svg#land">; place it with
     the transform printed by scripts/mapkit.py. Paths carry no fill/stroke so the
     <use> element's attributes inherit. -->
<defs>
<path id="land" vector-effect="non-scaling-stroke" d="{land_d}"/>
<path id="lakes" vector-effect="non-scaling-stroke" d="{lakes_d}"/>
<path id="rivers" fill="none" vector-effect="non-scaling-stroke" d="{rivers_d}"/>
<path id="deep" vector-effect="non-scaling-stroke" d="{deep_d}"/>
<g id="named-rivers" fill="none" vector-effect="non-scaling-stroke">
{chr(10).join(named)}
</g>
</defs>
</svg>
'''
    # vector-effect is not inherited, so stamp it onto the named rivers too
    svg = re.sub(r'<path id="r-', '<path vector-effect="non-scaling-stroke" id="r-', svg)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(svg)
    print(f"wrote {OUT}: {len(svg)/1024:.0f} KB "
          f"(land {len(land_d)//1024} KB, lakes {len(lakes_d)//1024} KB, rivers {len(rivers_d)//1024} KB, "
          f"deep {len(deep_d)//1024} KB, named rivers {len(named)})")


if __name__ == "__main__":
    main()
