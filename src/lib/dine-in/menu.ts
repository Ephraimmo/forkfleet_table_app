// Dine-in data layer, part 2 of 3: the menu (live), item options (sizes,
// modifier groups, add-ons), cart lines and pricing. Pricing matches the
// console exactly: the waiter sees the same totals the guest saw.

import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import {
  DineInError,
  MAX_ITEMS_PER_ORDER,
  MAX_NOTE,
  MAX_QUANTITY,
  SERVICE_FEE_RATE,
  isMap,
  num,
  round2,
  str,
  strOrNull,
  toDineInError,
  type Raw,
} from "./core";

/* ==================================================================== menu */

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_available: boolean;
}

export interface ModifierChoiceConfig {
  selected: boolean;
  price: number;
}

/**
 * Dietary tags staff can put on an item, stored as `dietary_tags: string[]`
 * on the menu item ("vegetarian", "vegan", "gluten_free", "halal").
 */
export type DietaryTag = "vegetarian" | "vegan" | "gluten_free" | "halal";

export const DIETARY_TAGS: { id: DietaryTag; label: string }[] = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "gluten_free", label: "Gluten Free" },
  { id: "halal", label: "Halal" },
];

export interface MenuItem {
  id: string;
  category_id: string | null;
  /** Category name (older items only have this). */
  category: string;
  name: string;
  description: string | null;
  price: number;
  /** While set and lower than `price`, the item is on special at this price. */
  discount_price: number | null;
  image_url: string | null;
  allergens: string[];
  /** Empty until staff tag the item. */
  dietary_tags: DietaryTag[];
  is_available: boolean;
  is_featured: boolean;
  prep_time_minutes: number;
  modifier_ids: string[];
  /** Per-item choice overrides: modifier id -> choice index -> { selected, price }. */
  modifier_config: Record<string, Record<string, ModifierChoiceConfig>>;
}

/** A size / version of an item, e.g. "Large" +R20. */
export interface MenuVariant {
  id: string;
  menu_item_id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  is_available: boolean;
  sort_order: number;
}

/** A paid extra for one item, e.g. "Extra cheese" R15, up to max_quantity. */
export interface MenuAddon {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  max_quantity: number;
  is_available: boolean;
}

/** A shared choice group, e.g. "Cooking": Rare / Medium / Well done. */
export interface MenuModifier {
  id: string;
  name: string;
  type: "option" | "extra";
  required: boolean;
  include_pricing: boolean;
  min_selections: number;
  max_selections: number;
  choices: { label: string; price: number }[];
  sort_order: number;
  is_available: boolean;
}

export interface Menu {
  categories: MenuCategory[];
  items: MenuItem[];
  variants: MenuVariant[];
  addons: MenuAddon[];
  modifiers: MenuModifier[];
}

// Menu records come from two admin apps, so fields may be snake_case or camelCase.
const menuItemIdOf = (r: Raw) => str(r["menu_item_id"] ?? r["menuItemId"]);
const available = (r: Raw) =>
  r["is_available"] !== false && r["isAvailable"] !== false && r["available"] !== false;

function normalizeCategory(id: string, r: Raw): MenuCategory {
  return {
    id,
    name: str(r["name"]),
    description: strOrNull(r["description"]),
    sort_order: num(r["sort_order"]),
    is_available: r["is_available"] !== false,
  };
}

/** "Gluten-free", "gluten_free", "GlutenFree" → "gluten_free"; unknown tags are dropped. */
function dietaryTagsOf(raw: unknown): DietaryTag[] {
  if (!Array.isArray(raw)) return [];
  const known = new Map(DIETARY_TAGS.map((t) => [t.id.replace(/_/g, ""), t.id]));
  const tags = raw
    .filter((v: unknown): v is string => typeof v === "string")
    .map((v) => known.get(v.toLowerCase().replace(/[^a-z]/g, "")))
    .filter((t): t is DietaryTag => !!t);
  return [...new Set(tags)];
}

