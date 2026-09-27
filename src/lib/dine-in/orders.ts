// Dine-in data layer, part 3 of 3: the seating at the table, placing orders,
// following them, the running bill, and calling a waiter.
//
// Placing an order and calling a waiter each run as one Firestore
// transaction that reads the table and writes the order (or call) and the
// table's seating together, so guests at the same table never clash. The
// Firestore security rules check every write field by field; change nothing.

import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  type DocumentData,
  type Transaction,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  ADDABLE_STATUSES,
  DineInError,
  MAX_NAME,
  MAX_NOTE,
  MAX_WAITER_MESSAGE,
  SAFE_ID,
  SESSION_IDLE_TIMEOUT_MS,
  WAITING_FOR_WAITER,
  count,
  currentUid,
  isMap,
  newOrderNumber,
  num,
  randomId,
  resolveOrderMode,
  revokedCode,
  round2,
  str,
  strOrNull,
  tableDisplayName,
  toDineInError,
  type OrderMode,
  type Raw,
  type TableContext,
} from "./core";
import {
  lineTotal,
  priceLines,
  validateItems,
  type CartItem,
  type OrderLineAddon,
  type OrderLineVariant,
} from "./menu";

/* ============================================================ the seating */

export interface Seat {
  /** "Customer 2", or the name the guest gave. */
  label: string;
  joined_at: string;
  current_order_id: string | null;
  order_count: number;
  /** The guest's latest waiter call — watch it with watchWaiterCall(). */
  waiter_request_id: string | null;
}

export interface Seating {
  id: string;
  opened_at: string;
  last_activity_at: string;
  order_mode: OrderMode;
  current_order_id: string | null;
  order_count: number;
  order_ids: string[];
  guests: Record<string, Seat>;
}

export interface TableState {
  label: string;
  name: string;
  active: boolean;
  /** The mode that applies now: the open seating's, else the table's. */
  order_mode: OrderMode;
  /** The party at the table now. null when the table is free, was cleared, or went idle. */
  seating: Seating | null;
  /** This guest's seat in it. null until they order or call a waiter. */
  my_seat: Seat | null;
}

function isIdle(session: Raw, now: number): boolean {
  const last = Date.parse(str(session["last_activity_at"]) || str(session["opened_at"]));
  return !Number.isFinite(last) || now - last > SESSION_IDLE_TIMEOUT_MS;
}

function isOpenSeating(session: unknown, now: number): session is Raw {
  return (
    isMap(session) &&
    !!str(session["id"]) &&
    !!str(session["opened_at"]) &&
    isMap(session["guests"]) &&
    !isIdle(session, now)
  );
}

function normalizeSeat(raw: Raw, fallbackTime: string): Seat {
  return {
    label: str(raw["label"]) || "Guest",
    joined_at: str(raw["joined_at"]) || fallbackTime,
    current_order_id: strOrNull(raw["current_order_id"]),
    order_count: count(raw["order_count"]),
    waiter_request_id: strOrNull(raw["waiter_request_id"]),
  };
}

function toTableState(raw: Raw, uid: string | null, now = Date.now()): TableState {
  const label = str(raw["label"]);
  const session = raw["session"];
  let seating: Seating | null = null;
  if (isOpenSeating(session, now)) {
    const opened = str(session["opened_at"]);
    const guests: Record<string, Seat> = {};
    for (const [id, g] of Object.entries(session["guests"] as Raw)) {
      if (isMap(g)) guests[id] = normalizeSeat(g, opened);
    }
    seating = {
      id: str(session["id"]),
      opened_at: opened,
      last_activity_at: str(session["last_activity_at"]) || opened,
      order_mode: resolveOrderMode(session["order_mode"]),
      current_order_id: strOrNull(session["current_order_id"]),
      order_count: count(session["order_count"]),
      order_ids: Array.isArray(session["order_ids"])
        ? session["order_ids"].filter((v: unknown): v is string => typeof v === "string" && v !== "")
        : [],
      guests,
    };
  }
  return {
    label,
    name: tableDisplayName(label),
    active: raw["active"] !== false,
    order_mode: seating ? seating.order_mode : resolveOrderMode(raw["order_mode"]),
    seating,
    my_seat: seating && uid ? (seating.guests[uid] ?? null) : null,
  };
}

