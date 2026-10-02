import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { itemPrice, menuSections, type MenuItem } from "@/lib/dine-in";
import { useDineIn } from "./context";
import { field } from "./styles";

/** Height of the sticky tab bar above the search (see DineInPage). */
const TABS_HEIGHT = "top-[60px]";

export function MenuTab(props: { onPick: (item: MenuItem) => void }) {
  const { menu, money, ordersTaken } = useDineIn();
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const sections = useMemo(() => menuSections(menu), [menu]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, items: s.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [sections, query]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveKey(visible.target.getAttribute("data-section-key"));
      },
      { rootMargin: "-190px 0px -65% 0px", threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [filtered]);

  if (sections.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-sm text-muted-foreground">
        The menu isn't ready yet. Please ask a member of staff.
      </p>
    );
  }

  return (
    <div className="pb-8">
      <div
        className={cn(
          "sticky z-20 space-y-3 bg-background/95 px-4 pb-3 pt-1 backdrop-blur",
          TABS_HEIGHT,
        )}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the menu..."
            aria-label="Search the menu"
            className={cn(field, "h-12 bg-surface pl-12")}
          />
        </div>
        {filtered.length > 1 ? (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filtered.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() =>
                  sectionRefs.current[s.key]?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className={cn(
                  "h-9 shrink-0 rounded-lg border px-3.5 text-sm font-medium transition-colors",
                  activeKey === s.key
                    ? "border-info-line bg-info-soft text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          Nothing on the menu matches "{query}".
        </p>
      ) : null}

      {filtered.map((section) => (
        <section
          key={section.key}
          data-section-key={section.key}
          ref={(el) => {
            sectionRefs.current[section.key] = el;
          }}
          className="scroll-mt-[180px] px-4 pt-5"
        >
          <h2 className="text-[15px] font-semibold text-foreground/95">{section.name}</h2>
          {section.description ? (
            <p className="mt-0.5 text-[13px] text-muted-foreground">{section.description}</p>
          ) : null}
          <ul className="mt-2 space-y-1.5">
            {section.items.map((item) => {
              const price = itemPrice(item);
              const onSpecial = price < item.price;
              const soldOut = !item.is_available;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={soldOut || !ordersTaken}
                    onClick={() => props.onPick(item)}
                    className={cn(
                      "flex min-h-[68px] w-full items-center gap-3.5 rounded-xl border border-border bg-card p-2 pr-4 text-left transition-colors",
                      soldOut ? "opacity-50" : "hover:bg-surface/60 active:bg-surface",
                    )}
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        loading="lazy"
                        className="size-[52px] shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex size-[52px] shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                        <UtensilsCrossed className="size-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[16px] font-medium leading-tight">{item.name}</span>
                        {item.is_featured && !soldOut ? (
                          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                            Popular
                          </span>
                        ) : null}
                        {soldOut ? (
                          <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            Sold out
                          </span>
                        ) : null}
                      </div>
                      {item.description ? (
                        <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p
                        className={cn(
                          "text-[16px] font-medium",
                          onSpecial ? "text-primary" : "text-foreground",
                        )}
                      >
                        {money(price)}
                      </p>
                      {onSpecial ? (
                        <p className="text-xs text-muted-foreground line-through">
                          {money(item.price)}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="pt-10 text-center text-xs text-muted-foreground">Powered by Hearth</p>
    </div>
  );
}
