#!/usr/bin/env python3
"""Bake the 12 /d preview pages from the Oct 28, 2026 public Google scrape.

Nothing on the page is typed by hand. Re-run:

    python3 scripts/bake-preview-pages.py /path/to/dashboard-data

Kits 1–5 reviews come from walk-kit-v3/data/reviews.json (the sample recency.json
counts). Kits 6–12 reviews come from halfmile/tickets.json, except Antler and
PlebLab, which only have a listing in building-800-brazos.json.

Age lines follow the owner rules, not the "N yrs" strings in local_seo.json:
Texas records read "On Texas record since <Mon YYYY>"; website ages stay
"Est. 2005" and "Since 2021"; Lee's, Lucky Lizard, Antler, and Brazos are
"unclear" (Brazos's Jun 2021 permit is dropped because the street number differs).
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CT = ZoneInfo("America/Chicago")
REF = date(2026, 10, 28)
SEV = {1: 3.0, 2: 2.0, 3: 1.5, 4: 0.5}

# slug, walk-kit key, Google place id (mono_data / kit_v2 / recency / dashboard-mock)
PAGES = [
    ("lees-tailor", "1-lees-tailor", "ChIJj3oyW6e1RIYRi2l6b46OTME"),
    ("brazos-barbershop", "2-brazos-barbershop", "ChIJGy_IiCi1RIYR1yu7GQiwJ50"),
    ("wild-about-music", "3-wild-about-music", "ChIJb-aJ0Qm1RIYRlaPGsEQ2FBk"),
    ("lucky-lizard", "4-lucky-lizard", "ChIJpduvU6a1RIYR7OsAQa0VsJk"),
    ("sapori", "5-sapori", "ChIJp7tO_dy1RIYRW9_xLOG_ehs"),
    ("anas-mart", "6-anas-mart", "ChIJCUKHRae1RIYRnZkmnukUCY0"),
    ("antler-vc", "7-antler-vc", "ChIJN0jxIgC1RIYR_Z1uL-sbR44"),
    ("pleblab", "8-pleblab", "ChIJjY-oGla1RIYRPtgk7Fl4TPo"),
    ("blindside-tattoo", "9-blindside-tattoo", "ChIJ877Bgqe1RIYRrAUoBg8zMpg"),
    ("shop-24", "10-shop-24", "ChIJJRkLgqe1RIYRQvbDSMn4kok"),
    ("small-victory", "11-small-victory", "ChIJKakp4Am1RIYRB-4OSSKKrPo"),
    ("lone-star-souvenir", "12-lone-star-souvenir", "ChIJr3szW6a1RIYRkM7LRpnBIO0"),
]

# Printed age. Texas months are the dates local_seo.json actually cites.
AGE = {
    "lees-tailor": "unclear",
    "brazos-barbershop": "unclear",
    "wild-about-music": "On Texas record since Sep 1995",
    "lucky-lizard": "unclear",
    "sapori": "On Texas record since Jun 2023",
    "anas-mart": "On Texas record since May 2010",
    "antler-vc": "unclear",
    "pleblab": "Since 2021",
    "blindside-tattoo": "Est. 2005",
    "shop-24": "On Texas record since Sep 2000",
    "small-victory": "On Texas record since Nov 2015",
    "lone-star-souvenir": "On Texas record since Mar 2012",
}

# Peers panel only where the sample has enough same-category peers.
PEER_SLUGS = {
    "wild-about-music",
    "lucky-lizard",
    "anas-mart",
    "shop-24",
    "small-victory",
    "lone-star-souvenir",
}

KIT15 = {"lees-tailor", "brazos-barbershop", "wild-about-music", "lucky-lizard", "sapori"}
LISTING_ONLY = {"antler-vc", "pleblab"}


def load(path: Path):
    return json.loads(path.read_text())


def spaces(s: str) -> str:
    return s.replace("\u202f", " ").replace("\u00a0", " ").replace("\u2009", " ").strip()


def ct_day(iso: str) -> str:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(CT)
    return dt.date().isoformat()


def weight(stars: int, day: str) -> float:
    d = date.fromisoformat(day)
    days = (REF - d).days
    if days <= 365:
        mult = 1.5
    elif days <= 365 * 3:
        mult = 1.0
    else:
        mult = 0.6
    return SEV[stars] * mult


def wednesday(opening) -> str | None:
    if not opening:
        return None
    for row in opening:
        if row.get("day") == "Wednesday":
            return spaces(row["hours"])
    return None


def dist_of(raw: dict) -> dict:
    out = {
        "one": raw["oneStar"],
        "two": raw["twoStar"],
        "three": raw["threeStar"],
        "four": raw["fourStar"],
        "five": raw["fiveStar"],
    }
    return out


def peers_of(block: dict) -> dict:
    rows = [{"name": block["me"]["name"], "you": True, "rating": block["me"]["rating"], "reviews": block["me"]["reviews"], "awayM": None}]
    for p in block["peers"]:
        if p["reviews"] < 10:
            continue
        rows.append(
            {
                "name": p["name"],
                "you": False,
                "rating": p["rating"],
                "reviews": p["reviews"],
                "awayM": p["dist_m"],
            }
        )
    rows.sort(key=lambda r: (-r["rating"], -r["reviews"], r["name"]))
    return {"note": block["note"], "rows": rows}


def ticket_from_review(r: dict) -> dict:
    day = ct_day(r["publishedAtDate"])
    stars = r["stars"]
    text = r.get("text") or ""
    return {
        "stars": stars,
        "date": day,
        "text": text,
        "replied": bool(r.get("responseFromOwnerText")),
        "themes": [],
        "_w": weight(stars, day),
    }


def ticket_from_ticket(t: dict) -> dict:
    return {
        "stars": t["stars"],
        "date": t["date"],
        "text": t.get("text") or "",
        "replied": bool(t["owner_replied"]),
        "themes": list(t["themes"]),
        "_w": t["weight"],
    }


def bake(root: Path) -> dict:
    reviews = {it["placeId"]: it for it in load(root / "walk-kit-v3/data/reviews.json")["items"]}
    places = {p["place_id"]: p for p in load(root / "halfmile/places.json")["places"]}
    tickets = {b["place_id"]: b for b in load(root / "halfmile/tickets.json")["businesses"]}
    building = {b["place_id"]: b for b in load(root / "building-800-brazos.json")["businesses"]}
    recency = load(root / "walk-kit-v3/dated-v2/recency.json")
    local = load(root / "walk-kit-v3/dated-v2/local_seo.json")
    peers = load(root / "walk-kit-v3/peers/peers.json")

    pages = []
    for slug, key, pid in PAGES:
        assert recency[key] is None or recency[key]["pid"] == pid, (slug, pid)
        assert local[key]["listing"]
        seo = local[key]
        listing = seo["listing"]
        rec = recency[key]
        place = places.get(pid)
        bld = building.get(pid)

        if slug in KIT15:
            item = reviews[pid]
            assert item["placeId"] == pid
            assert item["reviewsCount"] == (place["review_count"] if place else item["reviewsCount"])
            lows = [ticket_from_review(r) for r in item["reviews"] if r.get("stars") is not None and r["stars"] < 5]
            source_reviews = "walk-kit-v3/data/reviews.json"
            read_n = len(item["reviews"])
            assert rec["n"] == read_n
            wed = wednesday(item.get("openingHours"))
            if place:
                assert wed == spaces(place["wed_hours"]), (slug, wed, place["wed_hours"])
            name = item["title"]
            categories = list(item["categories"])
            rating = item["totalScore"]
            review_count = item["reviewsCount"]
            maps = place["maps_url"] if place else None
            distribution = dist_of(place["reviews_distribution"]) if place else dist_of(
                {"oneStar": 0, "twoStar": 0, "threeStar": 0, "fourStar": 0, "fiveStar": 0}
            )
            # kits 1–5 are all in places.json
            assert place is not None
            distribution = dist_of(place["reviews_distribution"])
            non5 = place["non5_star"]
        elif slug in LISTING_ONLY:
            assert bld and bld["place_id"] == pid
            lows = []
            source_reviews = None
            read_n = None
            wed = spaces(bld["wednesday_hours"])
            name = bld["name"]
            categories = [bld["category"]]
            rating = bld["google_rating"]
            review_count = bld["review_count"]
            maps = bld["google_maps_url"]
            distribution = None
            non5 = None
            assert rec is None
        else:
            biz = tickets[pid]
            assert biz["place_id"] == pid
            assert place is not None
            lows = [ticket_from_ticket(t) for t in biz["tickets"]]
            assert len(lows) == biz["non5_in_sample"]
            assert biz["non5_total_google"] == place["non5_star"]
            source_reviews = "halfmile/tickets.json"
            read_n = biz["scraped_reviews"]
            assert rec["n"] == read_n
            wed = spaces(place["wed_hours"])
            name = biz["name"]
            categories = list(place["categories"])
            rating = place["rating"]
            review_count = place["review_count"]
            maps = place["maps_url"]
            distribution = dist_of(place["reviews_distribution"])
            non5 = place["non5_star"]

        lows.sort(key=lambda t: (t["_w"], t["date"]), reverse=True)
        for t in lows:
            assert t["stars"] < 5
            del t["_w"]

        if distribution is not None:
            assert sum(distribution.values()) == review_count, (slug, distribution, review_count)
            assert review_count - distribution["five"] == non5

        web_status = {
            "yes": "listed",
            "no": "not_listed",
            "X link only": "x_link_only",
            "not captured": "not_captured",
        }[listing["website"]]
        phone_status = {"yes": "listed", "no": "not_listed", "not captured": "not_captured"}[listing["phone"]]
        website = listing["website_raw"] if web_status in ("listed", "x_link_only") else None
        if website == "unknown":
            website = None
        if slug in LISTING_ONLY:
            phone = bld["phone"] if phone_status == "listed" else None
        elif place and place.get("phone"):
            phone = place["phone"] if phone_status == "listed" else None
        else:
            phone = None
        if phone_status != "listed":
            phone = None
        assert listing["hours"] == "yes" and wed, slug
        assert listing["address"]

        age = AGE[slug]
        # Brazos permit is in the file and must not be printed.
        if slug == "brazos-barbershop":
            assert seo["age"][0] == "5 yrs"
            assert age == "unclear"

        peer_block = None
        if slug in PEER_SLUGS:
            peer_block = peers_of(peers[key])
            assert peer_block["rows"][0]["you"] or any(r["you"] for r in peer_block["rows"])
            assert sum(1 for r in peer_block["rows"] if not r["you"]) >= 3, slug

        sample = None if read_n is None else {"read": read_n, "total": review_count, "full": bool(rec["full"]) if rec else read_n == review_count}

        rec_out = None
        if rec is not None:
            assert rec["total"] == review_count
            rec_out = {
                "newest": rec["newest"],
                "n90": rec["n90"],
                "complete90": rec["complete90"],
                "sun": rec["sun"],
                "read": rec["n"],
                "total": rec["total"],
            }

        pages.append(
            {
                "slug": slug,
                "kit": key,
                "placeId": pid,
                "name": name,
                "categories": categories,
                "address": listing["address"],
                "rating": rating,
                "reviewCount": review_count,
                "phone": phone,
                "phoneStatus": phone_status,
                "website": website,
                "websiteStatus": web_status,
                "wednesdayHours": wed,
                "ageLine": age,
                "mapsUrl": maps,
                "distribution": distribution,
                "non5Total": non5,
                "sample": sample,
                "tickets": lows,
                "recency": rec_out,
                "peers": peer_block,
                "sources": {
                    "listing": listing["src"],
                    "reviews": source_reviews,
                    "recency": "walk-kit-v3/dated-v2/recency.json" if rec_out else None,
                    "age": "walk-kit-v3/dated-v2/local_seo.json",
                    "peers": "walk-kit-v3/peers/peers.json" if peer_block else None,
                },
            }
        )

    sv = next(p for p in pages if p["slug"] == "small-victory")
    assert [r["name"] for r in sv["peers"]["rows"]] == [
        "Bar Grotta",
        "Upstairs at Caroline",
        "Small Victory",
        "Sans Bar",
        "The Rustic Tap",
        "Star Bar",
    ]
    assert sv["tickets"][0]["text"].startswith("Worst cocktails")
    assert sv["tickets"][0]["date"] == "2026-10-24"
    assert sv["non5Total"] == 98 and sv["reviewCount"] == 507 and sv["rating"] == 4.7
    assert sv["recency"]["n90"] == 12 and sv["recency"]["sun"] == "Oct 24, 2026 (2★)"
    assert len(sv["tickets"]) == 10 and all(not t["replied"] for t in sv["tickets"])

    return {
        "pulled": "2026-10-28",
        "note": "Baked by scripts/bake-preview-pages.py from the Oct 28, 2026 public Google scrape. Do not edit by hand.",
        "pages": pages,
    }


def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/dashboard-data")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / "src/data/preview-pages.json")
    data = bake(root)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    for p in data["pages"]:
        peers = f"peers {len(p['peers']['rows'])}" if p["peers"] else "no peers"
        tickets = len(p["tickets"])
        un = sum(1 for t in p["tickets"] if not t["replied"])
        print(f"  {p['slug']:22} {p['rating']}★ {p['reviewCount']:5}  under5 {p['non5Total']}  tickets {tickets} unans {un}  {peers}  age {p['ageLine']}")


if __name__ == "__main__":
    main()