const tableGone = () =>
  new DineInError(
    "dine-in/table-not-found",
    "This table no longer exists. Please ask a member of staff.",
  );

/** The guest's table, live: the seating, their seat, whether it's taking orders. */
export function watchTable(
  table: TableContext,
  onChange: (state: TableState) => void,
  onError: (e: DineInError) => void,
): () => void {
  return onSnapshot(
    doc(db, "restaurants", table.restaurant_id, "tables", table.table_id),
    (snap) => {
      if (!snap.exists()) return onError(tableGone());
      onChange(toTableState(snap.data(), auth.currentUser?.uid ?? null));
    },
    (e) => onError(toDineInError(e)),
  );
}

/**
 * The seating the guest joins right now, and their seat in it. Works on the
 * stored seating as read, changing only this guest's seat and the seating's
 * own counters, so every other guest's seat is written back exactly as it was
 * (the security rules check this). A table with no seating, or one that has
 * gone idle, starts a new seating in the table's mode.
 */
function joinSeating(rawTable: Raw, uid: string, name: string | null, now: number) {
  const ts = new Date(now).toISOString();
  const stored = rawTable["session"];
  const session: Raw = isOpenSeating(stored, now)
    ? structuredClone(stored)
    : {
        id: randomId("ses"),
        opened_at: ts,
        last_activity_at: ts,
        order_mode: resolveOrderMode(rawTable["order_mode"]),
        current_order_id: null,
        order_count: 0,
        order_ids: [],
        guests: {},
      };
  if (!Array.isArray(session["order_ids"])) session["order_ids"] = [];
  session["order_count"] = count(session["order_count"]);
  const guests = session["guests"] as Raw;
  const existing = guests[uid];
  const seat: Raw = isMap(existing)
    ? { ...existing, ...normalizeSeat(existing, ts) }
    : {
        label: name ?? `Customer ${Object.keys(guests).length + 1}`,
        joined_at: ts,
        current_order_id: null,
        order_count: 0,
        waiter_request_id: null,
      };
  return { session, seat, mode: resolveOrderMode(session["order_mode"]) };
}

/**
 * Read the guest's table inside a transaction and check it can take them: the
 * scanned code must still be the table's current one, and the table active.
 */
async function readActiveTable(tx: Transaction, table: TableContext): Promise<Raw> {
  const token = await tx.get(doc(db, "tableQrTokens", table.token));
  if (!token.exists() || str(token.data()["table_id"]) !== table.table_id) throw revokedCode();
  const snap = await tx.get(doc(db, "restaurants", table.restaurant_id, "tables", table.table_id));
  if (!snap.exists()) throw tableGone();
  const raw = snap.data();
  if (str(raw["qr_token"]) !== table.token) throw revokedCode();
  if (raw["active"] === false) {
    const name = tableDisplayName(str(raw["label"]) || table.table_label);
    throw new DineInError(
      "dine-in/table-inactive",
      `${name} isn't taking orders right now. Please ask a member of staff.`,
    );
  }
  return raw;
}

/* ========================================================== placing orders */

export interface PlaceOrderResult {
  order_id: string;
  order_number: string;
  /** true when a new order was started, false when the items joined one still waiting for the waiter. */
  created: boolean;
  session_id: string;
  guest_label: string;
  round: number;
}

/**
 * Send the cart to the waiter. Depending on the seating's mode the items join
 * an order that is still waiting for the waiter, or start a new one:
 *   single   – the whole table shares one order while it waits; once the waiter
 *              confirms it, the next items start the table's next order.
 *   multiple – the guest's own order while it waits, else a new one of theirs.
 * Every order waits for a waiter to confirm it before the kitchen sees it.
 */
