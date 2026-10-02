import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MAX_NOTE,
  addonQuantity,
  isChoicePicked,
  itemOptions,
  lineTotal,
  missingChoices,
  newCartItem,
  setAddonQuantity,
  toggleChoice,
  withQuantity,
  withVariant,
  type CartItem,
  type MenuItem,
} from "@/lib/dine-in";
import { useDineIn } from "./context";
import { OptionChip, Panel, Stepper } from "./ui";
import { btn, field, sectionTitle } from "./styles";

export interface ItemSheetTarget {
  item: MenuItem;
  /** Index in the cart when editing an existing line. */
  index?: number;
  line?: CartItem;
}

export function ItemSheet(props: {
  target: ItemSheetTarget | null;
  onClose: () => void;
  onSubmit: (line: CartItem, index?: number) => void;
}) {
  const { menu, money } = useDineIn();
  // Keep showing the last item while the panel slides away.
  const [shown, setShown] = useState<ItemSheetTarget | null>(null);
  const [line, setLine] = useState<CartItem | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});

  // A new target starts a fresh line before anything renders with the old one.
  if (props.target && props.target !== shown) {
    setShown(props.target);
    setShowErrors(false);
    setLine(props.target.line ?? newCartItem(menu, props.target.item));
    return null; // React re-renders straight away with the new state
  }

  const target = props.target ?? shown;
  if (!target || !line) return null;
  const item = target.item;
  const options = itemOptions(menu, item);
  const missing = missingChoices(options, line);
  const editing = target.index !== undefined;

  const submit = () => {
    if (missing.length > 0) {
      setShowErrors(true);
      const first = groupRefs.current[missing[0]!.group.id];
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    props.onSubmit(line, target.index);
  };

  return (
    <Panel
      open={props.target !== null}
      onClose={props.onClose}
      title={item.name}
      centerTitle
      footer={
        <button
          type="button"
          className={cn(btn.primary, "h-[52px] w-full text-base")}
          onClick={submit}
        >
          {editing ? "Update order" : "Add to order"} · {money(lineTotal(line))}
        </button>
      }
    >
      <div className="space-y-6 pt-1">
        {item.image_url || item.description || item.allergens.length > 0 ? (
          <div className="space-y-3">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                loading="lazy"
                className="h-44 w-full rounded-2xl border border-border object-cover"
              />
            ) : null}
            {item.description ? (
              <p className="text-[15px] leading-relaxed text-foreground/75">{item.description}</p>
            ) : null}
            {item.allergens.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {item.allergens.map((a) => (
                  <span
                    key={a}
                    className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {a}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {options.variants.length > 0 ? (
          <section>
            <h3 className={cn(sectionTitle, "mb-2.5")}>Size</h3>
            <div className="grid grid-cols-3 gap-2">
              {options.variants.map((v) => (
                <OptionChip
                  key={v.id}
                  picked={line.variant?.id === v.id}
                  onClick={() => setLine(withVariant(line, v))}
                  label={v.name}
                  hint={
                    v.price_delta !== 0
                      ? `${v.price_delta > 0 ? "+" : "−"}${money(Math.abs(v.price_delta))}`
                      : null
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {options.modifiers.map((groupOptions) => {
          const { group, choices, min, max } = groupOptions;
          const pickedCount = line.addons.filter((a) => a.id.startsWith(`mod:${group.id}:`)).length;
          const full = pickedCount >= max;
          const invalid = showErrors && missing.some((m) => m.group.id === group.id);
          return (
            <section
              key={group.id}
              ref={(el) => {
                groupRefs.current[group.id] = el;
              }}
            >
              <h3 className="mb-2.5">
                <span className={sectionTitle}>{group.name}</span>
                <span className="text-sm text-muted-foreground">
                  {" · "}
                  {max === 1 ? "choose 1" : `choose up to ${max}`}
                  {min > 0 ? " · required" : ""}
                </span>
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {choices.map((choice) => {
                  const picked = isChoicePicked(line, group.id, choice.index);
                  return (
                    <OptionChip
                      key={choice.index}
                      picked={picked}
                      disabled={!picked && full && max > 1}
                      onClick={() => setLine(toggleChoice(line, group, choice))}
                      label={choice.label}
                      hint={choice.price > 0 ? `+${money(choice.price)}` : null}
                    />
                  );
                })}
              </div>
              {invalid ? (
                <p className="mt-2 text-sm font-medium text-destructive">Please choose one</p>
              ) : null}
            </section>
          );
        })}

        {options.addons.length > 0 ? (
          <section>
            <h3 className={cn(sectionTitle, "mb-1")}>Extras</h3>
            <div className="divide-y divide-border/60">
              {options.addons.map((addon) => (
                <div key={addon.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] text-foreground/85">{addon.name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      +{money(addon.price)}
                    </p>
                  </div>
                  <Stepper
                    value={addonQuantity(line, addon.id)}
                    min={0}
                    max={addon.max_quantity}
                    label={addon.name}
                    onChange={(n) => setLine(setAddonQuantity(line, addon, n))}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex items-center justify-between gap-3">
          <h3 className={sectionTitle}>Quantity</h3>
          <Stepper
            value={line.quantity}
            min={1}
            max={99}
            label="of this item"
            onChange={(n) => setLine(withQuantity(line, n))}
          />
        </section>

        <section>
          <label htmlFor="line-note" className={cn(sectionTitle, "mb-2.5 block")}>
            Item note
          </label>
          <textarea
            id="line-note"
            rows={2}
            maxLength={MAX_NOTE}
            value={line.notes ?? ""}
            placeholder="e.g. No onions"
            onChange={(e) => setLine({ ...line, notes: e.target.value || null })}
            className={cn(field, "min-h-[52px] resize-none py-3.5")}
          />
        </section>
      </div>
    </Panel>
  );
}
