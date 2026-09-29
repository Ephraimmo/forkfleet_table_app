import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ORDER_STEPS, describeLineOptions, type GuestOrder } from "@/lib/dine-in";
import { useDineIn } from "./context";

function OrderProgress({ order }: { order: GuestOrder }) {
  if (order.step < 0) {
    return (
      <p className="mt-2 text-sm font-medium text-destructive">
        {order.status_label}
        {order.rejection_reason ? ` — ${order.rejection_reason}` : ""}
      </p>
    );
  }
  return (
    <ol className="mt-3 space-y-1.5">
      {ORDER_STEPS.map((label, i) => {
        const done = i < order.step;
        const current = i === order.step;
        return (
          <li key={label} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-primary bg-primary/10",
                !done && !current && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" /> : null}
            </span>
            <span
              className={cn(
                current ? "font-medium text-foreground" : "text-muted-foreground",
                done && "text-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function BillTab() {
  const { bill, money, tableState } = useDineIn();

  if (!bill || bill.orders.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-sm text-muted-foreground">
        Nothing ordered yet. Anything you order will show up here.
      </p>
    );
  }

  const perGuest = bill.order_mode === "multiple";

  return (
    <div className="space-y-4 px-4 py-4 pb-10">
      {perGuest ? (
        <p className="text-xs text-muted-foreground">
          This is your own bill. Everyone at the table pays for what they ordered.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          This is the whole table's bill — one bill, shared.
        </p>
      )}

      {bill.orders.map((order) => (
        <section key={order.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              Order {order.order_number}
              {order.round > 1 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  round {order.round}
                </span>
              ) : null}
            </h2>
            <Badge variant={order.step < 0 ? "destructive" : "secondary"} className="text-[11px]">
              {order.status_label}
            </Badge>
          </div>

          <OrderProgress order={order} />

          <ul className="mt-3 space-y-2 border-t border-border pt-3">
            {order.lines.map((line) => {
              const options = describeLineOptions(line);
              return (
                <li key={line.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p>
                      <span className="font-medium">{line.name}</span>
                      <span className="text-muted-foreground"> ×{line.quantity}</span>
                    </p>
                    {options.length > 0 ? (
                      <p className="text-xs text-muted-foreground">{options.join(" · ")}</p>
                    ) : null}
                    {line.notes ? (
                      <p className="text-xs italic text-muted-foreground">“{line.notes}”</p>
                    ) : null}
                    {line.added_by_label && !perGuest ? (
                      <p className="text-xs text-muted-foreground">added by {line.added_by_label}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 tabular-nums">{money(line.line_total)}</span>
                </li>
              );
            })}
          </ul>

          {order.special_instructions ? (
            <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              {order.special_instructions}
            </p>
          ) : null}

          <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted-foreground">Order total</span>
            <span className="font-semibold tabular-nums">{money(order.total)}</span>
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">
          {perGuest ? "Your total" : `${tableState?.name ?? "Table"} total`}
        </h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{money(bill.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Service fee (5%)</dt>
            <dd className="tabular-nums">{money(bill.service_fee)}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(bill.total)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Pay your waiter at the end of the meal.
        </p>
      </section>
    </div>
  );
}