function normalizeItem(id: string, r: Raw): MenuItem {
  const discount = r["discount_price"] ?? r["discountPrice"];
  const ids = r["modifier_ids"] ?? r["modifierIds"];
  const cfg = r["modifier_config"] ?? r["modifierConfig"];
  const modifier_config: MenuItem["modifier_config"] = {};
  if (isMap(cfg)) {
    for (const [modId, choices] of Object.entries(cfg)) {
      if (!isMap(choices)) continue;
      const mapped: Record<string, ModifierChoiceConfig> = {};
      for (const [index, value] of Object.entries(choices)) {
        const v: Raw = isMap(value) ? value : {};
        mapped[index] = { selected: v["selected"] === true, price: num(v["price"]) };
      }
      modifier_config[modId] = mapped;
    }
  }
  const categoryId = r["category_id"] ?? r["categoryId"];
  return {
    id,
    category_id: categoryId != null && String(categoryId) !== "" ? String(categoryId) : null,
    category: str(r["category"]) || "General",
    name: str(r["name"]),
    description: strOrNull(r["description"]),
    price: num(r["price"]),
    discount_price: discount != null ? num(discount) : null,
    image_url: strOrNull(r["image_url"] ?? r["imageUrl"]),
    allergens: Array.isArray(r["allergens"])
      ? r["allergens"].filter((a: unknown): a is string => typeof a === "string")
      : [],
    dietary_tags: dietaryTagsOf(r["dietary_tags"] ?? r["dietaryTags"]),
    is_available: available(r),
    is_featured: r["is_featured"] === true || r["isFeatured"] === true,
    prep_time_minutes: num(r["prep_time_minutes"] ?? r["prepTime"]) || 15,
    modifier_ids: Array.isArray(ids)
      ? ids.filter((v: unknown): v is string => typeof v === "string" && v !== "")
      : [],
    modifier_config,
  };
}

function normalizeVariant(id: string, r: Raw): MenuVariant {
  return {
    id,
    menu_item_id: menuItemIdOf(r),
    name: str(r["name"]),
    price_delta: num(r["price_delta"] ?? r["priceDelta"]),
    is_default: r["is_default"] === true || r["isDefault"] === true,
    is_available: available(r),
    sort_order: num(r["sort_order"] ?? r["sortOrder"]),
  };
}

function normalizeAddon(id: string, r: Raw): MenuAddon {
  return {
    id,
    menu_item_id: menuItemIdOf(r),
    name: str(r["name"]),
    price: num(r["price"]),
    max_quantity: Math.max(1, num(r["max_quantity"] ?? r["maxQuantity"] ?? 3) || 3),
    is_available: available(r),
  };
}

function normalizeModifier(id: string, r: Raw): MenuModifier {
  const type = r["type"] === "extra" ? "extra" : "option";
  return {
    id,
    name: str(r["name"]),
    type,
    required: r["required"] === true,
    include_pricing: r["include_pricing"] === true || r["includePricing"] === true,
    min_selections: num(r["min_selections"] ?? r["minSelections"] ?? (type === "option" ? 1 : 0)),
    max_selections: num(r["max_selections"] ?? r["maxSelections"] ?? (type === "option" ? 1 : 3)),
    choices: (Array.isArray(r["choices"]) ? r["choices"] : []).map((c: unknown) => {
      const row: Raw = isMap(c) ? c : {};
      return { label: str(row["label"]), price: num(row["price"]) };
    }),
    sort_order: num(r["sort_order"] ?? r["sortOrder"]),
    is_available: available(r),
  };
}

const MENU_PARTS = ["categories", "items", "variants", "addons", "modifiers"] as const;
type MenuPart = (typeof MENU_PARTS)[number];

/**
 * The restaurant's menu, live: price and availability changes made in the
 * console show up without a reload. Calls back once all five parts have
 * loaded, then on every change.
 */
