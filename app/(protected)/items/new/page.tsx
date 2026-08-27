import { ItemForm } from "@/components/item-form";
import { createItem } from "@/actions/items";

export default function NewItemPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Post an item</h1>
        <p className="text-muted-foreground text-sm">
          Add a few details and up to 4 photos.
        </p>
      </div>
      <ItemForm action={createItem} submitLabel="Post item" />
    </div>
  );
}
