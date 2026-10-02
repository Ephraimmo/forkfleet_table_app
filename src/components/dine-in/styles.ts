// Class sets for the Hearth look (buttons, cards, inputs), used across the dine-in screens.

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-[0_10px_24px_-14px_var(--primary)] transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-input bg-surface px-4 text-[15px] font-semibold text-foreground transition-[background-color,transform] hover:bg-surface/70 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-4 text-[15px] font-semibold text-destructive-foreground transition-[background-color,transform] hover:bg-destructive/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
};

export const card = "rounded-2xl border border-border bg-card";
export const innerCard = "rounded-xl border border-border bg-field/60";
export const field =
  "w-full rounded-xl border border-input bg-field px-4 text-base text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 md:text-[15px]";
export const sectionTitle = "text-[15px] font-semibold text-foreground";
