import { createFileRoute } from "@tanstack/react-router";
import { QrCode } from "lucide-react";

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

function Index() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          <QrCode className="size-8 text-primary" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">Order from your table</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Scan the QR code on your table with your phone's camera to see the menu, order, and call
          a waiter — no app needed.
        </p>
        <p className="mt-8 text-xs text-muted-foreground">Powered by Hearth</p>
      </div>
    </div>
  );
}
