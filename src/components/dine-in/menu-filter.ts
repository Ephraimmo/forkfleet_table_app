// What the guest narrowed the menu to on the Filter screen, and how the
// menu is cut down and ordered to match.

import {
  DIETARY_TAGS,
  itemPrice,
  menuSections,
  type DietaryTag,
  type Menu,
  type MenuItem,
} from "@/lib/dine-in";

export type MenuSort = "popular" | "price_asc" | "price_desc" | "name";

export const MENU_SORTS: { id: MenuSort; label: string }[] = [
  { id: "popular", label: "Most Popular" },
  { id: "price_asc", label: "Price: Low to High" },
  { id: "price_desc", label: "Price: High to Low" },
  { id: "name", label: "Name (A-Z)" },
];

export interface MenuFilters {
  /** Menu section keys (see menuSections); empty means every category. */
  sections: string[];
  /** null: no bound. */
  min_price: number | null;
  max_price: number | null;
  /** The item must carry every one of these. */
  dietary: DietaryTag[];
  /** Neither or both ticked: show everything. */
  in_stock: boolean;
  out_of_stock: boolean;
  sort: MenuSort;
}

export const NO_FILTERS: MenuFilters = {
  sections: [],
  min_price: null,
  max_price: null,
  dietary: [],
  in_stock: false,
  out_of_stock: false,
  sort: "popular",
};

/** The number on the filter button and on "Apply Filters (2)". */
export function activeFilterCount(f: MenuFilters): number {
  return (
    f.sections.length +
    (f.min_price !== null || f.max_price !== null ? 1 : 0) +
    f.dietary.length +
    (f.in_stock ? 1 : 0) +
    (f.out_of_stock ? 1 : 0) +
    (f.sort !== "popular" ? 1 : 0)
  );
}

/** Top of the price slider: the dearest item, rounded up to the next R50. */
export function priceCeiling(menu: Menu): number {
  const top = Math.max(0, ...menu.items.map((i) => itemPrice(i)));
  return Math.max(50, Math.ceil(top / 50) * 50);
}

/** Vegan dishes count as vegetarian too. */
function hasDiet(item: MenuItem, tag: DietaryTag): boolean {
  if (tag === "vegetarian") {
    return item.dietary_tags.includes("vegetarian") || item.dietary_tags.includes("vegan");
  }
  return item.dietary_tags.includes(tag);
}

/** Only offer the dietary filters some item on this menu is tagged with. */
export function dietaryOptions(menu: Menu): typeof DIETARY_TAGS {
  return DIETARY_TAGS.filter((t) => menu.items.some((i) => hasDiet(i, t.id)));
}

function matches(item: MenuItem, f: MenuFilters, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (
    q &&
    !item.name.toLowerCase().includes(q) &&
    !(item.description ?? "").toLowerCase().includes(q)
  ) {
    return false;
  }
  const price = itemPrice(item);
  if (f.min_price !== null && price < f.min_price) return false;
  if (f.max_price !== null && price > f.max_price) return false;
  if (!f.dietary.every((t) => hasDiet(item, t))) return false;
  if (f.in_stock && !f.out_of_stock && !item.is_available) return false;
  if (f.out_of_stock && !f.in_stock && item.is_available) return false;
  return true;
}

/**
 * The dishes to show, in one grid: menu (category) order, with "Most Popular"
 * lifting featured dishes to the top, or sorted by price or name.
 */
export function filterMenu(menu: Menu, f: MenuFilters, query: string): MenuItem[] {
  const items = menuSections(menu)
    .filter((s) => f.sections.length === 0 || f.sections.includes(s.key))
    .flatMap((s) => s.items)
    .filter((i) => matches(i, f, query));
  const order: Record<MenuSort, (a: MenuItem, b: MenuItem) => number> = {
    popular: (a, b) => Number(b.is_featured) - Number(a.is_featured),
    price_asc: (a, b) => itemPrice(a) - itemPrice(b) || a.name.localeCompare(b.name),
    price_desc: (a, b) => itemPrice(b) - itemPrice(a) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  // Array sort is stable, so equal dishes keep their menu order.
  return items.sort(order[f.sort]);
}
