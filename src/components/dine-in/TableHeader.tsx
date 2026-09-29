import { Input } from "@/components/ui/input";
import { MAX_NAME } from "@/lib/dine-in";
import { useDineIn } from "./context";

export function TableHeader() {
  const { restaurant, table, tableState, guestName, setGuestName, ordersTaken } = useDineIn();
  const tableName = tableState?.name ?? table.table_name;

  return (
    <header className="border-b border-border">
      {restaurant.image_url ? (
        <img
          src={restaurant.image_url}
          alt={restaurant.name}
          className="h-28 w-full object-cover"
        />
      ) : null}
      <div className="space-y-3 px-4 py-4">
        <div>
          <h1 className="text-xl font-semibold">{restaurant.name}</h1>
          <p className="text-sm text-muted-foreground">
            {tableName}
            {restaurant.cuisine ? ` · ${restaurant.cuisine}` : ""}
          </p>
        </div>
        <div>
          <label htmlFor="guest-name" className="mb-1 block text-xs text-muted-foreground">
            Your first name, so the waiter knows who's who (optional)
          </label>
          <Input
            id="guest-name"
            maxLength={MAX_NAME}
            value={guestName}
            placeholder="e.g. Karabo"
            onChange={(e) => setGuestName(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        {!ordersTaken ? (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
            {tableName} isn't taking orders right now. You can look at the menu, and a member of
            staff can help you order.
          </p>
        ) : null}
      </div>
    </header>
  );
}
