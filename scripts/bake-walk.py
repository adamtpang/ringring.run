#!/usr/bin/env python3
"""Bake the founder walk list from the Oct 28, 2026 half-mile scrape.

    python3 scripts/bake-walk.py /path/to/uploads

Reads places.json, RANKED.md, tickets.json, and the existing preview-pages
place ids. Copies rag.json to src/data/owner-rag.json unchanged.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D_SLUGS = {
    "ChIJj3oyW6e1RIYRi2l6b46OTME": "lees-tailor",
    "ChIJGy_IiCi1RIYR1yu7GQiwJ50": "brazos-barbershop",
    "ChIJb-aJ0Qm1RIYRlaPGsEQ2FBk": "wild-about-music",
    "ChIJpduvU6a1RIYR7OsAQa0VsJk": "lucky-lizard",
    "ChIJp7tO_dy1RIYRW9_xLOG_ehs": "sapori",
    "ChIJCUKHRae1RIYRnZkmnukUCY0": "anas-mart",
    "ChIJN0jxIgC1RIYR_Z1uL-sbR44": "antler-vc",
    "ChIJjY-oGla1RIYRPtgk7Fl4TPo": "pleblab",
    "ChIJ877Bgqe1RIYRrAUoBg8zMpg": "blindside-tattoo",
    "ChIJJRkLgqe1RIYRQvbDSMn4kok": "shop-24",
    "ChIJKakp4Am1RIYRB-4OSSKKrPo": "small-victory",
    "ChIJr3szW6a1RIYRkM7LRpnBIO0": "lone-star-souvenir",
}
# In the building, missing from the 130-place list. Pin at the scrape origin.
BUILDING_EXTRA = {"ChIJN0jxIgC1RIYR_Z1uL-sbR44", "ChIJjY-oGla1RIYRPtgk7Fl4TPo"}


def spaces(s: str | None) -> str | None:
    if not s:
        return None
    return s.replace("\u202f", " ").replace("\u00a0", " ").replace("\u2009", " ").replace("\u2014", ", ").replace("\u2013", "-").strip()


def slugify(name: str) -> str:
    s = name.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:48] or "place"


def why_by_place(md: str) -> dict[str, str]:
    out = {}
    for line in md.splitlines():
        if "query_place_id=" not in line or not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 12 or cells[0] == "#":
            continue
        m = re.search(r"query_place_id=([A-Za-z0-9_-]+)", cells[2])
        if not m:
            continue
        why = cells[-1].replace("**", "")
        why = why.replace("\u2013", "-").replace("\u2192", ":")
        out[m.group(1)] = why
    return out


def problems_for(tickets_by_pid: dict, pid: str, rag: dict, kit: str | None) -> list[dict]:
    biz = tickets_by_pid.get(pid)
    if biz and biz.get("problems"):
        rows = sorted(biz["problems"], key=lambda p: -p.get("priority", 0))
        return [{"label": p["label"], "detail": f"{p['count']} in the reviews we read"} for p in rows[:3]]
    if kit and isinstance(rag.get(kit), list):
        return [{"label": i["label"], "detail": i["value"]} for i in rag[kit] if i["section"] == "improve"][:3]
    return []


def facts(p: dict) -> list[str]:
    bits = []
    if p.get("open_after_630pm_tonight") is True:
        bits.append("Listed open after 6:30 PM Wednesday")
    elif p.get("open_after_630pm_tonight") is False:
        bits.append("Listed closed by 6:30 PM Wednesday")
    if p.get("walk_min_est") is not None:
        bits.append(f"{p['walk_min_est']} min walk estimate from 800 Brazos")
    if p.get("rating") is not None and p.get("review_count") is not None:
        bits.append(f"{p['rating']} from {p['review_count']} Google reviews")
    if p.get("non5_star") is not None:
        bits.append(f"{p['non5_star']} reviews under 5 stars")
    if not p.get("has_website"):
        bits.append("No website on the listing")
    if not p.get("phone"):
        bits.append("No phone on the listing")
    return bits[:4]


def main() -> None:
    src = Path(sys.argv[1])
    places = json.loads((src / "places_0f15.json").read_text())
    ranked = (src / "RANKED_e782.md").read_text()
    tickets = json.loads((src / "tickets_31fb.json").read_text())
    rag = json.loads((src / "rag_b3c2.json").read_text())
    why = why_by_place(ranked)
    t_by = {b["place_id"]: b for b in tickets["businesses"]}
    kit_by_pid = {pid: slug for pid, slug in D_SLUGS.items()}
    # kit key from preview file
    preview = json.loads((ROOT / "src/data/preview-pages.json").read_text())
    kit_of = {p["placeId"]: p["kit"] for p in preview["pages"]}

    used: dict[str, str] = {}
    rows = []

    def take_slug(pid: str, name: str) -> str:
        if pid in D_SLUGS:
            s = D_SLUGS[pid]
        else:
            s = slugify(name)
            if s in used and used[s] != pid:
                s = f"{s}-{pid[-4:].lower()}"
        used[s] = pid
        return s

    def add(row: dict) -> None:
        rows.append(row)

    for p in places["places"]:
        pid = p["place_id"]
        phone = spaces(p.get("phone")) or None
        web = p.get("website") or None
        add(
            {
                "placeId": pid,
                "slug": take_slug(pid, p["name"]),
                "dSlug": D_SLUGS.get(pid),
                "name": p["name"],
                "category": p.get("category") or (p.get("categories") or ["Unknown"])[0],
                "address": p.get("address"),
                "lat": p["lat"],
                "lng": p["lng"],
                "pinNote": None,
                "rating": p.get("rating"),
                "reviewCount": p.get("review_count"),
                "tier": p.get("tier"),
                "score": p.get("score"),
                "wedHours": spaces(p.get("wed_hours")),
                "openAfter630": p.get("open_after_630pm_tonight") if isinstance(p.get("open_after_630pm_tonight"), bool) else None,
                "closesAt": spaces(p.get("closes_at")),
                "phone": phone,
                "website": web,
                "walkMinEst": p.get("walk_min_est"),
                "why": why.get(pid) or "; ".join(facts(p)),
                "problems": problems_for(t_by, pid, rag, kit_of.get(pid)),
                "mapsUrl": p.get("maps_url"),
            }
        )

    origin = places["origin"]
    by_pid = {b["place_id"]: b for b in places["building_800_brazos"]["businesses"]}
    for pid in BUILDING_EXTRA:
        b = by_pid[pid]
        phone = b.get("phone")
        if not phone or phone == "unknown":
            phone = None
        web = b.get("website")
        if not web or web == "unknown":
            web = None
        add(
            {
                "placeId": pid,
                "slug": take_slug(pid, b["name"]),
                "dSlug": D_SLUGS.get(pid),
                "name": b["name"],
                "category": b.get("category") or "Corporate office",
                "address": b.get("address"),
                "lat": origin["lat"],
                "lng": origin["lng"],
                "pinNote": "Pinned at 800 Brazos St. This listing had no coordinates in the half-mile file.",
                "rating": b.get("google_rating") if isinstance(b.get("google_rating"), (int, float)) else None,
                "reviewCount": b.get("review_count") if isinstance(b.get("review_count"), int) else None,
                "tier": "C",
                "score": None,
                "wedHours": spaces(b.get("wednesday_hours")),
                "openAfter630": None,
                "closesAt": None,
                "phone": phone,
                "website": web,
                "walkMinEst": 0,
                "why": "Not in the half-mile rank. Google category is an office.",
                "problems": problems_for(t_by, pid, rag, kit_of.get(pid)),
                "mapsUrl": b.get("google_maps_url"),
            }
        )

    slugs = [r["slug"] for r in rows]
    assert len(slugs) == len(set(slugs)), "slug collision"
    assert all(r["lat"] and r["lng"] for r in rows)
    assert sum(1 for r in rows if r["dSlug"]) == 12

    out = {
        "pulled": "2026-10-28",
        "origin": {"lat": origin["lat"], "lng": origin["lng"], "label": "800 Brazos St, Austin"},
        "fallback": {"lat": 30.2704, "lng": -97.7437, "label": "800 Brazos St, Austin"},
        "fitRule": "Fit color is the Oct 28 rank tier: S green, A amber, B and C red. C means closed by 6:30 PM Wednesday, a chain, or an excluded category.",
        "places": rows,
    }
    dest = ROOT / "src/data/walk.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "src/data/owner-rag.json").write_text(json.dumps(rag, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {dest} places={len(rows)} bytes={dest.stat().st_size}")


if __name__ == "__main__":
    main()
