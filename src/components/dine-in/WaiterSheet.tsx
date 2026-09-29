import { useState } from "react";
import { BellRing, Check } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_WAITER_MESSAGE, callWaiter } from "@/lib/dine-in";
import { useDineIn } from "./context";

const QUICK = ["Can we have the bill?", "More water, please", "We'd like to order"];

export function WaiterSheet(props: { open: boolean; onClose: () => void }) {
  const { table, guestName, waiterCall } = useDineIn();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const waiting = waiterCall !== null && waiterCall.status !== "resolved";

  const send = async (text: string | null) => {
    if (sending) return;
    setSending(true);
    try {
      await callWaiter({ table, message: text, guestName: guestName || null });
      setMessage("");
      props.onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't call a waiter. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-[480px] gap-0 overflow-y-auto rounded-t-3xl p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="pb-2 text-left">
          <SheetTitle className="text-xl">Call a waiter</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {waiting && waiterCall ? (
            <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="text-sm">
                {waiterCall.status === "accepted" ? (
                  <p className="font-medium">
                    {waiterCall.accepted_by
                      ? `${waiterCall.accepted_by} is on the way`
                      : "A waiter is on the way"}
                  </p>
                ) : (
                  <p className="font-medium">Waiting for a waiter…</p>
                )}
                <p className="mt-0.5 text-muted-foreground">
                  Calling again lets them know you still need help.
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => send(q)}
                className="rounded-full border border-border bg-card px-4 py-2 text-sm transition-colors active:bg-accent"
              >
                {q}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="waiter-message" className="mb-2 block text-sm font-semibold">
              Or write your own
            </label>
            <Textarea
              id="waiter-message"
              maxLength={MAX_WAITER_MESSAGE}
              value={message}
              placeholder="What do you need?"
              onChange={(e) => setMessage(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <Button
            size="lg"
            className="h-12 w-full rounded-xl text-base"
            disabled={sending}
            onClick={() => send(message || null)}
          >
            {sending ? "Calling…" : waiting ? "Call again" : "Call a waiter"}
          </Button>

          {waiterCall?.status === "resolved" ? (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5" /> Your last call was taken care of.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
