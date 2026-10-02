// The Hearth look, shared by every dine-in screen: logo, full-screen panels,
// steppers, option chips, status pills and the centred state screens.
// Class sets live in ./styles, the ticking clock in ./time.

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, Minus, Plus, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORDER_STEPS, type GuestOrder } from "@/lib/dine-in";

/* -------------------------------------------------------------- the logo */

export function FlameMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#fff"
        d="M12.1 1.6c.5 3.4 3.6 5.4 5.3 8.4 1.2 2.1 1.6 4.2 1.1 6.3-.8 3.4-3.6 5.8-6.6 5.8-3.6 0-6.6-2.8-6.6-6.6 0-2.5 1.2-4.5 2.7-6 .1 1.6.8 2.9 1.9 3.6-.4-3.8.7-8.2 2.2-11.5Z"
      />
      <path
        fill="var(--primary)"
        d="M12 12.4c1 1.7 2.9 3 2.9 5.4 0 1.7-1.3 3-2.9 3s-2.9-1.3-2.9-3c0-1.8 1.4-3 2.9-5.4Z"
      />
    </svg>
  );
}

/** The orange tile with the white flame. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-[linear-gradient(145deg,oklch(0.74_0.18_46),var(--primary))] shadow-[0_10px_30px_-12px_var(--primary)]",
        className,
      )}
    >
      <FlameMark className="size-[62%]" />
    </span>
  );
}

/** Small logo for the top bar: tile, "Hearth", and the product word in orange. */
export function HeaderLogo({ product = "Dine-in" }: { product?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoTile className="size-11 rounded-xl" />
      <div className="leading-[1.1]">
        <p className="text-[19px] font-bold tracking-tight text-foreground">Hearth</p>
        <p className="text-[19px] font-bold tracking-tight text-brand">{product}</p>
      </div>
    </div>
  );
}

