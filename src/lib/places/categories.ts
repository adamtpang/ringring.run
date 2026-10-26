// Category chips on /find and the OSM tags each one searches.

export interface Category {
  id: string;
  label: string;
  /** One OSM tag filter per entry, unioned in the Overpass query. */
  tags: [key: string, value: string][];
  /** Words that route a free-text request to this category (concierge keyword mode). */
  keywords: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: "restaurants",
    label: "Restaurants",
    tags: [["amenity", "restaurant"], ["amenity", "fast_food"]],
    keywords: ["restaurant", "restaurants", "food", "eat", "dinner", "lunch", "breakfast", "brunch", "pizza", "tacos", "taco", "burger", "burgers", "sushi", "bbq", "barbecue", "ramen", "thai", "mexican", "italian", "indian", "chinese", "hungry"],
  },
  {
    id: "cafes",
    label: "Cafes",
    tags: [["amenity", "cafe"]],
    keywords: ["cafe", "cafes", "coffee", "espresso", "latte", "tea", "bakery", "pastry"],
  },
  {
    id: "plumbers",
    label: "Plumbers",
    tags: [["craft", "plumber"], ["trade", "plumbing"], ["shop", "plumbing"]],
    keywords: ["plumber", "plumbers", "plumbing", "leak", "leaking", "pipe", "pipes", "toilet", "drain", "clog", "clogged", "faucet", "water heater"],
  },
  {
    id: "salons",
    label: "Salons",
    tags: [["shop", "hairdresser"], ["shop", "beauty"]],
    keywords: ["salon", "salons", "haircut", "hair", "barber", "nails", "manicure", "pedicure", "beauty", "blowout"],
  },
  {
    id: "auto-repair",
    label: "Auto repair",
    tags: [["shop", "car_repair"], ["shop", "tyres"]],
    keywords: ["mechanic", "auto", "car", "repair shop", "oil change", "brakes", "tire", "tires", "transmission", "garage"],
  },
  {
    id: "dentists",
    label: "Dentists",
    tags: [["amenity", "dentist"], ["healthcare", "dentist"]],
    keywords: ["dentist", "dentists", "dental", "tooth", "teeth", "toothache", "cleaning", "orthodontist"],
  },
];

export function categoryById(id: string | null | undefined): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** Which category a set of OSM tags belongs to, if any. */
export function categoryForTags(tags: Record<string, string>): Category | undefined {
  return CATEGORIES.find((c) => c.tags.some(([k, v]) => tags[k] === v));
}