export function watchMenu(
  restaurantId: string,
  onChange: (menu: Menu) => void,
  onError: (e: DineInError) => void,
): () => void {
  const loaded: Partial<Record<MenuPart, Raw[]>> = {};
  const emit = () => {
    const [categories, items, variants, addons, modifiers] = MENU_PARTS.map((p) => loaded[p]);
    if (!categories || !items || !variants || !addons || !modifiers) return;
    onChange({
      categories: categories
        .map((r) => normalizeCategory(r["__id"], r))
        .sort((a, b) => a.sort_order - b.sort_order),
      items: items.map((r) => normalizeItem(r["__id"], r)),
      variants: variants.map((r) => normalizeVariant(r["__id"], r)),
      addons: addons.map((r) => normalizeAddon(r["__id"], r)),
      modifiers: modifiers
        .map((r) => normalizeModifier(r["__id"], r))
        .sort((a, b) => a.sort_order - b.sort_order),
    });
  };
  const unsubs = MENU_PARTS.map((part) =>
    onSnapshot(
      collection(db, "menus", restaurantId, part),
      (snap) => {
        loaded[part] = snap.docs
          .filter((d) => d.id !== "_")
          .map((d) => ({ ...d.data(), __id: d.id }));
        emit();
      },
      (e) => onError(toDineInError(e)),
    ),
  );
  return () => unsubs.forEach((u) => u());
}

export interface MenuSection {
  key: string;
  name: string;
  description: string | null;
  /** Includes sold-out items (is_available false): show them greyed out, not orderable. */
  items: MenuItem[];
}

/** The menu grouped by category, in the restaurant's category order. Hidden categories are left out. */
export function menuSections(menu: Menu): MenuSection[] {
  const categories = new Map(menu.categories.map((c, rank) => [c.id, { ...c, rank }]));
  const sections = new Map<string, MenuSection & { rank: number }>();
  for (const item of menu.items) {
    if (!item.name) continue;
    const category = item.category_id ? categories.get(item.category_id) : undefined;
    if (category && !category.is_available) continue;
    const key = category ? category.id : `name:${item.category}`;
    const section = sections.get(key) ?? {
      key,
      name: category?.name || item.category || "Menu",
      description: category?.description ?? null,
      rank: category ? category.rank : 999,
      items: [],
    };
    section.items.push(item);
    sections.set(key, section);
  }
  return [...sections.values()]
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map((s) => ({
      key: s.key,
      name: s.name,
      description: s.description,
      items: s.items.sort(
        (a, b) => Number(b.is_featured) - Number(a.is_featured) || a.name.localeCompare(b.name),
      ),
    }));
}

/** What one of an item costs: its special price while it has one, else its price. */
export function itemPrice(item: Pick<MenuItem, "price" | "discount_price">): number {
  const price = num(item.price);
  const discount = item.discount_price == null ? NaN : Number(item.discount_price);
  return round2(Number.isFinite(discount) && discount >= 0 && discount < price ? discount : price);
}

export interface ModifierChoiceOption {
  index: number;
  label: string;
  price: number;
}

export interface ModifierGroupOptions {
  group: MenuModifier;
  choices: ModifierChoiceOption[];
  /** Fewest choices the guest must pick (0 = optional). */
  min: number;
  /** Most choices the guest may pick; 1 = pick one (radio buttons). */
  max: number;
}

export interface ItemOptions {
  /** Sizes: pick exactly one when there are any. */
  variants: MenuVariant[];
  /** Extras with a quantity stepper (0..max_quantity). */
  addons: MenuAddon[];
  modifiers: ModifierGroupOptions[];
}

function maxChoices(group: Pick<MenuModifier, "max_selections">): number {
  return Math.max(1, Math.floor(num(group.max_selections) || 1));
}

/**
 * What the guest can choose for an item. A modifier group offers the choices
 * ticked for this item in the console (all of them when none are ticked), at
 * the item's price for that choice when the group is priced.
 */
export function itemOptions(menu: Menu, item: MenuItem): ItemOptions {
  const ids = new Set(item.modifier_ids);
  return {
    variants: menu.variants
      .filter((v) => v.menu_item_id === item.id && v.is_available)
      .sort((a, b) => a.sort_order - b.sort_order),
    addons: menu.addons.filter((a) => a.menu_item_id === item.id && a.is_available),
    modifiers: menu.modifiers
      .filter((group) => ids.has(group.id) && group.is_available)
      .map((group) => {
        const config = item.modifier_config[group.id] ?? {};
        const configured = Object.values(config).some((c) => c.selected);
        const choices = group.choices
          .map((choice, index) => ({ choice, index, cfg: config[String(index)] }))
          .filter(({ cfg }) => !configured || cfg?.selected === true)
          .map(({ choice, index, cfg }) => ({
            index,
            label: choice.label,
            price: group.include_pricing ? round2(num(cfg?.price ?? choice.price)) : 0,
          }));
        const max = maxChoices(group);
        const min = group.required
          ? Math.min(Math.max(1, Math.floor(num(group.min_selections))), max, choices.length)
          : 0;
        return { group, choices, min, max };
      })
      .filter((m) => m.choices.length > 0),
  };
}

