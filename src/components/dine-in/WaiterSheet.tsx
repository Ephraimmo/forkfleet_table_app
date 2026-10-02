import { useState } from "react";
import { BadgeCheck, Bell, Check, ChevronRight, HandHelping } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAX_WAITER_MESSAGE, callWaiter, type WaiterCall } from "@/lib/dine-in";
import { useDineIn } from "./context";
import { Panel } from "./ui";
import { btn, card, field, sectionTitle } from "./styles";
import { sinceLabel, useNow } from "./time";

const QUICK = ["Can we have the bill?", "More water, please", "We'd like to order"];

function CallCard({ call, tableName }: { call: WaiterCall; tableName: string }) {
  const now = useNow(15_000);
  const ago = sinceLabel(call.last_requested_at || call.created_at, now);
  const accepted = call.status === "accepted";
  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-4",
        accepted
          ? "border-info-line bg-info-wash shadow-[0_0_24px_-12px_var(--info-line)]"
          : "border-primary/60 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_60%)]",
      )}
    >
      <div className="flex gap-3">
        {accepted ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-info text-white">
            <HandHelping className="size-5" />
          </span>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center">
            <Bell className="size-7 fill-stat-yellow text-stat-yellow" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[17px] font-semibold">{tableName}</p>
            {!accepted && ago ? (
              <span className="shrink-0 text-[14px] text-muted-foreground">{ago}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[15px] text-foreground/85">
            {call.message ?? "You asked for a waiter."}
          </p>
          {accepted ? (
            <>
              <p className="mt-3 flex items-center gap-1.5 text-[15px] font-medium text-info-text">
                <BadgeCheck className="size-5 fill-info-line text-info-wash" />
                {call.accepted_by ? `Accepted by ${call.accepted_by}` : "A waiter accepted"}
              </p>
              <p className="mt-1 text-[14px] text-muted-foreground">On the way to your table</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-[14px] text-muted-foreground">
                Waiting for a waiter
                {call.request_count > 1 ? ` · called ${call.request_count} times` : ""}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Calling again lets them know you still need help.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function WaiterSheet(props: { open: boolean; onClose: () => void }) {
  const { table, tableState, guestName, waiterCall } = useDineIn();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const waiting = waiterCall !== null && waiterCall.status !== "resolved";
  const tableName = tableState?.name ?? table.table_name;

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
    <Panel
      open={props.open}
      onClose={props.onClose}
      title="Call a waiter"
      footer={
        <button
          type="button"
          className={cn(btn.primary, "h-[52px] w-full text-base")}
          disabled={sending}
          onClick={() => send(message || null)}
        >
          {sending ? "Calling…" : waiting ? "Call again" : "Call a waiter"}
        </button>
      }
    >
      <div className="space-y-6 pt-1">
        {waiting && waiterCall ? (
          <section className="space-y-3">
            <h2 className="text-[20px] font-semibold tracking-tight">Your request</h2>
            <CallCard call={waiterCall} tableName={tableName} />
          </section>
        ) : null}

        {waiterCall?.status === "resolved" ? (
          <p className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success-text">
            <Check className="size-4" /> Your last call was taken care of.
          </p>
        ) : null}

        <section>
          <h3 className={cn(sectionTitle, "mb-2.5")}>Quick requests</h3>
          <div className="space-y-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => send(q)}
                className={cn(
                  card,
                  "flex h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-[15px] font-medium transition-colors hover:bg-surface active:bg-surface disabled:opacity-50",
                )}
              >
                <Bell className="size-5 shrink-0 text-stat-yellow" />
                <span className="flex-1">{q}</span>
                <ChevronRight className="size-5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>

        <section>
          <label htmlFor="waiter-message" className={cn(sectionTitle, "mb-2.5 block")}>
            Or write your own
          </label>
          <textarea
            id="waiter-message"
            rows={3}
            maxLength={MAX_WAITER_MESSAGE}
            value={message}
            placeholder="e.g. Could we get some napkins?"
            onChange={(e) => setMessage(e.target.value)}
            className={cn(field, "min-h-[96px] resize-none py-3.5")}
          />
        </section>
      </div>
    </Panel>
  );
}
