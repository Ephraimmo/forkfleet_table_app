import { ConciergeBell, ReceiptText, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeLineOptions, type GuestOrder } from "@/lib/dine-in";
import { useDineIn } from "./context";
import { GuestBadge, StatusBar, StatusPill } from "./ui";
import { card, innerCard } from "./styles";
import { sinceLabel, useNow } from "./time";

function Stat(props: { value: number; label: string; tone: string }) {
  return (
    <div className={cn(card, "rounded-xl px-4 py-3.5")}>
      <p className={cn("text-[32px] font-bold leading-none tabular-nums", props.tone)}>
        {props.value}
      </p>
      <p className="mt-2 text-[15px] text-foreground/85">{props.label}</p>
    </div>
  );
}

function ReadyCard({ order, tableName }: { order: GuestOrder; tableName: string }) {
  const { money } = useDineIn();
  const items = order.lines.reduce((sum, l) => sum + l.quantity, 0);
  return (
    <div className="flex gap-3 rounded-2xl border-2 border-success-line bg-success-soft p-4 shadow-[0_0_24px_-10px_var(--success)]">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-stat-yellow/20 text-stat-yellow">
        <ConciergeBell className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="text-[17px] font-semibold text-success-text">Ready — on its way to you</p>
        <p className="mt-1.5 text-[15px] font-medium">
          {tableName} · {order.order_number}
        </p>
        <p className="mt-0.5 text-[13px] text-foreground/70">
          {items} item{items === 1 ? "" : "s"} · {money(order.total)}
        </p>
      </div>
    </div>
  );
}

function OrderCard({ order, perGuest }: { order: GuestOrder; perGuest: boolean }) {
  const { money } = useDineIn();
  return (
    <section className={cn(innerCard, "p-3")}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-[14px] text-foreground/85">
          <GuestBadge />
          <span className="min-w-0 break-words leading-snug">
            {order.order_number}
            {order.guest_label ? ` · ${order.guest_label}` : ""}
          </span>
        </p>
        <StatusPill order={order} />
      </div>

      {order.step >= 0 ? (
        <div className="mt-3 space-y-1.5">
          <StatusBar order={order} />
          <p className="text-xs text-muted-foreground">
            {order.status_label}
            {order.round > 1 ? ` · Round ${order.round}` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
          {order.status_label}
          {order.rejection_reason ? ` — ${order.rejection_reason}` : ""}
        </p>
      )}

      <ul className="mt-3 space-y-2.5">
        {order.lines.map((line) => {
          const options = describeLineOptions(line);
          return (
            <li key={line.id} className="flex items-start gap-2">
              <span className="min-w-7 shrink-0 text-[15px] text-foreground/70 tabular-nums">
                {line.quantity}×
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{line.name}</p>
                {options.length > 0 ? (
                  <p className="text-[13px] text-muted-foreground">{options.join(" · ")}</p>
                ) : null}
                {line.notes ? (
                  <p className="text-[13px] italic text-muted-foreground">“{line.notes}”</p>
                ) : null}
                {line.added_by_label && !perGuest ? (
                  <p className="text-xs text-muted-foreground">Added by {line.added_by_label}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-[15px] font-medium tabular-nums">
                {money(line.line_total)}
              </span>
            </li>
          );
        })}
      </ul>

      {order.special_instructions ? (
        <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-[13px] text-foreground/75">
          {order.special_instructions}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
        <span className="text-[16px] font-semibold">Total</span>
        <span className="text-[17px] font-bold text-gold tabular-nums">{money(order.total)}</span>
      </div>
    </section>
  );
}

export function BillTab() {
  const { bill, money, tableState, table } = useDineIn();
  const now = useNow();

  if (!bill || bill.orders.length === 0) {
    return (
      <div className="px-4 py-6">
        <div className={cn(card, "flex flex-col items-center px-6 py-12 text-center")}>
          <span className="flex size-16 items-center justify-center rounded-full bg-surface text-muted-foreground">
            <ReceiptText className="size-7" />
          </span>
          <p className="mt-5 text-[17px] font-semibold">Nothing ordered yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Anything you order will show up here.
          </p>
        </div>
      </div>
    );
  }

  const perGuest = bill.order_mode === "multiple";
  const tableName = tableState?.name ?? table.table_name;
  const seating = tableState?.seating ?? null;
  const guests = seating ? Object.keys(seating.guests).length : 0;
  const seated = sinceLabel(seating?.opened_at, now);
  const count = (pred: (o: GuestOrder) => boolean) => bill.orders.filter(pred).length;
  const ready = bill.orders.filter((o) => o.step === 4);

  return (
    <div className="space-y-4 px-4 py-4 pb-10">
      <div className="grid grid-cols-2 gap-3">
        <Stat value={bill.orders.length} label="Orders" tone="text-stat-blue" />
        <Stat value={count((o) => o.step === 0)} label="To confirm" tone="text-stat-pink" />
        <Stat value={ready.length} label="Ready" tone="text-stat-yellow" />
        <Stat
          value={count((o) => o.step >= 1 && o.step <= 3)}
          label="In the kitchen"
          tone="text-stat-purple"
        />
      </div>

      {ready.map((order) => (
        <ReadyCard key={order.id} order={order} tableName={tableName} />
      ))}

      <h2 className="pt-2 text-[20px] font-semibold tracking-tight">
        {perGuest ? "Your orders" : "Table orders"}
      </h2>

      <section className={cn(card, "p-3")}>
        <div className="px-1 pb-3 pt-1">
          <h3 className="text-[19px] font-semibold tracking-tight">{tableName}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[14px] text-muted-foreground">
            <span>{perGuest ? "Separate bills" : "One shared bill"}</span>
            {guests > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-4" /> {guests}
                </span>
              </>
            ) : null}
            {seated ? (
              <>
                <span aria-hidden>·</span>
                <span>Seated {seated}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="space-y-2.5">
          {bill.orders.map((order) => (
            <OrderCard key={order.id} order={order} perGuest={perGuest} />
          ))}
        </div>
      </section>

      <section className={cn(card, "px-5 py-5")}>
        <p className="text-[15px] text-foreground/75">
          {perGuest ? "Your amount due" : "Amount due"}
        </p>
        <p className="mt-2 text-center text-[40px] font-bold leading-none tracking-tight tabular-nums">
          {money(bill.total)}
        </p>
        <dl className="mt-5 space-y-1.5 border-t border-border pt-3 text-[14px] text-foreground/75">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{money(bill.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Service fee (5%)</dt>
            <dd className="tabular-nums">{money(bill.service_fee)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {perGuest
            ? "This is your own bill. Everyone at the table pays for what they ordered."
            : "This is the whole table's bill — one bill, shared."}{" "}
          Pay your waiter at the end of the meal.
        </p>
      </section>
    </div>
  );
}