/* ============================================================== cart lines */

export interface OrderLineVariant {
  id: string;
  name: string;
  price_delta: number;
}

/**
 * An extra on a line. A modifier choice has id "mod:{modifierId}:{choiceIndex}"
 * and name "{Group}: {Choice}" (e.g. "Cooking: Medium"), and its quantity
 * follows the line's. A plain add-on keeps its own id and quantity.
 */
export interface OrderLineAddon {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

/** One line in the guest's cart, exactly as it is sent. */
export interface CartItem {
  item_id: string;
  name: string;
  quantity: number;
  /** The item's price (its special price when on special), without size or extras. */
  unit_price: number;
  notes: string | null;
  variant: OrderLineVariant | null;
  addons: OrderLineAddon[];
}

const MODIFIER_ADDON = /^mod:([^:]+):(\d+)$/;

export function modifierAddonId(modifierId: string, choiceIndex: number): string {
  return `mod:${modifierId}:${choiceIndex}`;
}

function modifierIdOf(addon: Pick<OrderLineAddon, "id">): string | null {
  return MODIFIER_ADDON.exec(addon.id)?.[1] ?? null;
}

/** A new cart line for an item: quantity 1, its default size, nothing else picked. */
export function newCartItem(menu: Menu, item: MenuItem): CartItem {
  const sizes = itemOptions(menu, item).variants;
  const size = sizes.find((v) => v.is_default) ?? sizes[0];
  return {
    item_id: item.id,
    name: item.name,
    quantity: 1,
    unit_price: itemPrice(item),
    notes: null,
    variant: size ? { id: size.id, name: size.name, price_delta: size.price_delta } : null,
    addons: [],
  };
}

export function withVariant(line: CartItem, variant: MenuVariant): CartItem {
  return {
    ...line,
    variant: { id: variant.id, name: variant.name, price_delta: variant.price_delta },
  };
}

/**
 * Pick or unpick a modifier choice. In a pick-one group a new pick replaces
 * the old one; a group already at its maximum ignores further picks.
 */
export function toggleChoice(
  line: CartItem,
  group: Pick<MenuModifier, "id" | "name" | "max_selections">,
  choice: ModifierChoiceOption,
): CartItem {
  const id = modifierAddonId(group.id, choice.index);
  if (line.addons.some((a) => a.id === id)) {
    return { ...line, addons: line.addons.filter((a) => a.id !== id) };
  }
  const inGroup = (a: OrderLineAddon) => modifierIdOf(a) === group.id;
  const max = maxChoices(group);
  let addons = line.addons;
  if (max === 1) addons = addons.filter((a) => !inGroup(a));
  else if (addons.filter(inGroup).length >= max) return line;
  return {
    ...line,
    addons: [
      ...addons,
      { id, name: `${group.name}: ${choice.label}`, price: choice.price, quantity: line.quantity },
    ],
  };
}

export function isChoicePicked(line: CartItem, groupId: string, choiceIndex: number): boolean {
  return line.addons.some((a) => a.id === modifierAddonId(groupId, choiceIndex));
}

/** Set how many of a plain add-on the line has (0 removes it). */
export function setAddonQuantity(line: CartItem, addon: MenuAddon, quantity: number): CartItem {
  const qty = Math.max(0, Math.min(addon.max_quantity, Math.floor(quantity)));
  const rest = line.addons.filter((a) => a.id !== addon.id);
  if (qty === 0) return { ...line, addons: rest };
  const next = { id: addon.id, name: addon.name, price: round2(addon.price), quantity: qty };
  const at = line.addons.findIndex((a) => a.id === addon.id);
  return {
    ...line,
    addons:
      at === -1 ? [...line.addons, next] : line.addons.map((a) => (a.id === addon.id ? next : a)),
  };
}

export function addonQuantity(line: CartItem, addonId: string): number {
  return line.addons.find((a) => a.id === addonId)?.quantity ?? 0;
}

/** Change the line's quantity (1..99); its modifier choices follow it. */
export function withQuantity(line: CartItem, quantity: number): CartItem {
  const qty = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(quantity)));
  return {
    ...line,
    quantity: qty,
    addons: line.addons.map((a) => (modifierIdOf(a) ? { ...a, quantity: qty } : a)),
  };
}

