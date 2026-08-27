import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "@/components/item-form";
import { updateItem } from "@/actions/items";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: item } = await supabase
    .from("items")
    .select(
      "id, title, description, category, condition, city, image_urls, owner_id",
    )
    .eq("id", id)
    .single();

  if (!item || item.owner_id !== user.id) notFound();

  const boundUpdateItem = updateItem.bind(null, item.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit item</h1>
      </div>
      <ItemForm
        action={boundUpdateItem}
        submitLabel="Save changes"
        defaultValues={item}
      />
    </div>
  );
}
