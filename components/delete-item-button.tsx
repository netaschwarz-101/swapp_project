"use client";

import { deleteItem } from "@/actions/items";
import { Button } from "@/components/ui/button";

export function DeleteItemButton({ itemId }: { itemId: string }) {
  return (
    <form
      action={() => deleteItem(itemId)}
      onSubmit={(e) => {
        if (!confirm("Delete this item? This can't be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="outline" size="sm">
        Delete
      </Button>
    </form>
  );
}
