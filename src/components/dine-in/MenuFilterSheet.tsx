import { useState, type ReactNode } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  ArrowRightLeft,
  Check,
  ChevronUp,
  Clock,
  Funnel,
  LayoutGrid,
  Leaf,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DIETARY_TAGS, DietaryTag } from "@/lib/dine-in";
import { Panel } from "./ui";
import { btn, card } from "./styles";
import { MENU_SORTS, NO_FILTERS, activeFilterCount, type MenuFilters } from "./menu-filter";

function Section(props: {
  icon: ReactNode;
  title: string;
  /** Right of the title, e.g. "Select all". Without it the section folds. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const foldable = !props.action;
  return (
    <section className={cn(card, "p-4")}>
      <div className="flex items-center gap-3">
        <span className="text-foreground [&_svg]:size-5">{props.icon}</span>
        <h3 className="flex-1 text-[16px] font-semibold">{props.title}</h3>
        {props.action}
        {foldable ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? `Hide ${props.title}` : `Show ${props.title}`}
            className="-mr-1.5 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <ChevronUp className={cn("size-5 transition-transform", !open && "rotate-180")} />
          </button>
        ) : null}
      </div>
      {open ? <div className="mt-3.5">{props.children}</div> : null}
    </section>
  );
}

function CheckRow(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      onClick={() => props.onChange(!props.checked)}
      className={cn(
        "flex h-12 items-center gap-3 rounded-xl border px-3.5 text-left text-[15px] transition-colors",
        props.checked
          ? "border-primary/60 bg-primary/10"
          : "border-border bg-field/50 hover:bg-surface",
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-[5px] border-2",
          props.checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {props.checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      {props.label}
    </button>
  );
}

function CategoryChip(props: { picked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={props.picked}
      onClick={props.onClick}
      className={cn(
        "flex min-h-12 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors",
        props.picked
          ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_20px_-12px_var(--primary)]"
          : "border-border bg-field/50 text-foreground hover:bg-surface",
      )}
    >
      {!props.picked ? (
        <span className="size-4 shrink-0 rounded-full border-2 border-input" />
      ) : null}
      <span className="min-w-0 flex-1 break-words leading-tight">{props.label}</span>
      {props.picked ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/90 text-primary">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

export function MenuFilterSheet(props: {
  open: boolean;
  onClose: () => void;
  value: MenuFilters;
  onApply: (filters: MenuFilters) => void;
  sections: { key: string; name: string }[];
  ceiling: number;
  dietary: typeof DIETARY_TAGS;
  /** Whole rands: "R 300". */
  rands: (amount: number) => string;
}) {
  const [draft, setDraft] = useState(props.value);
  const [wasOpen, setWasOpen] = useState(props.open);
  // Start from what's applied each time the sheet opens.
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setDraft(props.value);
  }

  const set = (patch: Partial<MenuFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleSection = (key: string) => {
    const has = draft.sections.includes(key);
    const next = has ? draft.sections.filter((k) => k !== key) : [...draft.sections, key];
    // Every category ticked is the same as "All".
    set({ sections: next.length === props.sections.length ? [] : next });
  };
  const toggleDiet = (tag: DietaryTag, on: boolean) =>
    set({ dietary: on ? [...draft.dietary, tag] : draft.dietary.filter((t) => t !== tag) });

  const step = props.ceiling > 500 ? 50 : 10;
  const lo = draft.min_price ?? 0;
  const hi = draft.max_price ?? props.ceiling;
  const count = activeFilterCount(draft);

  return (
    <Panel
      open={props.open}
      onClose={props.onClose}
      title="Filter"
      sheet
      action={
        <button
          type="button"
          onClick={() => setDraft(NO_FILTERS)}
          className="text-[16px] font-semibold text-primary"
        >
          Reset
        </button>
      }
      footer={
        <div className="space-y-1">
          <button
            type="button"
            className={cn(btn.primary, "h-[52px] w-full text-base")}
            onClick={() => {
              props.onApply(draft);
              props.onClose();
            }}
          >
            <Funnel /> Apply Filters{count > 0 ? ` (${count})` : ""}
          </button>
          <button
            type="button"
            className="h-11 w-full text-[15px] font-medium text-muted-foreground hover:text-foreground"
            onClick={() => {
              props.onApply(NO_FILTERS);
              props.onClose();
            }}
          >
            Clear all
          </button>
        </div>
      }
    >
      <div className="space-y-3 pt-1">
        <Section
          icon={<LayoutGrid />}
          title="Categories"
          action={
            <button
              type="button"
              onClick={() => set({ sections: [] })}
              className="text-[14px] text-muted-foreground hover:text-foreground"
            >
              Select all
            </button>
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <CategoryChip
              label="All"
              picked={draft.sections.length === 0}
              onClick={() => set({ sections: [] })}
            />
            {props.sections.map((s) => (
              <CategoryChip
                key={s.key}
                label={s.name}
                picked={draft.sections.includes(s.key)}
                onClick={() => toggleSection(s.key)}
              />
            ))}
          </div>
        </Section>

        <Section icon={<Tag />} title="Price Range">
          <SliderPrimitive.Root
            className="relative flex h-8 w-full touch-none select-none items-center"
            min={0}
            max={props.ceiling}
            step={step}
            minStepsBetweenThumbs={1}
            value={[lo, hi]}
            onValueChange={([a, b]) =>
              set({
                min_price: a! <= 0 ? null : a!,
                max_price: b! >= props.ceiling ? null : b!,
              })
            }
          >
            <SliderPrimitive.Track className="relative h-1 w-full grow rounded-full bg-surface">
              <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
            </SliderPrimitive.Track>
            {["Lowest price", "Highest price"].map((label) => (
              <SliderPrimitive.Thumb
                key={label}
                aria-label={label}
                className="block size-5 rounded-full border border-black/10 bg-white shadow-[0_2px_8px_rgb(0_0_0/0.35)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
              />
            ))}
          </SliderPrimitive.Root>
          <div className="mt-1 flex justify-between text-[14px] tabular-nums text-muted-foreground">
            <span>{props.rands(lo)}</span>
            <span>{hi >= props.ceiling ? `${props.rands(props.ceiling)}+` : props.rands(hi)}</span>
          </div>
        </Section>

        {props.dietary.length > 0 ? (
          <Section icon={<Leaf />} title="Dietary Preferences">
            <div className="grid grid-cols-2 gap-2">
              {props.dietary.map((t) => (
                <CheckRow
                  key={t.id}
                  label={t.label}
                  checked={draft.dietary.includes(t.id)}
                  onChange={(on) => toggleDiet(t.id, on)}
                />
              ))}
            </div>
          </Section>
        ) : null}

        <Section icon={<Clock />} title="Availability">
          <div className="grid grid-cols-2 gap-2">
            <CheckRow
              label="In Stock"
              checked={draft.in_stock}
              onChange={(v) => set({ in_stock: v })}
            />
            <CheckRow
              label="Out of Stock"
              checked={draft.out_of_stock}
              onChange={(v) => set({ out_of_stock: v })}
            />
          </div>
        </Section>

        <Section icon={<ArrowRightLeft />} title="Sort By">
          <div role="radiogroup" aria-label="Sort by" className="rounded-xl bg-field/50 py-1">
            {MENU_SORTS.map((s) => {
              const picked = draft.sort === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  onClick={() => set({ sort: s.id })}
                  className="flex h-11 w-full items-center gap-3 px-3 text-left text-[15px]"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                      picked ? "border-primary" : "border-input",
                    )}
                  >
                    {picked ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </Section>
      </div>
    </Panel>
  );
}
