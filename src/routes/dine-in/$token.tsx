import { useEffect, useRef, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Bell, Loader2, ReceiptText, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  cartTotals,
  formatMoney,
  tryAutoRedirectToRealBrowser,
  type CartItem,
  type MenuItem,
  type PlaceOrderResult,
} from "@/lib/dine-in";
import { DineInProvider, useDineIn, useDineInStartup } from "@/components/dine-in/context";
import { TableHeader } from "@/components/dine-in/TableHeader";
import { MenuTab } from "@/components/dine-in/MenuTab";
import { BillTab } from "@/components/dine-in/BillTab";
import { ItemSheet, type ItemSheetTarget } from "@/components/dine-in/ItemSheet";
import { CartSheet } from "@/components/dine-in/CartSheet";
import { WaiterSheet } from "@/components/dine-in/WaiterSheet";
import { ScannerBrowserPrompt } from "@/components/dine-in/ScannerBrowserPrompt";
import { GuestBadge, HeroLogo, StateScreen } from "@/components/dine-in/ui";
import { btn, innerCard } from "@/components/dine-in/styles";

export const Route = createFileRoute("/dine-in/$token")({
  head: () => ({
    meta: [
      { title: "Hearth Dine-in — Order from your table" },
      {
        name: "description",
        content: "Browse the menu, order, and call a waiter from your phone — no app, no waiting.",
      },
      { property: "og:title", content: "Hearth Dine-in — Order from your table" },
      {
        property: "og:description",
        content: "Browse the menu, order, and call a waiter from your phone — no app, no waiting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DineInRoute,
});

function Opening({ label }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6">
      <HeroLogo />
      <div className="flex items-center gap-2.5 text-[15px] text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-primary" />
        {label ?? "Opening your table…"}
      </div>
    </div>
  );
}

function DineInRoute() {
  const { token } = Route.useParams();

  // EARLY AUTO-REDIRECT: if the user arrived via a scanner / in-app browser
  // that wipes storage on close, hand them off to a real browser
  // (Safari on iPhone, Chrome on Android) *before* we load anything else.
  // This runs as soon as the component mounts, outside ClientOnly.
  useEffect(() => {
    tryAutoRedirectToRealBrowser();
  }, []);

  return (
    <ClientOnly fallback={<Opening label="Loading…" />}>
      <DineInGate token={token} />
    </ClientOnly>
  );
}

function DineInGate({ token }: { token: string }) {
  const startup = useDineInStartup(token);
  const [promptTick, setPromptTick] = useState(0);

  // If the first-attempt redirect didn't fire (e.g. persistence load showed
  // we're still inside the scanner after state loaded), retry once with the
  // recovery fragment now populated.
  useEffect(() => {
    if (startup.status === "ready" && startup.persistence) {
      tryAutoRedirectToRealBrowser();
    }
  }, [startup.status]);

  if (startup.status === "error" && startup.error?.pending) {
    const p = startup.error.pending;
    return (
      <StateScreen
        tone="brand"
        icon={<ReceiptText />}
        title="You already have an order waiting"
        actions={
          <button
            type="button"
            className={cn(btn.primary, "h-[52px] w-full text-base")}
            onClick={() => window.location.assign(`/dine-in/${p.token}`)}
          >
            Back to {p.table_name}
          </button>
        }
      >
        <p>{startup.error.message}</p>
        <div className={cn(innerCard, "mt-6 bg-card p-4 text-left text-[15px]")}>
          <p className="flex items-center gap-2 text-foreground/85">
            <GuestBadge />
            {p.order_number} · {p.table_name}
          </p>
          <p className="mt-1 text-[13px] capitalize text-muted-foreground">
            {p.status.replace(/_/g, " ")}
          </p>
          <ul className="mt-3 space-y-1.5">
            {p.items.map((it, i) => (
              <li key={i} className="flex gap-2">
                <span className="min-w-7 text-foreground/70 tabular-nums">{it.quantity}×</span>
                <span className="font-medium text-foreground">{it.name}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
            <span className="font-semibold text-foreground">Total</span>
            <span className="text-[17px] font-bold text-gold tabular-nums">
              {formatMoney(p.total)}
            </span>
          </div>
        </div>
      </StateScreen>
    );
  }

  if (startup.status === "error") {
    return (
      <StateScreen
        tone="danger"
        icon={<UtensilsCrossed />}
        title="We couldn't open your table"
        actions={
          <button
            type="button"
            className={cn(btn.secondary, "h-[52px] w-full text-base")}
            onClick={startup.retry}
          >
            Try again
          </button>
        }
      >
        <p>{startup.error?.message}</p>
      </StateScreen>
    );
  }

  if (
    startup.status !== "ready" ||
    !startup.table ||
    !startup.restaurant ||
    !startup.menu ||
    !startup.persistence
  ) {
    return <Opening />;
  }

  return (
    <DineInProvider
      table={startup.table}
      restaurant={startup.restaurant}
      menu={startup.menu}
      tableState={startup.tableState}
      bill={startup.bill}
      persistence={startup.persistence}
    >
      <ScannerBrowserPrompt
        state={startup.persistence}
        onDismissed={() => setPromptTick((n) => n + 1)}
      />
      <DineInPage key={promptTick} />
    </DineInProvider>
  );
}

function DineInPage() {
  const { cart, setCart, waiterCall, bill, money, ordersTaken, menu } = useDineIn();
  const [tab, setTab] = useState("menu");
  const [target, setTarget] = useState<ItemSheetTarget | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [waiterOpen, setWaiterOpen] = useState(false);

  const cartCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const cartTotal = cartTotals(cart).total;
  const orderCount = bill?.orders.length ?? 0;
  const waiterWaiting = waiterCall !== null && waiterCall.status !== "resolved";
  const waiterAccepted = waiterCall?.status === "accepted";

  // Say so the moment the waiter confirms a payment. Only orders seen unpaid
  // first count, so opening the page on an already-paid bill stays quiet.
  const paidBefore = useRef(new Map<string, boolean>());
  useEffect(() => {
    if (!bill) return;
    const fresh = bill.orders.filter((o) => o.paid && paidBefore.current.get(o.id) === false);
    for (const o of bill.orders) paidBefore.current.set(o.id, o.paid);
    if (fresh.length === 0) return;
    toast.success(
      bill.all_paid
        ? "Payment received — thank you! Your bill is settled."
        : `Payment received for ${fresh.map((o) => o.order_number).join(", ")}`,
    );
  }, [bill]);

  const pickItem = (item: MenuItem) => setTarget({ item });
  const editLine = (line: CartItem, index: number) => {
    setCartOpen(false);
    const item = findMenuItem(line.item_id);
    if (item) setTarget({ item, index, line });
  };

  // Editing a cart line reopens the item's sheet with the line's choices.
  const findMenuItem = (itemId: string): MenuItem | null =>
    menu.items.find((i) => i.id === itemId) ?? null;

  const submitLine = (line: CartItem, index?: number) => {
    setCart((prev) =>
      index === undefined ? [...prev, line] : prev.map((l, i) => (i === index ? line : l)),
    );
    setTarget(null);
    if (index === undefined) toast.success(`${line.name} added to your order`);
  };

  const onSent = (result: PlaceOrderResult) => {
    setCartOpen(false);
    setTab("bill");
    toast.success(
      result.created
        ? `Order ${result.order_number} sent — waiting for your waiter to confirm`
        : `Added to order ${result.order_number}`,
    );
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
      <TableHeader />

      <Tabs value={tab} onValueChange={setTab} className="mt-2 flex-1">
        {/* 60px tall: MenuTab's sticky search sits right under it. */}
        <div className="sticky top-0 z-30 h-[60px] bg-background/95 px-4 py-2 backdrop-blur">
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl border border-border bg-card p-1">
            <TabsTrigger
              value="menu"
              className="h-full gap-2 rounded-[0.6rem] text-[15px] font-semibold text-muted-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:[&_svg]:text-primary"
            >
              <UtensilsCrossed className="size-[18px]" /> Menu
            </TabsTrigger>
            <TabsTrigger
              value="bill"
              className="h-full gap-2 rounded-[0.6rem] text-[15px] font-semibold text-muted-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:[&_svg]:text-primary"
            >
              <ReceiptText className="size-[18px]" /> Bill
              {orderCount > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {orderCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="menu" className="mt-0">
          <MenuTab onPick={pickItem} />
        </TabsContent>
        <TabsContent value="bill" className="mt-0">
          <BillTab />
        </TabsContent>
      </Tabs>

      {/* Floating action bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 text-[15px] font-semibold transition-[background-color,transform] active:scale-[0.98]",
              !waiterWaiting && "border-input bg-surface text-foreground hover:bg-surface/70",
              waiterWaiting && !waiterAccepted && "border-primary/60 bg-card text-foreground",
              waiterAccepted && "border-info-line bg-info-wash text-info-text",
            )}
            onClick={() => setWaiterOpen(true)}
          >
            <Bell
              className={cn(
                "size-5 shrink-0",
                waiterWaiting && !waiterAccepted && "fill-stat-yellow text-stat-yellow",
              )}
            />
            <span className="truncate">
              {waiterAccepted
                ? "Waiter on the way"
                : waiterWaiting
                  ? "Waiting for a waiter…"
                  : "Call a waiter"}
            </span>
          </button>
          {cartCount > 0 ? (
            <button
              type="button"
              className={cn(btn.primary, "h-[52px] min-w-0 flex-1 px-3")}
              disabled={!ordersTaken}
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag />
              <span className="truncate tabular-nums">
                {cartCount} · {money(cartTotal)}
              </span>
            </button>
          ) : null}
        </div>
      </div>
      {/* Spacer so the bar never covers content */}
      <div className="h-24 shrink-0" />

      <ItemSheet target={target} onClose={() => setTarget(null)} onSubmit={submitLine} />
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onEdit={editLine}
        onSent={onSent}
      />
      <WaiterSheet open={waiterOpen} onClose={() => setWaiterOpen(false)} />
    </div>
  );
}
