import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  DineInError,
  getRestaurant,
  openTable,
  watchBill,
  watchMenu,
  watchTable,
  watchWaiterCall,
  type Bill,
  type CartItem,
  type Menu,
  type Restaurant,
  type TableContext as Table,
  type TableState,
  type WaiterCall,
} from "@/lib/dine-in";

/* ------------------------------------------------------------ storage bits */

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};
const drop = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

const NAME_KEY = "hearth-dine-in:name";
const cartKey = (token: string) => `hearth-dine-in:cart:${token}`;

/** openTable must run once per token, even with StrictMode double effects. */
const opening = new Map<string, Promise<Table>>();
function openTableOnce(token: string, fresh: boolean): Promise<Table> {
  if (fresh) opening.delete(token);
  const existing = opening.get(token);
  if (existing) return existing;
  const promise = openTable(token).catch((e) => {
    opening.delete(token);
    throw e;
  });
  opening.set(token, promise);
  return promise;
}

/* ------------------------------------------------------------------ types */

interface DineInValue {
  table: Table;
  restaurant: Restaurant;
  menu: Menu;
  tableState: TableState | null;
  bill: Bill | null;
  waiterCall: WaiterCall | null;
  ordersTaken: boolean;
  cart: CartItem[];
  setCart: (next: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  clearCart: () => void;
  guestName: string;
  setGuestName: (name: string) => void;
  money: (amount: number) => string;
}

const Ctx = createContext<DineInValue | null>(null);

export function useDineIn(): DineInValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useDineIn must be used inside DineInProvider");
  return value;
}

export interface Startup {
  status: "loading" | "error" | "ready";
  error: DineInError | null;
  retry: () => void;
}

/* --------------------------------------------------------------- provider */

export function useDineInStartup(token: string) {
  const [attempt, setAttempt] = useState(0);
  const [table, setTable] = useState<Table | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [tableState, setTableState] = useState<TableState | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState<DineInError | null>(null);

  const onLiveError = useCallback((e: DineInError) => {
    if (e.code === "dine-in/code-revoked" || e.code === "dine-in/table-not-found") setError(e);
    else toast.error(e.message);
  }, []);

  useEffect(() => {
    let alive = true;
    const stops: Array<() => void> = [];
    setError(null);
    setTable(null);
    setRestaurant(null);
    setMenu(null);
    setTableState(null);
    setBill(null);

    openTableOnce(token, attempt > 0)
      .then(async (ctx) => {
        if (!alive) return;
        setTable(ctx);
        const info = await getRestaurant(ctx.restaurant_id);
        if (!alive) return;
        setRestaurant(info);
        stops.push(watchMenu(ctx.restaurant_id, setMenu, onLiveError));
        stops.push(watchTable(ctx, setTableState, onLiveError));
        stops.push(watchBill(ctx, setBill, onLiveError));
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(
          e instanceof DineInError
            ? e
            : new DineInError("dine-in/unavailable", "Something went wrong. Please try again."),
        );
      });

    return () => {
      alive = false;
      stops.forEach((stop) => stop());
    };
  }, [token, attempt, onLiveError]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const ready = !!table && !!restaurant && !!menu;
  return {
    status: error ? ("error" as const) : ready ? ("ready" as const) : ("loading" as const),
    error,
    retry,
    table,
    restaurant,
    menu,
    tableState,
    bill,
  };
}

export function DineInProvider(props: {
  table: Table;
  restaurant: Restaurant;
  menu: Menu;
  tableState: TableState | null;
  bill: Bill | null;
  children: ReactNode;
}) {
  const { table, restaurant, menu, tableState, bill } = props;
  const [cart, setCartState] = useState<CartItem[]>([]);
  const [guestName, setGuestNameState] = useState("");
  const [waiterCall, setWaiterCall] = useState<WaiterCall | null>(null);
  const hydrated = useRef(false);

  // Restore the cart and the name saved on this phone.
  useEffect(() => {
    hydrated.current = false;
    const raw = read(cartKey(table.token));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCartState(parsed as CartItem[]);
      } catch {
        drop(cartKey(table.token));
      }
    } else {
      setCartState([]);
    }
    setGuestNameState(read(NAME_KEY) ?? "");
    hydrated.current = true;
  }, [table.token]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (cart.length === 0) drop(cartKey(table.token));
    else write(cartKey(table.token), JSON.stringify(cart));
  }, [cart, table.token]);

  const setGuestName = useCallback((name: string) => {
    setGuestNameState(name);
    write(NAME_KEY, name);
  }, []);

  const clearCart = useCallback(() => {
    setCartState([]);
    drop(cartKey(table.token));
  }, [table.token]);

  // Follow this guest's waiter call, if they have one.
  const requestId = tableState?.my_seat?.waiter_request_id ?? null;
  useEffect(() => {
    if (!requestId) {
      setWaiterCall(null);
      return;
    }
    return watchWaiterCall(requestId, setWaiterCall, (e) => console.warn(e.message));
  }, [requestId]);

  const ordersTaken = (tableState?.active ?? table.active) !== false;

  const value = useMemo<DineInValue>(
    () => ({
      table,
      restaurant,
      menu,
      tableState,
      bill,
      waiterCall,
      ordersTaken,
      cart,
      setCart: setCartState,
      clearCart,
      guestName,
      setGuestName,
      money: (amount: number) =>
        new Intl.NumberFormat("en-ZA", {
          style: "currency",
          currency: restaurant.currency || "ZAR",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount),
    }),
    [
      table,
      restaurant,
      menu,
      tableState,
      bill,
      waiterCall,
      ordersTaken,
      cart,
      clearCart,
      guestName,
      setGuestName,
    ],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