/** The big stacked logo from the sign-in screen. */
export function HeroLogo({ product = "Dine-in" }: { product?: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <LogoTile className="size-24 rounded-[1.6rem]" />
      <p className="mt-5 bg-[linear-gradient(180deg,var(--brand-light),var(--brand))] bg-clip-text text-[44px] font-extrabold leading-none tracking-tight text-transparent">
        Hearth
      </p>
      <p className="mt-1 text-[34px] font-extrabold leading-none tracking-tight text-brand">
        {product}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- avatar */

/** Initials of the name the guest gave, else a person icon; dot for open / closed. */
export function Avatar({ name, online }: { name: string | null; online?: boolean }) {
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,var(--surface),var(--field))] text-sm font-semibold text-foreground ring-2 ring-border">
      {initials || <User className="size-5 text-muted-foreground" />}
      {online !== undefined ? (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background",
            online ? "bg-online" : "bg-offline",
          )}
        />
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------- panel */

/**
 * A full-screen page that slides in over the app, with the back arrow and
 * title the design uses for "Add Item", "Steak", "Edit order" and so on.
 */
export function Panel(props: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  centerTitle?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-background outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-300"
        >
          <header className="flex shrink-0 items-center gap-2 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <Dialog.Close
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Back"
            >
              <ArrowLeft className="size-6" />
            </Dialog.Close>
            <Dialog.Title
              className={cn(
                "min-w-0 flex-1 truncate text-[19px] font-semibold tracking-tight",
                props.centerTitle && "pr-11 text-center",
              )}
            >
              {props.title}
            </Dialog.Title>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
            {props.children}
          </div>
          {props.footer ? (
            <div className="shrink-0 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_24px_-12px_rgb(0_0_0/0.6)]">
              {props.footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* --------------------------------------------------------------- stepper */

/** − 1 + : raised keys either side of the value, as on "Extras". */
export function Stepper(props: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
  /** Show a bin instead of − when the next step removes the line. */
  removable?: boolean;
  size?: "md" | "sm";
}) {
  const key = props.size === "sm" ? "size-10" : "size-11";
  const atMin = props.value <= props.min;
  const showBin = props.removable && props.value <= 1;
  return (
    <div className="inline-flex shrink-0 items-center rounded-xl border border-border bg-field p-0.5">
      <button
        type="button"
        className={cn(
          key,
          "flex items-center justify-center rounded-[0.6rem] border border-input bg-surface text-foreground transition-colors hover:bg-surface/70 disabled:opacity-40",
        )}
        aria-label={showBin ? `Remove ${props.label}` : `Fewer ${props.label}`}
        disabled={atMin && !showBin}
        onClick={() => props.onChange(props.value - 1)}
      >
        {showBin ? <Trash2 className="size-[18px]" /> : <Minus className="size-5" />}
      </button>
      <span className="w-10 text-center text-base font-semibold tabular-nums" aria-live="polite">
        {props.value}
      </span>
      <button
        type="button"
        className={cn(
          key,
          "flex items-center justify-center rounded-[0.6rem] border border-input bg-surface text-foreground transition-colors hover:bg-surface/70 disabled:opacity-40",
        )}
        aria-label={`More ${props.label}`}
        disabled={props.value >= props.max}
        onClick={() => props.onChange(props.value + 1)}
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- chips */

/** An option tile: "Small", "Medium +R20". Blue when picked. */
export function OptionChip(props: {
  picked: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  hint?: string | null;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.picked}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-colors disabled:opacity-40",
        props.picked
          ? "border-info-line bg-info-soft text-foreground shadow-[0_0_0_1px_var(--info-line),0_6px_18px_-8px_var(--info-line)]"
          : "border-border bg-card text-foreground/90 hover:bg-surface",
      )}
    >
      <span className="text-[15px] font-medium leading-tight">{props.label}</span>
      {props.hint ? (
        <span
          className={cn(
            "mt-0.5 text-xs tabular-nums",
            props.picked ? "text-info-text" : "text-muted-foreground",
          )}
        >
          {props.hint}
        </span>
      ) : null}
    </button>
  );
}

/* --------------------------------------------------------- order status */

const STEP_STYLE = [
  "bg-stat-pink/15 text-stat-pink ring-1 ring-inset ring-stat-pink/30", // waiting
  "bg-info text-white", // confirmed
  "bg-kitchen text-white", // sent to the kitchen
  "bg-stat-yellow/15 text-stat-yellow ring-1 ring-inset ring-stat-yellow/30", // preparing
  "bg-success text-[oklch(0.2_0.05_150)]", // ready
  "bg-surface text-muted-foreground ring-1 ring-inset ring-input", // served
];
/** Pill wording from the design, one per ORDER_STEPS entry. */
const STEP_PILL = ["To confirm", "Confirmed", "Sent to kitchen", "Preparing", "Ready", "Served"];
const STEP_BAR = [
  "bg-stat-pink",
  "bg-info-line",
  "bg-[oklch(0.6_0.17_292)]",
  "bg-stat-yellow",
  "bg-success",
  "bg-success",
];

export function StatusPill({ order, className }: { order: GuestOrder; className?: string }) {
  const failed = order.step < 0;
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-semibold",
        failed
          ? "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30"
          : STEP_STYLE[order.step],
        className,
      )}
    >
      {failed ? order.status_label : STEP_PILL[order.step]}
    </span>
  );
}

/** Six segments, filled up to the order's step. */
export function StatusBar({ order }: { order: GuestOrder }) {
  if (order.step < 0) return null;
  const color = STEP_BAR[order.step];
  return (
    <div className="flex gap-1" aria-hidden>
      {ORDER_STEPS.map((label, i) => (
        <span
          key={label}
          className={cn("h-1.5 flex-1 rounded-full", i <= order.step ? color : "bg-surface")}
        />
      ))}
    </div>
  );
}

/** The small purple badge in front of "FF-123456 · Customer 2". */
export function GuestBadge() {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-guest/20 text-guest">
      <User className="size-3.5" strokeWidth={2.5} />
    </span>
  );
}

/* ---------------------------------------------------------- state screen */

/** Centred icon, title, text and actions: "Access unavailable" and friends. */
export function StateScreen(props: {
  icon: ReactNode;
  tone?: "danger" | "brand" | "neutral";
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const tone = props.tone ?? "neutral";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div
          className={cn(
            "mx-auto flex size-20 items-center justify-center rounded-full [&_svg]:size-9",
            tone === "danger" && "bg-danger-soft text-white",
            tone === "brand" && "bg-primary/15 text-primary",
            tone === "neutral" && "bg-surface text-muted-foreground",
          )}
        >
          {props.icon}
        </div>
        <h1 className="mt-6 text-[22px] font-semibold tracking-tight">{props.title}</h1>
        {props.children ? (
          <div className="mt-3 text-[15px] leading-relaxed text-foreground/75">
            {props.children}
          </div>
        ) : null}
        {props.actions ? <div className="mt-10 space-y-3">{props.actions}</div> : null}
      </div>
    </div>
  );
}
