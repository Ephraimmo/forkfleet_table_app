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
  // --- persistence additions ---
  _setCacheForBuild,
  getCart,
  loadState,
  recordScan,
  recordScanVisit,
  rememberUid,
  saveState,
  setCart as persistenceSetCart,
  setRecoveryFragmentIfScanner,
  type PersistenceState,
  type ScanRecord,
} from "@/lib/dine-in";

/* ------------------------------------------------------------ storage bits */

// Legacy localStorage wrappers (kept so in-flight tab reloads still work; the
// persistence layer is the canonical source of truth).
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
  persistence: PersistenceState;
  scanHistory: ScanRecord[];
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
  const [persistence, setPersistence] = useState<PersistenceState | null>(null);

  // Load the cross-session persistence state before we do anything else so that
  // even if Firebase anonymous auth was wiped, we can prime the UI with the
  // guest's name and last-seen cart.
  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (alive) setPersistence(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onLiveError = useCallback((e: DineInError) => {
    if (e.code === "dine-in/code-revoked" || e.code === "dine-in/table-not-found") setError(e);
    else toast.error(e.message);
  }, []);

  // Capture the signed-in uid into persistence so we can recognise the guest
  // (or at least offer a hint) even if Firebase storage is wiped later.
  useEffect(() => {
    if (!table || !persistence) return;
    let alive = true;
    (async () => {
      try {
        const uid = (await import("@/lib/dine-in")).currentUid();
        const remembered = rememberUid(persistence, uid);
        const next = await saveState({ guest_uid_hint: remembered.guest_uid_hint });
        if (alive) setPersistence(next);
      } catch {
        /* not signed in yet — will retry on next change */
      }
    })();
    return () => {
      alive = false;
    };
  }, [table, persistence?.guest_uid_hint]);

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

        // Record this scan in the persistence stack (localStorage + sessionStorage
        // + IndexedDB), then append the recovery fragment to the URL so even a
        // scanner-browser that wipes storage on close still carries enough info
        // to recognise the guest on re-scan.
        setPersistence((prev) => {
          const base = prev ?? {
            guest_name: null,
            guest_uid_hint: null,
            scan_history: [],
            carts: {},
            scanner_prompt_dismissed_at: null,
          };
          const seeded = getRestaurantCached(ctx.restaurant_id).then(async (info) => {
            const state1 = recordScan(base, {
              token: ctx.token,
              restaurant_id: ctx.restaurant_id,
              restaurant_name: info?.name ?? null,
              table_id: ctx.table_id,
              table_label: ctx.table_label,
            });
            const saved = await saveState({ scan_history: state1.scan_history });
            setRecoveryFragmentIfScanner(saved, ctx.token);
            _setCacheForBuild(saved);
            setPersistence(saved);
            return saved;
          });
          void seeded;
          return base;
        });

        const info = await getRestaurantCached(ctx.restaurant_id);
        if (!alive) return;
        setRestaurant(info);
        stops.push(watchMenu(ctx.restaurant_id, setMenu, onLiveError));
        stops.push(
          watchTable(
            ctx,
            (s) => {
              setTableState(s);
              // Bump "last visited" every time the table live-state ticks so
              // scan history reflects actual activity, not just the first scan.
              setPersistence((prev) => {
                if (!prev) return prev;
                const visited = recordScanVisit(prev, ctx.token);
                void saveState({ scan_history: visited.scan_history });
                return visited;
              });
            },
            onLiveError,
          ),
        );
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
  const ready = !!table && !!restaurant && !!menu && !!persistence;
  return {
    status: error ? ("error" as const) : ready ? ("ready" as const) : ("loading" as const),
    error,
    retry,
    table,
    restaurant,
    menu,
    tableState,
    bill,
    persistence,
  };
}

// Lightweight in-memory restaurant cache so we don't re-read it twice.
const RESTAURANT_CACHE = new Map<string, Restaurant>();
async function getRestaurantCached(id: string): Promise<Restaurant | null> {
  const cached = RESTAURANT_CACHE.get(id);
  if (cached) return cached;
  try {
    const info = await getRestaurant(id);
    RESTAURANT_CACHE.set(id, info);
    return info;
  } catch {
    return null;
  }
}

export function DineInProvider(props: {
  table: Table;
  restaurant: Restaurant;
  menu: Menu;
  tableState: TableState | null;
  bill: Bill | null;
  persistence: PersistenceState;
  children: ReactNode;
}) {
  const { table, restaurant, menu, tableState, bill, persistence: initialPersistence } = props;
  const [cart, setCartState] = useState<CartItem[]>([]);
  const [guestName, setGuestNameState] = useState("");
  const [waiterCall, setWaiterCall] = useState<WaiterCall | null>(null);
  const [persistence, setPersistence] = useState<PersistenceState>(initialPersistence);
  const hydrated = useRef(false);

  // Sync the persistence state from above (startup hook) into the provider so
  // downstream components get live updates without a second read.
  useEffect(() => {
    setPersistence(initialPersistence);
  }, [initialPersistence]);

  // Restore the cart and the name — prefer the multi-layer persistence state,
  // fall back to legacy localStorage keys so nothing is lost during the rollout.
  useEffect(() => {
    hydrated.current = false;
    const persistedCart = getCart<CartItem[]>(persistence, table.token);
    if (persistedCart && Array.isArray(persistedCart)) {
      setCartState(persistedCart);
    } else {
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
    }
    setGuestNameState(persistence.guest_name ?? read(NAME_KEY) ?? "");
    hydrated.current = true;
  }, [table.token, persistence.guest_name]);

  // Persist the cart (to legacy localStorage as well as the new persistence
  // stack that survives scanner-browser closes).
  useEffect(() => {
    if (!hydrated.current) return;
    if (cart.length === 0) {
      drop(cartKey(table.token));
    } else {
      write(cartKey(table.token), JSON.stringify(cart));
    }
    setPersistence((prev) => {
      const next = persistenceSetCart(prev, table.token, cart.length ? cart : null);
      void saveState({ carts: next.carts });
      return next;
    });
  }, [cart, table.token]);

  const setGuestName = useCallback(
    (name: string) => {
      setGuestNameState(name);
      write(NAME_KEY, name);
      setPersistence((prev) => {
        const next = { ...prev, guest_name: name || null };
        void saveState({ guest_name: next.guest_name });
        return next;
      });
    },
    [],
  );

  const clearCart = useCallback(() => {
    setCartState([]);
    drop(cartKey(table.token));
    setPersistence((prev) => {
      const next = persistenceSetCart(prev, table.token, null);
      void saveState({ carts: next.carts });
      return next;
    });
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
      persistence,
      scanHistory: persistence.scan_history,
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
      persistence,
    ],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
