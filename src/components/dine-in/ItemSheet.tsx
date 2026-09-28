import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

export interface ItemSheetTarget {
  item: MenuItem;
  /** Index in the cart when editing an existing line. */
  index?: number;
  line?: CartItem;
}

function Stepper(props: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 rounded-full"
        aria-label={`Fewer ${props.label}`}
        disabled={props.value <= props.min}
        onClick={() => props.onChange(props.value - 1)}
      >
        <Minus className="size-4" />
      </Button>
      <span className="w-8 text-center text-base font-semibold tabular-nums">{props.value}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 rounded-full"
        aria-label={`More ${props.label}`}
        disabled={props.value >= props.max}
        onClick={() => props.onChange(props.value + 1)}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

export function ItemSheet(props: {
  target: ItemSheetTarget | null;
  onClose: () => void;
  onSubmit: (line: CartItem, index?: number) => void;
}) {
  const { menu, money } = useDineIn();
  const { target } = props;
  const [line, setLine] = useState<CartItem | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!target) return;
    setShowErrors(false);
    setLine(target.line ?? newCartItem(menu, target.item));
    // Only when the sheet opens for a new target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

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
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-[480px] gap-0 overflow-y-auto rounded-t-3xl p-0 sm:max-w-[480px]"
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            className="h-44 w-full object-cover"
          />
        ) : null}
        <SheetHeader className="gap-1 pb-2 text-left">
          <SheetTitle className="text-xl">{item.name}</SheetTitle>
          {item.description ? (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          ) : null}
          {item.allergens.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.allergens.map((a) => (
                <Badge key={a} variant="secondary" className="text-[11px] font-normal">
                  {a}
                </Badge>
              ))}
            </div>
          ) : null}
        </SheetHeader>

        <div className="space-y-6 px-4 pb-40">
          {options.variants.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Size</h3>
              <div className="space-y-2">
                {options.variants.map((v) => {
                  const picked = line.variant?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setLine(withVariant(line, v))}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                        picked ? "border-primary bg-primary/5" : "border-border",
                      )}
                      aria-pressed={picked}
                    >
                      <span>{v.name}</span>
                      {v.price_delta !== 0 ? (
                        <span className="tabular-nums text-muted-foreground">
                          {v.price_delta > 0 ? "+" : "−"}
                          {money(Math.abs(v.price_delta))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {options.modifiers.map((groupOptions) => {
            const { group, choices, min, max } = groupOptions;
            const pickedCount = line.addons.filter((a) =>
              a.id.startsWith(`mod:${group.id}:`),
            ).length;
            const full = pickedCount >= max;
            const invalid = showErrors && missing.some((m) => m.group.id === group.id);
            return (
              <section
                key={group.id}
                ref={(el) => {
                  groupRefs.current[group.id] = el;
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{group.name}</h3>
                  {min > 0 ? (
                    <Badge variant="secondary" className="text-[11px]">
                      Required
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {max === 1 ? "Choose 1" : `Choose up to ${max}`}
                  </span>
                </div>
                <div className="space-y-2">
                  {choices.map((choice) => {
                    const picked = isChoicePicked(line, group.id, choice.index);
                    const disabled = !picked && full && max > 1;
                    return (
                      <button
                        key={choice.index}
                        type="button"
                        disabled={disabled}
                        aria-pressed={picked}
                        onClick={() => setLine(toggleChoice(line, group, choice))}
                        className={cn(
                          "flex min-h-11 w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                          picked ? "border-primary bg-primary/5" : "border-border",
                          disabled && "opacity-50",
                        )}
                      >
                        <span>{choice.label}</span>
                        {choice.price > 0 ? (
                          <span className="tabular-nums text-muted-foreground">
                            +{money(choice.price)}
                          </span>
                        ) : null}
                      </button>
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
              <h3 className="mb-2 text-sm font-semibold">Extras</h3>
              <div className="space-y-2">
                {options.addons.map((addon) => (
                  <div
                    key={addon.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{addon.name}</p>
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

          <section>
            <label htmlFor="line-note" className="mb-2 block text-sm font-semibold">
              Anything the kitchen should know?
            </label>
            <Textarea
              id="line-note"
              maxLength={MAX_NOTE}
              value={line.notes ?? ""}
              placeholder="No onions, please"
              onChange={(e) => setLine({ ...line, notes: e.target.value || null })}
              className="rounded-xl"
            />
          </section>

          <section className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Quantity</h3>
            <Stepper
              value={line.quantity}
              min={1}
              max={99}
              label="of this item"
              onChange={(n) => setLine(withQuantity(line, n))}
            />
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <Button size="lg" className="h-12 w-full rounded-xl text-base" onClick={submit}>
            {editing ? "Update" : "Add to order"} · {money(lineTotal(line))}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