export async function placeOrder(input: {
  table: TableContext;
  items: CartItem[];
  /** Optional first name. Used only the first time the guest joins the seating; otherwise "Customer N". */
  guestName?: string | null;
  /** For the whole order, e.g. "We're sharing the starters". */
  specialInstructions?: string | null;
}): Promise<PlaceOrderResult> {
  const uid = currentUid();
  const name = str(input.guestName).slice(0, MAX_NAME) || null;
  const items = validateItems(input.items);
  const instructions = str(input.specialInstructions).slice(0, MAX_NOTE) || null;
  const { restaurant_id, table_id } = input.table;
  try {
    // Display-only restaurant fields, read once outside the transaction.
    const restaurant = await getDoc(doc(db, "restaurants", restaurant_id));
    const restaurantName = str(restaurant.data()?.["name"]) || "Restaurant";
    const restaurantImage = strOrNull(restaurant.data()?.["image_url"]);

    return await runTransaction(db, async (tx) => {
      // ---- Reads (Firestore needs every read before the first write) ----
      const rawTable = await readActiveTable(tx, input.table);
      const now = Date.now();
      const ts = new Date(now).toISOString();
      const { session, seat, mode } = joinSeating(rawTable, uid, name, now);

      const candidateId = strOrNull(
        mode === "single" ? session["current_order_id"] : seat["current_order_id"],
      );
      const candidateSnap =
        candidateId && SAFE_ID.test(candidateId)
          ? await tx.get(doc(db, "orders", candidateId))
          : null;
      const candidate = candidateSnap?.exists() ? candidateSnap.data() : null;
      const target =
        candidate &&
        candidate["order_type"] === "dine_in" &&
        isMap(candidate["dine_in"]) &&
        candidate["restaurant_id"] === restaurant_id &&
        candidate["dine_in"]["table_id"] === table_id &&
        candidate["dine_in"]["table_session_id"] === session["id"] &&
        ADDABLE_STATUSES.includes(candidate["status"]) &&
        (mode === "single" || candidate["dine_in"]["guest_id"] === uid)
          ? candidate
          : null;

      // ---- Writes ----
      const label = str(seat["label"]);
      const lines = buildLines(items, { guest_id: uid, label }, ts);
      const added = items.reduce((sum, i) => sum + i.quantity, 0);
      let result: PlaceOrderResult;

      if (target && candidateId) {
        const price = priceLines(
          [...Object.values(target["items"] ?? {}), ...Object.values(lines)] as {
            line_total: number;
          }[],
          {
            delivery_fee: num(target["delivery_fee"]),
            tax: num(target["tax"]),
            tip: num(target["tip"]),
            discount: num(target["discount"]),
          },
        );
        const existing = target["dine_in"]["contributors"]?.[uid];
        const event = timelineEvent("note", `${label} added ${describeItems(items)}`, label, ts);
        const patch: Raw = {
          ...price,
          updated_at: ts,
          [`timeline.${event.id}`]: event,
          [`dine_in.contributors.${uid}`]: {
            label,
            first_added_at: str(existing?.["first_added_at"]) || ts,
            item_count: count(existing?.["item_count"]) + added,
          },
        };
        for (const [id, line] of Object.entries(lines)) patch[`items.${id}`] = line;
        if (instructions) {
          patch["special_instructions"] = [
            str(target["special_instructions"]),
            `${label}: ${instructions}`,
          ]
            .filter(Boolean)
            .join("\n");
        }
        tx.update(doc(db, "orders", candidateId), patch);
        result = {
          order_id: candidateId,
          order_number: str(target["order_number"]),
          created: false,
          session_id: session["id"],
          guest_label: label,
          round: count(target["dine_in"]["round"]) || 1,
        };
      } else {
        const round = (mode === "single" ? session["order_count"] : count(seat["order_count"])) + 1;
        const order = newDineInOrder({
          table: {
            id: table_id,
            restaurant_id,
            label: str(rawTable["label"]) || input.table.table_label,
          },
          sessionId: session["id"],
          mode,
          uid,
          label,
          round,
          lines,
          added,
          instructions,
          restaurantName,
          restaurantImage,
          at: ts,
        });
        tx.set(doc(db, "orders", order.id), order);
        session["order_count"] += 1;
        session["order_ids"] = [...session["order_ids"], order.id];
        seat["order_count"] = count(seat["order_count"]) + 1;
        if (mode === "single") session["current_order_id"] = order.id;
        else seat["current_order_id"] = order.id;
        result = {
          order_id: order.id,
          order_number: order.order_number,
          created: true,
          session_id: session["id"],
          guest_label: label,
          round,
        };
      }

      session["guests"][uid] = seat;
      session["last_activity_at"] = ts;
      tx.update(doc(db, "restaurants", restaurant_id, "tables", table_id), { session });
      return result;
    });
  } catch (e) {
    throw toDineInError(e);
  }
}

