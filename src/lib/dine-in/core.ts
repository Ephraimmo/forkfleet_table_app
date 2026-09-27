// Dine-in data layer, part 1 of 3: basics, errors, signing the guest in,
// opening the table from its QR code, and the restaurant.
//
// The data belongs to the Hearth Admin console (repo fleet-admin-hub). These
// files follow its contract field for field: the console's waiter screens,
// kitchen board and table overview read exactly what is written here. Build
// the UI on the exports of "@/lib/dine-in", never call Firestore from
// anywhere else, and never rename a field.

import { signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

/* ================================================================== basics */

export type OrderMode = "single" | "multiple";

export type DineInErrorCode =
  | "dine-in/invalid-code" // no such QR code
  | "dine-in/code-revoked" // the table's code was regenerated, or the guest scanned another table
  | "dine-in/table-inactive" // the table isn't taking orders
  | "dine-in/table-not-found"
  | "dine-in/invalid-items"
  | "dine-in/not-signed-in"
  | "dine-in/unavailable"; // network or Firebase trouble

/** Every error the data layer throws or reports. `message` is ready to show to the guest. */
export class DineInError extends Error {
  readonly code: DineInErrorCode;
  constructor(code: DineInErrorCode, message: string) {
    super(message);
    this.name = "DineInError";
    this.code = code;
  }
}

export const WAITING_FOR_WAITER = "waiting_for_waiter_confirmation";
/** A seating nobody has ordered in (or called a waiter from) for this long is over. */
export const SESSION_IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
export const SERVICE_FEE_RATE = 0.05;
export const MAX_ITEMS_PER_ORDER = 50;
export const MAX_QUANTITY = 99;
export const MAX_NOTE = 500;
export const MAX_NAME = 60;
export const MAX_WAITER_MESSAGE = 200;

// ---- Small helpers shared by the data-layer files (the UI doesn't need them).

export const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const QR_TOKEN = /^[A-Za-z0-9_-]{32}$/;
/** An order still takes new items only while it waits for the waiter. */
export const ADDABLE_STATUSES = [WAITING_FOR_WAITER, "pending"];

export type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
export const strOrNull = (v: unknown): string | null => str(v) || null;
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const count = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};
export const isMap = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function randomId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Date.now().toString(36)}${Array.from(bytes, (b) => (b % 36).toString(36)).join("")}`;
}

/** "FF-" plus six random digits, as the console numbers orders. */
export function newOrderNumber(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return `FF-${String(bytes[0]! % 1_000_000).padStart(6, "0")}`;
}

// ---- Public helpers.

export function resolveOrderMode(raw: unknown): OrderMode {
  return raw === "multiple" ? "multiple" : "single";
}

/** "12" -> "Table 12"; "Patio 3" stays as it is. */
export function tableDisplayName(label: string): string {
  const trimmed = label.trim();
  return /^\d+[a-z]?$/i.test(trimmed) ? `Table ${trimmed}` : trimmed;
}

/** R 129,00 — the restaurant's currency, South African formatting. */
export function formatMoney(amount: number, currency = "ZAR"): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: currency || "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const invalidCode = () =>
  new DineInError(
    "dine-in/invalid-code",
    "This code isn't valid. Please ask a member of staff for help.",
  );
export const revokedCode = () =>
  new DineInError(
    "dine-in/code-revoked",
    "This table's code has changed. Scan the QR code on your table again.",
  );

/** Turn anything Firebase throws into a DineInError the UI can show as is. */
export function toDineInError(e: unknown): DineInError {
  if (e instanceof DineInError) return e;
  const code = String((e as { code?: string } | null)?.code ?? "");
  if (code === "permission-denied" || code === "firestore/permission-denied") return revokedCode();
  if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") {
    // Anonymous sign-in is switched off in the Firebase project.
    console.error("[dine-in] Enable Anonymous sign-in in Firebase Authentication.", e);
    return new DineInError(
      "dine-in/unavailable",
      "Ordering from your phone isn't switched on yet. Please ask a member of staff.",
    );
  }
  if (code === "unauthenticated") {
    return new DineInError("dine-in/not-signed-in", "Please reload the page and try again.");
  }
  console.error("[dine-in]", e);
  return new DineInError(
    "dine-in/unavailable",
    "We can't reach the restaurant right now. Check your connection and try again.",
  );
}

export function currentUid(): string {
  const uid = auth.currentUser?.uid ?? "";
  if (!SAFE_ID.test(uid)) {
    throw new DineInError("dine-in/not-signed-in", "Please reload the page and try again.");
  }
  return uid;
}

/* ===================================================== sign-in and the table */

/**
 * Sign the guest in anonymously, or reuse the session this browser already
 * has. The uid is the guest's identity at the table ("Customer 2"), so a
 * reload must keep it: wait for Firebase to restore the session first.
 */
export async function signInGuest(): Promise<string> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  const { user } = await signInAnonymously(auth);
  return user.uid;
}

/** Where the guest is sitting — taken only from the scanned QR code. */
export interface TableContext {
  token: string;
  restaurant_id: string;
  table_id: string;
  /** As staff typed it: "12", "Patio 3". */
  table_label: string;
  /** How to show it: "Table 12", "Patio 3". */
  table_name: string;
  /** The table's mode. Once a seating is open its own mode applies (TableState.order_mode). */
  order_mode: OrderMode;
  active: boolean;
}

/**
 * Step 1 on /dine-in/:token. Signs the guest in, looks the code up, and saves
 * the guest's pass (dineInGuests/{uid}), which is what lets them read this
 * restaurant and table and order there. Throws DineInError "dine-in/invalid-code"
 * for an unknown code. An inactive table still opens (active: false), so the
 * menu can be shown without ordering.
 */
export async function openTable(token: string): Promise<TableContext> {
  if (!QR_TOKEN.test(token)) throw invalidCode();
  try {
    const uid = await signInGuest();
    const snap = await getDoc(doc(db, "tableQrTokens", token));
    if (!snap.exists()) throw invalidCode();
    const r = snap.data();
    const restaurant_id = str(r["restaurant_id"]);
    const table_id = str(r["table_id"]);
    if (!SAFE_ID.test(restaurant_id) || !SAFE_ID.test(table_id)) throw invalidCode();
    await setDoc(doc(db, "dineInGuests", uid), {
      token,
      restaurant_id,
      table_id,
      updated_at: new Date().toISOString(),
    });
    const label = str(r["table_label"]) || table_id;
    return {
      token,
      restaurant_id,
      table_id,
      table_label: label,
      table_name: tableDisplayName(label),
      order_mode: resolveOrderMode(r["order_mode"]),
      active: r["active"] !== false,
    };
  } catch (e) {
    throw toDineInError(e);
  }
}

/* ============================================================== restaurant */

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string | null;
  /** Cover photo. */
  image_url: string | null;
  currency: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  /** "08:00" / "22:00". */
  opens_at: string | null;
  closes_at: string | null;
}

/** The restaurant the guest is seated at (call after openTable). */
export async function getRestaurant(restaurantId: string): Promise<Restaurant> {
  try {
    const snap = await getDoc(doc(db, "restaurants", restaurantId));
    const r: Raw = snap.exists() ? snap.data() : {};
    return {
      id: restaurantId,
      name: str(r["name"]) || "Restaurant",
      cuisine: strOrNull(r["cuisine"]),
      image_url: strOrNull(r["image_url"]),
      currency: str(r["currency"]) || "ZAR",
      address: strOrNull(r["address"]),
      city: strOrNull(r["city"]),
      phone: strOrNull(r["phone"]),
      opens_at: strOrNull(r["opens_at"]),
      closes_at: strOrNull(r["closes_at"]),
    };
  } catch (e) {
    throw toDineInError(e);
  }
}
