import { createFileRoute } from "@tanstack/react-router";
import { Bell, QrCode, UtensilsCrossed } from "lucide-react";
import { HeroLogo } from "@/components/dine-in/ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hearth Dine-in — Scan your table's QR code" },
      {
        name: "description",
        content:
          "Scan the QR code on your table to browse the menu, order, and call a waiter from your phone.",
      },
      { property: "og:title", content: "Hearth Dine-in — Scan your table's QR code" },
      {
        property: "og:description",
        content:
          "Scan the QR code on your table to browse the menu, order, and call a waiter from your phone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const STEPS = [
  { icon: QrCode, text: "Scan the QR code on your table" },
  { icon: UtensilsCrossed, text: "Browse the menu and order" },
  { icon: Bell, text: "Call a waiter any time" },
];

function Index() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <HeroLogo />
        <p className="mt-6 text-center text-[17px] text-foreground/85">Order from your table</p>
        <ul className="mt-8 space-y-3">
          {STEPS.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex h-14 items-center gap-4 rounded-xl border border-input bg-field px-4 text-[15px] text-foreground/90"
            >
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-[15px] leading-relaxed text-muted-foreground">
          Use your phone's camera — no app needed.
          <br />
          Powered by Hearth.
        </p>
      </div>
    </div>
  );
}