function buildLines(
  items: CartItem[],
  addedBy: { guest_id: string; label: string },
  at: string,
): Raw {
  const lines: Raw = {};
  for (const item of items) {
    const id = randomId("ln");
    lines[id] = {
      id,
      item_id: item.item_id || id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: lineTotal(item),
      notes: item.notes,
      variant: item.variant,
      addons: item.addons,
      added_by: addedBy,
      added_at: at,
    };
  }
  return lines;
}

function describeItems(items: CartItem[]): string {
  return items.map((i) => `${i.name} ×${i.quantity}`).join(", ");
}

function timelineEvent(status: string, note: string, actor: string, at: string) {
  return { id: randomId("tl"), status, at, note, actor };
}

/** A new dine-in order record, field for field as the console writes one. */
function newDineInOrder(input: {
  table: { id: string; restaurant_id: string; label: string };
  sessionId: string;
  mode: OrderMode;
  uid: string;
  label: string;
  round: number;
  lines: Raw;
  added: number;
  instructions: string | null;
  restaurantName: string;
  restaurantImage: string | null;
  at: string;
}) {
  const { table, mode, uid, label, at } = input;
  const perGuest = mode === "multiple";
  const tableName = tableDisplayName(table.label);
  const price = priceLines(Object.values(input.lines));
  const placed = timelineEvent("placed", `Ordered at ${tableName} by ${label}`, label, at);
  return {
    id: randomId("ord"),
    order_number: newOrderNumber(),
    // Out of the kitchen until a waiter confirms it.
    status: WAITING_FOR_WAITER,
    order_type: "dine_in",
    placed_at: at,
    accepted_at: null,
    ready_at: null,
    driver_status: null,
    assigned_at: null,
    arrived_at_restaurant: null,
    picked_up_at: null,
    on_the_way_at: null,
    arrived_at_customer: null,
    delivered_at: null,
    cancelled_at: null,
    eta_minutes: null,
    eta_at: null,
    ...price,
    delivery_fee: 0,
    tax: 0,
    discount: 0,
    tip: 0,
    coupon_code: null,
    // Guests pay the waiter at the end; staff settle payment in the console.
    payment_method: "card",
    payment_status: "pending",
    delivery_address: null,
    special_instructions: input.instructions ? `${label}: ${input.instructions}` : null,
    scheduled_for: null,
    restaurant_id: table.restaurant_id,
    restaurant_name: input.restaurantName,
    restaurant_image: input.restaurantImage,
    branch_id: null,
    branch_name: null,
    // A multiple-mode order is one guest's; a single-mode order is the table's.
    customer_id: null,
    customer_name: perGuest ? label : tableName,
    customer_phone: null,
    customer_email: null,
    driver_id: null,
    driver_name: null,
    driver_phone: null,
    driver_photo: null,
    driver_rating: null,
    rejection_reason: null,
    rejected_by: null,
    rejected_at: null,
    created_at: at,
    updated_at: at,
    dine_in: {
      table_id: table.id,
      table_label: table.label,
      order_mode: mode,
      table_session_id: input.sessionId,
      guest_id: uid,
      guest_label: label,
      round: input.round,
      contributors: { [uid]: { label, first_added_at: at, item_count: input.added } },
      waiter_id: null,
      waiter_name: null,
      confirmed_at: null,
      confirmed_by: null,
    },
    items: input.lines,
    timeline: { [placed.id]: placed },
  };
}

/* ============================================================ order status */