/** Required groups the guest hasn't picked enough from yet. Empty = ready to add. */
export function missingChoices(options: ItemOptions, line: CartItem): ModifierGroupOptions[] {
  return options.modifiers.filter(
    (m) => m.min > 0 && line.addons.filter((a) => modifierIdOf(a) === m.group.id).length < m.min,
  );
}

/** Line total: unit_price × qty + Σ(addon.price × addon.qty) + size delta × qty. */
export function lineTotal(
  line: Pick<CartItem, "unit_price" | "quantity" | "variant" | "addons">,
): number {
  const addons = (line.addons ?? []).reduce((sum, a) => sum + a.price * a.quantity, 0);
  const sizeDelta = (line.variant?.price_delta ?? 0) * line.quantity;
  return round2(line.unit_price * line.quantity + addons + sizeDelta);
}

export interface Totals {
  subtotal: number;
  /** 5% of the subtotal. */
  service_fee: number;
  total: number;
}

export function priceLines(
  lines: { line_total: number }[],
  extras: { delivery_fee: number; tax: number; tip: number; discount: number } = {
    delivery_fee: 0,
    tax: 0,
    tip: 0,
    discount: 0,
  },
): Totals {
  const subtotal = round2(lines.reduce((sum, l) => sum + (Number(l.line_total) || 0), 0));
  const service_fee = round2(subtotal * SERVICE_FEE_RATE);
  const total = round2(
    subtotal + extras.delivery_fee + service_fee + extras.tax + extras.tip - extras.discount,
  );
  return { subtotal, service_fee, total };
}

/** Totals for the cart before it's sent. */
export function cartTotals(cart: CartItem[]): Totals {
  return priceLines(cart.map((l) => ({ line_total: lineTotal(l) })));
}

/** A line's size and extras as short labels: ["Large", "Cooking: Rare", "Extra cheese ×2"]. */
export function describeLineOptions(line: {
  variant?: OrderLineVariant | null;
  addons?: OrderLineAddon[] | null;
}): string[] {
  return [
    ...(line.variant?.name ? [line.variant.name] : []),
    ...(line.addons ?? []).map((a) =>
      modifierIdOf(a) || a.quantity <= 1 ? a.name : `${a.name} ×${a.quantity}`,
    ),
  ];
}

/** Check a cart before it's sent (placeOrder does this for you). */
export function validateItems(items: CartItem[]): CartItem[] {
  const bad = (message: string) => new DineInError("dine-in/invalid-items", message);
  if (!Array.isArray(items) || items.length === 0) {
    throw bad("Add at least one item to your order.");
  }
  if (items.length > MAX_ITEMS_PER_ORDER) {
    throw bad(`You can send at most ${MAX_ITEMS_PER_ORDER} items at a time.`);
  }
  return items.map((item) => {
    const name = str(item.name);
    if (!name || name.length > 120) throw bad("Every item needs a name.");
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      throw bad(`Quantity for ${name} must be 1–${MAX_QUANTITY}.`);
    }
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) {
      throw bad(`${name} has an invalid price.`);
    }
    if (item.variant && !Number.isFinite(item.variant.price_delta)) {
      throw bad(`${name} has an invalid size.`);
    }
    for (const addon of item.addons ?? []) {
      if (
        !Number.isFinite(addon.price) ||
        addon.price < 0 ||
        !Number.isInteger(addon.quantity) ||
        addon.quantity < 1
      ) {
        throw bad(`${name} has an invalid extra.`);
      }
    }
    return {
      item_id: str(item.item_id),
      name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      notes: str(item.notes).slice(0, MAX_NOTE) || null,
      variant: item.variant ?? null,
      addons: item.addons ?? [],
    };
  });
}
