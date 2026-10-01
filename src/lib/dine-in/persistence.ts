// Scan persistence layer: survives scanner-browser closes, restarts, and
// storage wipes on iPhone/Android. Combines five strategies:
//   1. localStorage  — normal browsers keep it
//   2. sessionStorage — survives page reloads within the same session
//   3. IndexedDB      — higher quota, kept by some browsers that purge LS
//   4. URL fragment   — the user's QR link carries a compact recovery token
//   5. open-in-browser prompt — detected scanner browsers offer to open in
//                               Safari / Chrome, where storage really sticks

import { str, strOrNull, isMap, SAFE_ID } from "./core";

/* =============================================================== types */

export interface ScanRecord {
  token: string;
  restaurant_id: string;
  restaurant_name: string | null;
  table_id: string;
  table_label: string;
  scanned_at: string;
  last_visited_at: string;
}

export interface PersistenceState {
  guest_name: string | null;
  guest_uid_hint: string | null;
  scan_history: ScanRecord[];
  carts: Record<string, unknown>;
  scanner_prompt_dismissed_at: string | null;
}

export type BrowserEnvironment =
  | "safari"
  | "chrome"
  | "edge"
  | "firefox"
  | "samsung"
  | "scanner_unknown"
  | "wechat"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "whatsapp"
  | "line"
  | "snapchat"
  | "twitter"
  | "linkedin"
  | "qq"
  | "weibo"
  | "other";

/* ======================================================== environment */

const EMPTY: PersistenceState = {
  guest_name: null,
  guest_uid_hint: null,
  scan_history: [],
  carts: {},
  scanner_prompt_dismissed_at: null,
};

const STORAGE_KEY = "hearth-dine-in:persistence:v1";
const SESSION_KEY = "hearth-dine-in:persistence:session:v1";
const FRAGMENT_PREFIX = "h=";
const MAX_HISTORY = 20;

let uaCache: string | null = null;
const ua = (): string => {
  if (uaCache !== null) return uaCache;
  try {
    uaCache = (navigator?.userAgent ?? "") + " " + (navigator?.vendor ?? "");
  } catch {
    uaCache = "";
  }
  return uaCache;
};

