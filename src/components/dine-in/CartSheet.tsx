import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_NOTE,
  cartTotals,
  describeLineOptions,
  lineTotal,
  placeOrder,
  withQuantity,
  type CartItem,
  type PlaceOrderResult,
} from "@/lib/dine-in";
import { useDineIn } from "./context";

export function CartSheet(props: {
  open: boolean;
  onClose: () => void;
  onEdit: (line: CartItem, index: number) => void;
  onSent: (result: PlaceOrderResult) => void;
}) {
  const { table, cart, setCart, clearCart, guestName, money, ordersTaken } = useDineIn();
  const [instructions, setInstructions] = useState("");
  const [sending, setSending] = useState(false);

  const totals = cartTotals(cart);
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);

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
      props.onSent(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send your order. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-[480px] gap-0 overflow-y-auto rounded-t-3xl p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="pb-2 text-left">
          <SheetTitle className="text-xl">Your order</SheetTitle>
        </SheetHeader>

        {cart.length === 0 ? (
          <p className="px-4 pb-16 pt-4 text-center text-sm text-muted-foreground">
            Your order is empty. Pick something from the menu.
          </p>
        ) : (
          <div className="space-y-4 px-4 pb-6">
            <ul className="space-y-3">
              {cart.map((line, index) => {
                const options = describeLineOptions(line);
                return (
                  <li key={index} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => props.onEdit(line, index)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="font-medium">{line.name}</p>
                        {options.length > 0 ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {options.join(" · ")}
                          </p>
                        ) : null}
                        {line.notes ? (
                          <p className="mt-0.5 text-xs italic text-muted-foreground">
                            “{line.notes}”
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-primary">Tap to change options</p>
                      </button>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {money(lineTotal(line))}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-9 rounded-full"
                          aria-label={`One fewer ${line.name}`}
                          onClick={() => setQuantity(index, line.quantity - 1)}
                        >
                          {line.quantity === 1 ? (
                            <Trash2 className="size-4" />
                          ) : (
                            <Minus className="size-4" />
                          )}
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">
                          {line.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-9 rounded-full"
                          aria-label={`One more ${line.name}`}
                          disabled={line.quantity >= 99}
                          onClick={() => setQuantity(index, line.quantity + 1)}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => setQuantity(index, 0)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div>
              <label htmlFor="order-note" className="mb-2 block text-sm font-semibold">
                Anything for the whole order?
              </label>
              <Textarea
                id="order-note"
                maxLength={MAX_NOTE}
                value={instructions}
                placeholder="We're sharing the starters"
                onChange={(e) => setInstructions(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Service fee (5%)</dt>
                <dd className="tabular-nums">{money(totals.service_fee)}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(totals.total)}</dd>
              </div>
            </dl>
          </div>
        )}

        {cart.length > 0 ? (
          <div className="sticky bottom-0 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <Button
              size="lg"
              className="h-12 w-full rounded-xl text-base"
              disabled={sending || !ordersTaken}
              onClick={send}
            >
              {sending
                ? "Sending…"
                : `Send ${itemCount} item${itemCount === 1 ? "" : "s"} · ${money(totals.total)}`}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Your waiter confirms the order before it goes to the kitchen.
            </p>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