/** Where an order is, for a progress bar. */
export const ORDER_STEPS = [
  "Waiting for the waiter",
  "Confirmed",
  "Sent to the kitchen",
  "Being prepared",
  "Ready",
  "Served",
] as const;

const STATUS: Record<string, { label: string; step: number }> = {
  waiting_for_waiter_confirmation: { label: "Waiting for the waiter to confirm", step: 0 },
  pending: { label: "Waiting for the waiter to confirm", step: 0 },
  waiter_confirmed: { label: "Confirmed by your waiter", step: 1 },
  accepted: { label: "Sent to the kitchen", step: 2 },
  preparing: { label: "Being prepared", step: 3 },
  ready: { label: "Ready — on its way to you", step: 4 },
  delivered: { label: "Served", step: 5 },
  rejected: { label: "Not accepted", step: -1 },
  cancelled: { label: "Cancelled", step: -1 },
  refunded: { label: "Refunded", step: -1 },
};

export interface GuestOrderLine extends CartItem {
  id: string;
  line_total: number;
  /** Who added it: "Customer 2", or null for a line the waiter added. */
  added_by_label: string | null;
  added_at: string | null;
  /** This guest added it. */
  mine: boolean;
}

export interface GuestOrder {
  id: string;
  /** "FF-123456" — what staff call the order. */
  order_number: string;
  status: string;
  status_label: string;
  /** Index into ORDER_STEPS, or -1 when rejected / cancelled / refunded. */
  step: number;
  /** The guest's next items still join this order. */
  open_for_additions: boolean;
  /** The table's (single) or the guest's (multiple) nth order this seating. */
  round: number;
  order_mode: OrderMode;
  table_session_id: string;
  guest_id: string;
  guest_label: string;
  /** Multiple mode: this guest's own order. Single mode: this guest started it. */
  mine: boolean;
  lines: GuestOrderLine[];
  subtotal: number;
  service_fee: number;
  total: number;
  special_instructions: string | null;
  rejection_reason: string | null;
  placed_at: string;
  updated_at: string;
}

function toGuestOrder(id: string, r: Raw, uid: string | null): GuestOrder {
  const d: Raw = isMap(r["dine_in"]) ? r["dine_in"] : {};
  const status = str(r["status"]);
  const known = STATUS[status] ?? { label: status.replace(/_/g, " "), step: -1 };
  const lines: GuestOrderLine[] = Object.values(isMap(r["items"]) ? r["items"] : {})
    .filter(isMap)
    .map((l) => ({
      id: str(l["id"]),
      item_id: str(l["item_id"]),
      name: str(l["name"]),
      quantity: count(l["quantity"]),
      unit_price: num(l["unit_price"]),
      line_total: num(l["line_total"]),
      notes: strOrNull(l["notes"]),
      variant: isMap(l["variant"]) ? (l["variant"] as OrderLineVariant) : null,
      addons: Array.isArray(l["addons"]) ? (l["addons"] as OrderLineAddon[]) : [],
      added_by_label: isMap(l["added_by"]) ? str(l["added_by"]["label"]) || null : null,
      added_at: strOrNull(l["added_at"]),
      mine: isMap(l["added_by"]) && l["added_by"]["guest_id"] === uid,
    }))
    .sort((a, b) => (a.added_at ?? "").localeCompare(b.added_at ?? ""));
  return {
    id,
    order_number: str(r["order_number"]),
    status,
    status_label: known.label,
    step: known.step,
    open_for_additions: ADDABLE_STATUSES.includes(status),
    round: count(d["round"]) || 1,
    order_mode: resolveOrderMode(d["order_mode"]),
    table_session_id: str(d["table_session_id"]),
    guest_id: str(d["guest_id"]),
    guest_label: str(d["guest_label"]),
    mine: d["guest_id"] === uid,
    lines,
    subtotal: num(r["subtotal"]),
    service_fee: num(r["service_fee"]),
    total: num(r["total"]),
    special_instructions: strOrNull(r["special_instructions"]),
    rejection_reason: strOrNull(r["rejection_reason"]),
    placed_at: str(r["placed_at"]),
    updated_at: str(r["updated_at"]),
  };
}

