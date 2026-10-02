import { useState } from "react";
import { ChevronRight, MoreVertical, Plus, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  MAX_NOTE,
  callWaiter,
  cartTotals,
  describeLineOptions,
  lineTotal,
  placeOrder,
  withQuantity,
  type CartItem,
  type PlaceOrderResult,
} from "@/lib/dine-in";
import { useDineIn } from "./context";
import { Panel, Stepper } from "./ui";
import { btn, card, field, sectionTitle } from "./styles";

export function CartSheet(props: {
  open: boolean;
  onClose: () => void;
  onEdit: (line: CartItem, index: number) => void;
  onSent: (result: PlaceOrderResult) => void;
}) {
  const { table, tableState, menu, cart, setCart, clearCart, guestName, money, ordersTaken } =
    useDineIn();
  const [instructions, setInstructions] = useState("");
  const [sending, setSending] = useState(false);

  const totals = cartTotals(cart);
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const tableName = tableState?.name ?? table.table_name;
  const imageOf = (itemId: string) => menu.items.find((i) => i.id === itemId)?.image_url ?? null;

  const setQuantity = (index: number, quantity: number) => {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((_, i) => i !== index)
        : prev.map((l, i) => (i === index ? withQuantity(l, quantity) : l)),
    );
  };

  const send = async () => {
    if (sending || cart.length === 0) return;
    setSending(true);
    try {
      const result = await placeOrder({
        table,
        items: cart,
        guestName: guestName || null,
        specialInstructions: instructions || null,
      });
      clearCart();
      setInstructions("");
      // Let the waiter know there's a new order to confirm. A failed call
      // must not undo the order, so just log it.
      callWaiter({
        table,
        message: `New order ${result.order_number} — please confirm`,
        guestName: guestName || null,
      }).catch((e) => console.warn("[dine-in] auto waiter call failed", e));
      props.onSent(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send your order. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Panel
      open={props.open}
      onClose={props.onClose}
      title="Your order"
      footer={
        cart.length > 0 ? (
          <div className="flex gap-2">
            <button
              type="button"
              className={cn(btn.secondary, "h-[52px] px-3.5")}
              onClick={props.onClose}
            >
              Add more
            </button>
            <button
              type="button"
              className={cn(btn.primary, "h-[52px] min-w-0 flex-1 px-3")}
              disabled={sending || !ordersTaken}
              onClick={send}
            >
              {sending
                ? "Sending…"
                : `Send ${itemCount} item${itemCount === 1 ? "" : "s"} · ${money(totals.total)}`}
            </button>
          </div>
        ) : null
      }
    >
      {cart.length === 0 ? (
        <div className="flex flex-col items-center px-4 pb-16 pt-16 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-surface text-muted-foreground">
            <ShoppingBag className="size-9" />
          </span>
          <p className="mt-6 text-[20px] font-semibold">Your order is empty</p>
          <p className="mt-2 text-[15px] text-muted-foreground">Pick something from the menu.</p>
          <button
            type="button"
            className={cn(btn.secondary, "mt-8 h-12 w-full max-w-xs")}
            onClick={props.onClose}
          >
            Browse the menu
          </button>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[19px] font-semibold tracking-tight">{tableName}</h2>
              <span className="inline-flex h-8 items-center rounded-lg bg-surface px-3 text-[13px] font-semibold text-muted-foreground ring-1 ring-inset ring-input">
                Not sent yet
              </span>
            </div>
            <p className="mt-1 max-w-[19rem] text-[13px] leading-snug text-foreground/75">
              Nothing goes to the kitchen until your waiter confirms the order.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <h3 className={sectionTitle}>Items</h3>
            <button
              type="button"
              onClick={props.onClose}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-3 text-sm font-semibold text-brand-light transition-colors hover:bg-primary/15"
            >
              <Plus className="size-4 text-primary" /> Add item
            </button>
          </div>

          <ul className="space-y-2">
            {cart.map((line, index) => {
              const options = describeLineOptions(line);
              const image = imageOf(line.item_id);
              return (
                <li key={index} className={cn(card, "rounded-xl p-3")}>
                  <div className="flex gap-3">
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        loading="lazy"
                        className="size-16 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                        <UtensilsCrossed className="size-6" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="pt-0.5 text-[16px] font-semibold leading-tight">
                          {line.name}
                        </p>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="-mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                            aria-label={`More for ${line.name}`}
                          >
                            <MoreVertical className="size-[18px]" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-44 rounded-xl p-1">
                            <DropdownMenuItem
                              className="h-10 rounded-lg px-3 text-[15px]"
                              onSelect={() => props.onEdit(line, index)}
                            >
                              Change options
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="h-10 rounded-lg px-3 text-[15px] text-destructive focus:text-destructive"
                              onSelect={() => setQuantity(index, 0)}
                            >
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {options.length > 0 ? (
                        <p className="mt-0.5 text-[13px] text-muted-foreground">
                          {options.join(" · ")}
                        </p>
                      ) : null}
                      {line.notes ? (
                        <p className="mt-0.5 text-[13px] italic text-muted-foreground">
                          “{line.notes}”
                        </p>
                      ) : null}
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <Stepper
                          size="sm"
                          removable
                          value={line.quantity}
                          min={1}
                          max={99}
                          label={line.name}
                          onChange={(n) => setQuantity(index, n)}
                        />
                        <span className="text-[16px] font-medium tabular-nums">
                          {money(lineTotal(line))}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onEdit(line, index)}
                    className="mt-2 inline-flex h-8 items-center gap-1 rounded-md text-sm text-foreground/80 transition-colors hover:text-foreground"
                  >
                    Modifiers & note <ChevronRight className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div>
            <label htmlFor="order-note" className={cn(sectionTitle, "mb-2.5 block")}>
              Note for the whole order
            </label>
            <textarea
              id="order-note"
              rows={2}
              maxLength={MAX_NOTE}
              value={instructions}
              placeholder="e.g. We're sharing the starters"
              onChange={(e) => setInstructions(e.target.value)}
              className={cn(field, "min-h-[52px] resize-none py-3.5")}
            />
          </div>

          <dl className={cn(card, "space-y-1 rounded-xl px-4 py-3")}>
            <div className="flex justify-between text-[15px] text-foreground/80">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{money(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-[15px] text-foreground/80">
              <dt>Service fee (5%)</dt>
              <dd className="tabular-nums">{money(totals.service_fee)}</dd>
            </div>
            <div className="flex justify-between pt-1 text-[20px] font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(totals.total)}</dd>
            </div>
          </dl>
        </div>
      )}
    </Panel>
  );
}
