import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { itemPrice, menuSections, type MenuItem } from "@/lib/dine-in";
import { useDineIn } from "./context";

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
      { rootMargin: "-140px 0px -70% 0px", threshold: 0 },
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
      <div className="sticky top-0 z-20 space-y-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the menu"
            aria-label="Search the menu"
            className="h-11 rounded-xl pl-9"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filtered.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() =>
                sectionRefs.current[s.key]?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm transition-colors",
                activeKey === s.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
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
          className="scroll-mt-36 px-4 pt-6"
        >
          <h2 className="text-lg font-semibold">{section.name}</h2>
          {section.description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{section.description}</p>
          ) : null}
          <ul className="mt-3 space-y-2">
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
                      "flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-colors",
                      soldOut ? "opacity-50" : "active:bg-accent",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{item.name}</span>
                        {item.is_featured && !soldOut ? (
                          <Badge variant="secondary" className="text-[11px]">
                            Popular
                          </Badge>
                        ) : null}
                        {soldOut ? (
                          <Badge variant="outline" className="text-[11px]">
                            Sold out
                          </Badge>
                        ) : null}
                      </div>
                      {item.description ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm tabular-nums">
                        <span className="font-semibold">{money(price)}</span>
                        {onSpecial ? (
                          <span className="ml-2 text-muted-foreground line-through">
                            {money(item.price)}
                          </span>
                        ) : null}
                      </p>
                      {item.allergens.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {item.allergens.map((a) => (
                            <span
                              key={a}
                              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        loading="lazy"
                        className="size-[88px] shrink-0 rounded-xl object-cover"
                      />
                    ) : null}
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