/** One order, live. Calls back with null if it disappears. */
export function watchOrder(
  orderId: string,
  onChange: (order: GuestOrder | null) => void,
  onError: (e: DineInError) => void,
): () => void {
  return onSnapshot(
    doc(db, "orders", orderId),
    (snap) =>
      onChange(
        snap.exists() ? toGuestOrder(snap.id, snap.data(), auth.currentUser?.uid ?? null) : null,
      ),
    (e) => onError(toDineInError(e)),
  );
}

export interface Bill {
  /** The seating the bill is for; null when the table is free (nothing ordered yet). */
  seating_id: string | null;
  order_mode: OrderMode;
  /** Single mode: the whole table's orders. Multiple mode: this guest's own. Oldest first. */
  orders: GuestOrder[];
  /** Everything not rejected, cancelled or refunded. */
  subtotal: number;
  service_fee: number;
  total: number;
  /** Some order is still waiting, cooking or not yet served. */
  has_open_orders: boolean;
}

/**
 * The running bill, live: every order in the current seating that this guest
 * pays for (the whole table's in single mode, their own in multiple mode),
 * with each order's status as it changes. Resets when staff clear the table.
 */
export function watchBill(
  table: TableContext,
  onChange: (bill: Bill) => void,
  onError: (e: DineInError) => void,
): () => void {
  const subs = new Map<string, () => void>();
  const orders = new Map<string, GuestOrder>();
  let state: TableState | null = null;

  const emit = () => {
    if (!state) return;
    const seating = state.seating;
    const uid = auth.currentUser?.uid ?? null;
    const shown = seating
      ? [...orders.values()]
          .filter((o) => o.table_session_id === seating.id)
          .filter((o) => seating.order_mode === "single" || o.guest_id === uid)
          .sort((a, b) => a.placed_at.localeCompare(b.placed_at))
      : [];
    const billable = shown.filter((o) => o.step !== -1);
    onChange({
      seating_id: seating?.id ?? null,
      order_mode: state.order_mode,
      orders: shown,
      subtotal: round2(billable.reduce((s, o) => s + o.subtotal, 0)),
      service_fee: round2(billable.reduce((s, o) => s + o.service_fee, 0)),
      total: round2(billable.reduce((s, o) => s + o.total, 0)),
      has_open_orders: shown.some((o) => o.step >= 0 && o.step < 5),
    });
  };

  const stopTable = watchTable(
    table,
    (next) => {
      state = next;
      const s = next.seating;
      const wanted = new Set(
        s
          ? [...s.order_ids, s.current_order_id, next.my_seat?.current_order_id].filter(
              (id): id is string => !!id && SAFE_ID.test(id),
            )
          : [],
      );
      for (const [id, stop] of subs) {
        if (wanted.has(id)) continue;
        stop();
        subs.delete(id);
        orders.delete(id);
      }
      for (const id of wanted) {
        if (subs.has(id)) continue;
        subs.set(
          id,
          watchOrder(
            id,
            (order) => {
              if (order) orders.set(id, order);
              else orders.delete(id);
              emit();
            },
            onError,
          ),
        );
      }
      emit();
    },
    onError,
  );

  return () => {
    stopTable();
    subs.forEach((stop) => stop());
    subs.clear();
  };
}

/* ============================================================ waiter calls */

export interface WaiterCall {
  id: string;
  /** open: waiting for a waiter · accepted: a waiter is on the way · resolved: done. */
  status: "open" | "accepted" | "resolved";
  message: string | null;
  request_count: number;
  /** The waiter who took it, once accepted. */
  accepted_by: string | null;
  created_at: string;
  last_requested_at: string;
}

export interface CallWaiterResult {
  request_id: string;
  /** false when the guest's call was still waiting and this pressed it again. */
  created: boolean;
  session_id: string;
  guest_label: string;
}

/**
 * The guest asks for a waiter ("Can we have the bill?"). Joins the seating the
 * way ordering does, so a guest who calls before ordering starts it. While
 * their call is still open or accepted, pressing again re-sends the same call
 * instead of opening a second one. Staff see it on the Dine-in orders and
 * Table overview pages.
 */
