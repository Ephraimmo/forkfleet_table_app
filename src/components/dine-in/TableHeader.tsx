import { Moon, Sun, SunMoon, TriangleAlert, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAX_NAME } from "@/lib/dine-in";
import { useTheme } from "@/hooks/use-theme";
import type { ThemePreference } from "@/lib/theme";
import { useDineIn } from "./context";
import { Avatar, HeaderLogo } from "./ui";
import { field } from "./styles";

const THEME_STEPS: Record<
  ThemePreference,
  { next: ThemePreference; label: string; icon: typeof Sun }
> = {
  auto: { next: "light", label: "Auto — light by day, dark at night", icon: SunMoon },
  light: { next: "dark", label: "Light", icon: Sun },
  dark: { next: "auto", label: "Dark", icon: Moon },
};

/** Cycles Auto → Light → Dark. */
function ThemeButton() {
  const { preference, setPreference } = useTheme();
  const step = THEME_STEPS[preference];
  const Icon = step.icon;
  return (
    <button
      type="button"
      onClick={() => {
        setPreference(step.next);
        toast(`Theme: ${THEME_STEPS[step.next].label}`, { duration: 1800 });
      }}
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
      aria-label={`Theme: ${step.label}. Tap to change.`}
      title={`Theme: ${step.label}`}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}

export function TableHeader() {
  const { restaurant, table, tableState, guestName, setGuestName, ordersTaken } = useDineIn();
  const tableName = tableState?.name ?? table.table_name;
  const who = guestName.trim() || tableState?.my_seat?.label || "Guest";

  return (
    <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3">
        <HeaderLogo />
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 text-right">
            <p className="truncate text-[17px] font-semibold leading-tight">{who}</p>
            <p className="truncate text-[13px] text-muted-foreground">{tableName}</p>
          </div>
          <Avatar name={guestName.trim() || null} online={ordersTaken} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold tracking-tight">{restaurant.name}</h1>
          {restaurant.cuisine ? (
            <p className="truncate text-[13px] text-muted-foreground">{restaurant.cuisine}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ThemeButton />
          <span className="inline-flex items-center gap-2 text-[15px] font-medium">
            <span
              className={cn(
                "size-2.5 rounded-full",
                ordersTaken ? "bg-online shadow-[0_0_10px_var(--online)]" : "bg-offline",
              )}
            />
            {ordersTaken ? "Taking orders" : "Not taking orders"}
          </span>
        </div>
      </div>

      {!ordersTaken ? (
        <div className="mt-4 flex gap-3 rounded-2xl border border-warning-line bg-warning-soft p-4">
          <TriangleAlert className="size-7 shrink-0 fill-warning-text text-warning-soft" />
          <div className="min-w-0">
            <p className="text-[17px] font-semibold text-warning-text">Not taking orders</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/85">
              {tableName} isn't taking orders right now. You can look at the menu, and a member of
              staff can help you order.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <label htmlFor="guest-name" className="mb-1.5 block text-[13px] text-muted-foreground">
          Your first name, so the waiter knows who's who (optional)
        </label>
        <div className="relative">
          <User className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="guest-name"
            maxLength={MAX_NAME}
            value={guestName}
            placeholder="e.g. Karabo"
            autoComplete="given-name"
            onChange={(e) => setGuestName(e.target.value)}
            className={cn(field, "h-12 pl-12")}
          />
        </div>
      </div>
    </header>
  );
}
