import { useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { BellRing, Loader2, ReceiptText, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  cartTotals,
  formatMoney,
  type CartItem,
  type MenuItem,
  type PlaceOrderResult,
} from "@/lib/dine-in";
import {
  DineInProvider,
  useDineIn,
  useDineInStartup,
} from "@/components/dine-in/context";
import { TableHeader } from "@/components/dine-in/TableHeader";
import { MenuTab } from "@/components/dine-in/MenuTab";
import { BillTab } from "@/components/dine-in/BillTab";
import { ItemSheet, type ItemSheetTarget } from "@/components/dine-in/ItemSheet";
import { CartSheet } from "@/components/dine-in/CartSheet";
import { WaiterSheet } from "@/components/dine-in/WaiterSheet";
import { ScannerBrowserPrompt } from "@/components/dine-in/ScannerBrowserPrompt";

export const Route = createFileRoute("/dine-in/$token")({
  head: () => ({
    meta: [
      { title: "Hearth Dine-in — Order from your table" },
      {
        name: "description",
        content:
          "Browse the menu, order, and call a waiter from your phone — no app, no waiting.",
      },
      { property: "og:title", content: "Hearth Dine-in — Order from your table" },
      {
        property: "og:description",
        content:
          "Browse the menu, order, and call a waiter from your phone — no app, no waiting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DineInRoute,
});

function DineInRoute() {
  const { token } = Route.useParams();
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <DineInGate token={token} />
    </ClientOnly>
  );
}

function DineInGate({ token }: { token: string }) {
  const startup = useDineInStartup(token);
  const [promptTick, setPromptTick] = useState(0);

  if (startup.status === "error" && startup.error?.pending) {
    const p = startup.error.pending;
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <ReceiptText className="mx-auto size-10 text-primary" />
          <h1 className="mt-4 text-xl font-semibold">You already have an order waiting</h1>
          <p className="mt-2 text-sm text-muted-foreground">{startup.error.message}</p>
          <div className="mt-5 rounded-xl border border-border p-4 text-left text-sm">
            <div className="flex justify-between font-medium">
              <span>{p.table_name}</span>
              <span>{p.order_number}</span>
            </div>
            <p className="mt-1 text-muted-foreground">{p.status.replace(/_/g, " ")}</p>
            <ul className="mt-3 space-y-1">
              {p.items.map((it, i) => (
                <li key={i} className="flex justify-between">
                  <span>{it.name}</span>
                  <span className="text-muted-foreground">×{it.quantity}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span>{formatMoney(p.total)}</span>
            </div>
          </div>
          <Button
            className="mt-6 w-full rounded-xl"
            onClick={() => window.location.assign(`/dine-in/${p.token}`)}
          >
            Back to {p.table_name}
          </Button>
        </div>
      </div>
    );
  }

  if (startup.status === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <UtensilsCrossed className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">We couldn't open your table</h1>
          <p className="mt-2 text-sm text-muted-foreground">{startup.error?.message}</p>
          <Button className="mt-6 rounded-xl" onClick={startup.retry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (
    startup.status !== "ready" ||
    !startup.table ||
    !startup.restaurant ||
    !startup.menu ||
    !startup.persistence
  ) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Opening your table…</p>
      </div>
    );
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

      <Tabs value={tab} onValueChange={setTab} className="flex-1">
        <TabsList className="sticky top-0 z-30 grid w-full grid-cols-2 rounded-none border-b border-border bg-background/95 backdrop-blur">
          <TabsTrigger value="menu" className="gap-1.5">
            <UtensilsCrossed className="size-4" /> Menu
          </TabsTrigger>
          <TabsTrigger value="bill" className="gap-1.5">
            <ReceiptText className="size-4" /> Bill
            {orderCount > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {orderCount}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="menu" className="mt-0">
          <MenuTab onPick={pickItem} />
        </TabsContent>
        <TabsContent value="bill" className="mt-0">
          <BillTab />
        </TabsContent>
      </Tabs>

      {/* Floating action bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto flex gap-2">
          <Button
            type="button"
            variant={waiterWaiting ? "default" : "outline"}
            size="lg"
            className={cn(
              "h-12 flex-1 rounded-xl text-base",
              !waiterWaiting && "bg-background/95 backdrop-blur",
            )}
            onClick={() => setWaiterOpen(true)}
          >
            <BellRing className="size-5" />
            {waiterWaiting
              ? waiterCall?.status === "accepted"
                ? "Waiter on the way"
                : "Waiting for a waiter…"
              : "Call a waiter"}
          </Button>
          {cartCount > 0 ? (
            <Button
              type="button"
              size="lg"
              className="h-12 flex-1 rounded-xl text-base"
              disabled={!ordersTaken}
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag className="size-5" />
              {cartCount} · {money(cartTotal)}
            </Button>
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