export async function callWaiter(input: {
  table: TableContext;
  /** Optional, up to 200 characters. Staff see "Customer needs assistance." without one. */
  message?: string | null;
  guestName?: string | null;
}): Promise<CallWaiterResult> {
  const uid = currentUid();
  const name = str(input.guestName).slice(0, MAX_NAME) || null;
  const message = str(input.message).slice(0, MAX_WAITER_MESSAGE) || null;
  const { restaurant_id, table_id } = input.table;
  try {
    const restaurant = await getDoc(doc(db, "restaurants", restaurant_id));
    const restaurantName = strOrNull(restaurant.data()?.["name"]);

    return await runTransaction(db, async (tx) => {
      // ---- Reads ----
      const rawTable = await readActiveTable(tx, input.table);
      const now = Date.now();
      const ts = new Date(now).toISOString();
      const { session, seat, mode } = joinSeating(rawTable, uid, name, now);
      const previousId = strOrNull(seat["waiter_request_id"]);
      const previousSnap =
        previousId && SAFE_ID.test(previousId)
          ? await tx.get(doc(db, "waiterRequests", previousId))
          : null;
      const previous = previousSnap?.exists() ? previousSnap.data() : null;

      // ---- Writes ----
      const label = str(seat["label"]);
      let result: CallWaiterResult;
      if (
        previous &&
        previousId &&
        previous["status"] !== "resolved" &&
        previous["table_session_id"] === session["id"] &&
        previous["table_id"] === table_id
      ) {
        // Pressed again while still waiting: the same call, asked once more.
        tx.update(doc(db, "waiterRequests", previousId), {
          request_count: (count(previous["request_count"]) || 1) + 1,
          last_requested_at: ts,
          updated_at: ts,
          ...(message ? { message } : {}),
        });
        result = {
          request_id: previousId,
          created: false,
          session_id: session["id"],
          guest_label: label,
        };
      } else {
        const id = randomId("wr");
        tx.set(doc(db, "waiterRequests", id), {
          id,
          restaurant_id,
          restaurant_name: restaurantName,
          table_id,
          table_label: str(rawTable["label"]) || input.table.table_label,
          table_session_id: session["id"],
          order_mode: mode,
          guest_id: uid,
          guest_label: label,
          customer_id: null,
          order_id: strOrNull(
            mode === "single" ? session["current_order_id"] : seat["current_order_id"],
          ),
          message,
          status: "open",
          request_count: 1,
          created_at: ts,
          last_requested_at: ts,
          accepted_at: null,
          accepted_by_id: null,
          accepted_by: null,
          resolved_at: null,
          resolved_by_id: null,
          resolved_by: null,
          updated_at: ts,
        });
        seat["waiter_request_id"] = id;
        result = { request_id: id, created: true, session_id: session["id"], guest_label: label };
      }

      session["guests"][uid] = seat;
      session["last_activity_at"] = ts;
      tx.update(doc(db, "restaurants", restaurant_id, "tables", table_id), { session });
      return result;
    });
  } catch (e) {
    throw toDineInError(e);
  }
}

/** The guest's waiter call, live (id from TableState.my_seat.waiter_request_id). */
export function watchWaiterCall(
  requestId: string,
  onChange: (call: WaiterCall | null) => void,
  onError: (e: DineInError) => void,
): () => void {
  return onSnapshot(
    doc(db, "waiterRequests", requestId),
    (snap) => {
      if (!snap.exists()) return onChange(null);
      const r: DocumentData = snap.data();
      const status = r["status"] === "accepted" || r["status"] === "resolved" ? r["status"] : "open";
      onChange({
        id: snap.id,
        status,
        message: strOrNull(r["message"]),
        request_count: count(r["request_count"]) || 1,
        accepted_by: strOrNull(r["accepted_by"]),
        created_at: str(r["created_at"]),
        last_requested_at: str(r["last_requested_at"]) || str(r["created_at"]),
      });
    },
    (e) => onError(toDineInError(e)),
  );
}
