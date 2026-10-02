import { useMemo, useState } from "react";
import { Funnel, Plus, Search, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { itemPrice, menuSections, type MenuItem } from "@/lib/dine-in";
import { useDineIn } from "./context";
import { field } from "./styles";
import { MenuFilterSheet } from "./MenuFilterSheet";
import {
  NO_FILTERS,
  activeFilterCount,
  dietaryOptions,
  filterMenu,
  priceCeiling,
  type MenuFilters,
} from "./menu-filter";

/** Height of the sticky tab bar above the search (see DineInPage). */
const TABS_HEIGHT = "top-[60px]";

function MenuCard(props: {
  item: MenuItem;
  onPick: (item: MenuItem) => void;
  onAdd: (item: MenuItem) => void;
}) {
  const { money, ordersTaken } = useDineIn();
  const { item } = props;
  const price = itemPrice(item);
  const onSpecial = price < item.price;
  const soldOut = !item.is_available;
  return (
    <li
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card",
        soldOut && "opacity-55",
      )}
    >
      <button
        type="button"
        disabled={soldOut || !ordersTaken}
        onClick={() => props.onPick(item)}
        className="flex flex-1 flex-col text-left transition-colors enabled:active:bg-surface/60"
      >
        <span className="relative block aspect-[4/3] w-full bg-surface">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <UtensilsCrossed className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
          )}
        </span>
        <span className="flex flex-1 flex-col p-3">
          {item.is_featured || onSpecial || soldOut ? (
            <span className="mb-1.5 flex flex-wrap gap-1">
              {soldOut ? (
                <span className="rounded-md border border-input bg-surface px-1.5 py-px text-[11px] font-semibold text-muted-foreground">
                  Sold out
                </span>
              ) : null}
              {item.is_featured && !soldOut ? (
                <span className="rounded-md border border-primary/60 bg-primary/10 px-1.5 py-px text-[11px] font-semibold text-primary">
                  Popular
                </span>
              ) : null}
              {onSpecial && !soldOut ? (
                <span className="rounded-md border border-guest/50 bg-guest/10 px-1.5 py-px text-[11px] font-semibold text-guest">
                  Special
                </span>
              ) : null}
            </span>
          ) : null}
          <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{item.name}</span>
          {item.description ? (
            <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">
              {item.description}
            </span>
          ) : null}
          <span className="mt-auto flex min-h-9 flex-col justify-end pr-11 pt-2 tabular-nums">
            {onSpecial ? (
              <span className="text-xs text-muted-foreground line-through">
                {money(item.price)}
              </span>
            ) : null}
            <span
              className={cn(
                "text-[15px] font-semibold",
                onSpecial ? "text-primary" : "text-foreground",
              )}
            >
              {money(price)}
            </span>
          </span>
        </span>
      </button>
      {!soldOut ? (
        <button
          type="button"
          disabled={!ordersTaken}
          onClick={() => props.onAdd(item)}
          aria-label={`Add ${item.name}`}
          className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-lg border-2 border-primary text-primary transition-colors hover:bg-primary/10 active:bg-primary/20 disabled:opacity-40"
        >
          <Plus className="size-5" strokeWidth={2.5} />
        </button>
      ) : null}
    </li>
  );
}

export function MenuTab(props: {
  onPick: (item: MenuItem) => void;
  /** The + on a card: adds straight away, or opens options when it has some. */
  onAdd: (item: MenuItem) => void;
}) {
  const { menu, restaurant } = useDineIn();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<MenuFilters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const allSections = useMemo(() => menuSections(menu), [menu]);
  const items = useMemo(() => filterMenu(menu, filters, query), [menu, filters, query]);
  const ceiling = useMemo(() => priceCeiling(menu), [menu]);
  const dietary = useMemo(() => dietaryOptions(menu), [menu]);
  const rands = useMemo(() => {
    const f = new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: restaurant.currency || "ZAR",
      maximumFractionDigits: 0,
    });
    return (n: number) => f.format(n);
  }, [restaurant.currency]);
  const active = activeFilterCount(filters);

  if (allSections.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-sm text-muted-foreground">
        The menu isn't ready yet. Please ask a member of staff.
      </p>
    );
  }

  // A chip shows one category; tapping the one already shown goes back to All.
  const pickChip = (key: string | null) =>
    setFilters((f) => ({
      ...f,
      sections: key === null || (f.sections.length === 1 && f.sections[0] === key) ? [] : [key],
    }));

  return (
    <div className="pb-8">
      <div
        className={cn(
          "sticky z-20 space-y-3 bg-background/95 px-4 pb-3 pt-1 backdrop-blur",
          TABS_HEIGHT,
        )}
      >
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search menu items..."
              aria-label="Search the menu"
              className={cn(field, "h-12 bg-surface pl-12")}
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label={active > 0 ? `Filter, ${active} active` : "Filter"}
            className="relative flex size-12 shrink-0 items-center justify-center rounded-xl border border-input bg-surface text-foreground transition-colors hover:bg-surface/70"
          >
            <Funnel className="size-5" />
            {active > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground ring-2 ring-background">
                {active}
              </span>
            ) : null}
          </button>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ key: null, name: "All" }, ...allSections].map((s) => {
            const picked =
              s.key === null ? filters.sections.length === 0 : filters.sections.includes(s.key);
            return (
              <button
                key={s.key ?? "all"}
                type="button"
                aria-pressed={picked}
                onClick={() => pickChip(s.key)}
                className={cn(
                  "h-10 shrink-0 rounded-xl border px-4 text-sm font-medium transition-colors",
                  picked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-surface",
                )}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {active > 0 || query.trim() ? (
        <div className="flex items-center justify-between px-4 pb-1 pt-2 text-[13px] text-muted-foreground">
          <span>
            {items.length} dish{items.length === 1 ? "" : "es"}
          </span>
          <button
            type="button"
            className="font-semibold text-primary"
            onClick={() => {
              setFilters(NO_FILTERS);
              setQuery("");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          {query.trim()
            ? `Nothing on the menu matches "${query.trim()}".`
            : "Nothing matches your filters."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 px-4 pt-3">
          {items.map((item) => (
            <MenuCard key={item.id} item={item} onPick={props.onPick} onAdd={props.onAdd} />
          ))}
        </ul>
      )}

      <p className="pt-10 text-center text-xs text-muted-foreground">Powered by Hearth</p>

      <MenuFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onApply={setFilters}
        sections={allSections}
        ceiling={ceiling}
        dietary={dietary}
        rands={rands}
      />
    </div>
  );
}