export function detectBrowser(): BrowserEnvironment {
  const u = ua().toLowerCase();
  if (!u) return "other";
  if (/micromessenger|wechat/.test(u)) return "wechat";
  if (/fbav|fban|facebook|fb_iab/.test(u)) return "facebook";
  if (/instagram/.test(u)) return "instagram";
  if (/musical_ly|tiktok|trill/.test(u)) return "tiktok";
  if (/whatsapp/.test(u)) return "whatsapp";
  if (/line\//.test(u)) return "line";
  if (/snapchat/.test(u)) return "snapchat";
  if (/twitter|xapid\//.test(u)) return "twitter";
  if (/linkedin/.test(u)) return "linkedin";
  if (/qq\//.test(u)) return "qq";
  if (/weibo/.test(u)) return "weibo";
  if (/samsungbrowser/.test(u)) return "samsung";
  if (/edg|edga|edgios/.test(u)) return "edge";
  if (/firefox|fxios/.test(u)) return "firefox";
  if (/chrome|crios|chromium/.test(u)) {
    if (/(iphone|ipad|ipod).*version\/[\d.]+.*safari/.test(u)) return "safari";
    return "chrome";
  }
  if (/version\/[\d.]+.*safari/.test(u)) return "safari";
  const appWebView = /applewebkit.*mobile(?!.*safari)/.test(u);
  if (appWebView) return "scanner_unknown";
  return "other";
}

const SCANNER_BROWSERS: BrowserEnvironment[] = [
  "scanner_unknown",
  "wechat",
  "facebook",
  "instagram",
  "tiktok",
  "whatsapp",
  "line",
  "snapchat",
  "twitter",
  "linkedin",
  "qq",
  "weibo",
];

export function isScannerBrowser(): boolean {
  return SCANNER_BROWSERS.includes(detectBrowser());
}

export function isStandaloneOrNative(): boolean {
  try {
    return (
      // @ts-expect-error - PWA iOS Safari
      window.navigator.standalone === true ||
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
      window.matchMedia?.("(display-mode: minimal-ui)").matches === true
    );
  } catch {
    return false;
  }
}

export function recommendOpenIn(): "safari" | "chrome" | null {
  const env = detectBrowser();
  const isIOS = /iphone|ipad|ipod/i.test(ua());
  const isAndroid = /android/i.test(ua());
  if (isStandaloneOrNative()) return null;
  if (isIOS) {
    if (env !== "safari" && env !== "other") return "safari";
    return null;
  }
  if (isAndroid) {
    if (
      env !== "chrome" &&
      env !== "samsung" &&
      env !== "edge" &&
      env !== "firefox" &&
      env !== "other"
    ) {
      return "chrome";
    }
    return null;
  }
  return null;
}

/* ====================================================== storage layers */

const safeLSGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeLSSet = (k: string, v: string): boolean => {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
};
const safeLSDel = (k: string): void => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};

const safeSSGet = (k: string): string | null => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSSSet = (k: string, v: string): boolean => {
  try {
    sessionStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
};

/* ---------------- IndexedDB layer, promise-based ------------------- */

let idbPromise: Promise<IDBDatabase | null> | null = null;
const IDB_NAME = "hearth-dine-in";
const IDB_VERSION = 1;
const IDB_STORE = "persistence";

function openIdb(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  if (typeof indexedDB === "undefined") {
    idbPromise = Promise.resolve(null);
    return idbPromise;
  }
  idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

async function idbGet(): Promise<PersistenceState | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(STORAGE_KEY);
      req.onsuccess = () => resolve(normalizeState(req.result ?? null));
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(value: PersistenceState): Promise<boolean> {
  const db = await openIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.put(value, STORAGE_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/* ================================================== state normalize */

function normalizeState(raw: unknown): PersistenceState {
  if (!isMap(raw)) return { ...EMPTY };
  const history = Array.isArray((raw as Raw)["scan_history"])
    ? ((raw as Raw)["scan_history"] as unknown[])
        .filter(isMap)
        .map((r) => ({
          token: str(r["token"]),
          restaurant_id: str(r["restaurant_id"]),
          restaurant_name: strOrNull(r["restaurant_name"]),
          table_id: str(r["table_id"]),
          table_label: str(r["table_label"]),
          scanned_at: str(r["scanned_at"]),
          last_visited_at: str(r["last_visited_at"]),
        }))
        .filter(
          (r) => SAFE_ID.test(r.token) && SAFE_ID.test(r.restaurant_id) && SAFE_ID.test(r.table_id),
        )
    : [];
  const carts = isMap((raw as Raw)["carts"])
    ? ((raw as Raw)["carts"] as Record<string, unknown>)
    : {};
  return {
    guest_name: strOrNull((raw as Raw)["guest_name"]),
    guest_uid_hint: strOrNull((raw as Raw)["guest_uid_hint"]),
    scan_history: history.slice(0, MAX_HISTORY),
    carts,
    scanner_prompt_dismissed_at: strOrNull((raw as Raw)["scanner_prompt_dismissed_at"]),
  };
}

function mergeStates(a: PersistenceState, b: PersistenceState): PersistenceState {
  const historyMap = new Map<string, ScanRecord>();
  for (const r of [...a.scan_history, ...b.scan_history]) {
    const existing = historyMap.get(r.token);
    if (
      !existing ||
      new Date(r.last_visited_at || 0).getTime() > new Date(existing.last_visited_at || 0).getTime()
    ) {
      historyMap.set(r.token, r);
    }
  }
  const history = [...historyMap.values()]
    .sort(
      (a, b) =>
        new Date(b.last_visited_at || 0).getTime() - new Date(a.last_visited_at || 0).getTime(),
    )
    .slice(0, MAX_HISTORY);
  return {
    guest_name: a.guest_name || b.guest_name,
    guest_uid_hint: a.guest_uid_hint || b.guest_uid_hint,
    scan_history: history,
    carts: { ...b.carts, ...a.carts },
    scanner_prompt_dismissed_at: a.scanner_prompt_dismissed_at || b.scanner_prompt_dismissed_at,
  };
}

/* =========================================== public read / write API */

export async function loadState(): Promise<PersistenceState> {
  const lsRaw = safeLSGet(STORAGE_KEY);
  const lsState = lsRaw ? normalizeState(safeJSONParse(lsRaw)) : null;
  const ssRaw = safeSSGet(SESSION_KEY);
  const ssState = ssRaw ? normalizeState(safeJSONParse(ssRaw)) : null;
  const idbState = await idbGet();
  const fragState = parseFragment();
  let merged: PersistenceState = { ...EMPTY };
  if (idbState) merged = mergeStates(merged, idbState);
  if (lsState) merged = mergeStates(merged, lsState);
  if (ssState) merged = mergeStates(merged, ssState);
  if (fragState) merged = mergeStates(merged, fragState);
  return merged;
}

export async function saveState(partial: Partial<PersistenceState>): Promise<PersistenceState> {
  const current = await loadState();
  const next: PersistenceState = {
    ...current,
    ...partial,
    scan_history: partial.scan_history ?? current.scan_history,
    carts: partial.carts ?? current.carts,
  };
  if (next.scan_history.length > MAX_HISTORY) {
    next.scan_history = next.scan_history.slice(0, MAX_HISTORY);
  }
  const json = JSON.stringify(next);
  safeLSSet(STORAGE_KEY, json);
  safeSSSet(SESSION_KEY, json);
  await idbPut(next);
  return next;
}

/* =========================== scan history convenience helpers ================= */

export function recordScan(
  state: PersistenceState,
  record: Omit<ScanRecord, "scanned_at" | "last_visited_at">,
): PersistenceState {
  const now = new Date().toISOString();
  const existing = state.scan_history.find((r) => r.token === record.token);
  let next: ScanRecord;
  if (existing) {
    next = {
      ...existing,
      ...record,
      last_visited_at: now,
    };
  } else {
    next = {
      ...record,
      scanned_at: now,
      last_visited_at: now,
    };
  }
  const rest = state.scan_history.filter((r) => r.token !== record.token);
  const history = [next, ...rest].slice(0, MAX_HISTORY);
  return { ...state, scan_history: history };
}

export function recordScanVisit(state: PersistenceState, token: string): PersistenceState {
  const now = new Date().toISOString();
  const history = state.scan_history.map((r) =>
    r.token === token ? { ...r, last_visited_at: now } : r,
  );
  return { ...state, scan_history: history };
}

export function getCart<T>(state: PersistenceState, token: string): T | null {
  const raw = state.carts[token];
  return (raw as T | null) ?? null;
}

export function setCart(state: PersistenceState, token: string, value: unknown): PersistenceState {
  const next = { ...state.carts };
  if (value === null || (Array.isArray(value) && value.length === 0)) {
    delete next[token];
  } else {
    next[token] = value;
  }
  return { ...state, carts: next };
}

/* ========================================== fragment recovery token ================= */

// URL fragment: #h=<base64url of gzipped? json> — kept compact, only carries
// the essentials needed to recognise the guest and their most recent scan.

type Raw = Record<string, unknown>;

function safeJSONParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function b64urlEncode(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return "";
  }
}

function b64urlDecode(s: string): string | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function buildRecoveryFragment(state: PersistenceState, token?: string): string | null {
  const payload: Raw = { ["v"]: 1 };
  if (state.guest_name) payload["n"] = state.guest_name;
  if (state.guest_uid_hint) payload["u"] = state.guest_uid_hint;
  const last = token
    ? (state.scan_history.find((r) => r.token === token) ?? state.scan_history[0])
    : state.scan_history[0];
  if (last) {
    payload["t"] = last.token;
    payload["r"] = last.restaurant_id;
    payload["i"] = last.table_id;
    payload["l"] = last.table_label;
    payload["m"] = last.restaurant_name ?? undefined;
  }
  const json = JSON.stringify(payload);
  if (json.length < 6) return null;
  const encoded = b64urlEncode(json);
  return encoded ? `${FRAGMENT_PREFIX}${encoded}` : null;
}

export function setRecoveryFragmentIfScanner(state: PersistenceState, token: string): boolean {
  if (!isScannerBrowser()) return false;
  const frag = buildRecoveryFragment(state, token);
  if (!frag) return false;
  try {
    const url = new URL(window.location.href);
    url.hash = frag;
    window.history.replaceState(null, "", url.toString());
    return true;
  } catch {
    return false;
  }
}

export function parseFragment(): PersistenceState | null {
  try {
    let raw = window.location.hash || "";
    if (raw.startsWith("#")) raw = raw.slice(1);
    if (!raw.startsWith(FRAGMENT_PREFIX)) return null;
    const payload = raw.slice(FRAGMENT_PREFIX.length);
    const decoded = b64urlDecode(payload);
    if (!decoded) return null;
    const parsed = safeJSONParse(decoded);
    if (!isMap(parsed)) return null;
    const token = str(parsed["t"]);
    const restaurant_id = str(parsed["r"]);
    const table_id = str(parsed["i"]);
    const table_label = str(parsed["l"]);
    if (!SAFE_ID.test(token) || !SAFE_ID.test(restaurant_id) || !SAFE_ID.test(table_id)) {
      return {
        ...EMPTY,
        guest_name: strOrNull(parsed["n"]),
        guest_uid_hint: strOrNull(parsed["u"]),
      };
    }
    const now = new Date().toISOString();
    const record: ScanRecord = {
      token,
      restaurant_id,
      restaurant_name: strOrNull(parsed["m"]),
      table_id,
      table_label,
      scanned_at: now,
      last_visited_at: now,
    };
    return {
      guest_name: strOrNull(parsed["n"]),
      guest_uid_hint: strOrNull(parsed["u"]),
      scan_history: [record],
      carts: {},
      scanner_prompt_dismissed_at: null,
    };
  } catch {
    return null;
  }
}

/* ============================================ recovery URL for "open in browser" */

export function buildOpenInBrowserUrl(target: "safari" | "chrome"): string {
  const recovery = buildRecoveryFragment(currentCache, currentCache?.scan_history[0]?.token);
  try {
    const url = new URL(window.location.href);
    if (recovery) url.hash = recovery;
    const href = url.toString();
    if (target === "safari") return href;
    if (target === "chrome") {
      if (/iphone|ipad|ipod/i.test(ua())) {
        return `googlechrome://${href.replace(/^https?:\/\//, "")}`;
      }
      return href;
    }
    return href;
  } catch {
    return window.location.href;
  }
}

let currentCache: PersistenceState = { ...EMPTY };
export function _setCacheForBuild(s: PersistenceState) {
  currentCache = s;
}

/* ======================================================== prompt dismissal */

export const PROMPT_REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowScannerPrompt(state: PersistenceState): boolean {
  if (!isScannerBrowser()) return false;
  if (isStandaloneOrNative()) return false;
  if (!state.scanner_prompt_dismissed_at) return true;
  const t = Date.parse(state.scanner_prompt_dismissed_at);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > PROMPT_REMIND_AFTER_MS;
}

export async function dismissScannerPrompt(): Promise<void> {
  await saveState({ scanner_prompt_dismissed_at: new Date().toISOString() });
}

/* =================================================== uid hint storage */

export function rememberUid(state: PersistenceState, uid: string): PersistenceState {
  if (!SAFE_ID.test(uid)) return state;
  return { ...state, guest_uid_hint: uid };
}
