"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { itemSchema } from "@/lib/validation/item";

export type ItemActionState = {
  error?: string;
};

function parseItemForm(formData: FormData) {
  return itemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    category: formData.get("category"),
    condition: formData.get("condition"),
    city: formData.get("city"),
    image_urls: formData.getAll("image_urls"),
  });
}

export async function createItem(
  _prevState: ItemActionState,
  formData: FormData,
): Promise<ItemActionState> {
  // 1. auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  // 2. zod parse
  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // 3. authorization/state check — none needed beyond "is authenticated" for create

  // 4. mutation (RLS also enforces owner_id = auth.uid())
  const { data: item, error } = await supabase
    .from("items")
    .insert({ ...parsed.data, owner_id: user.id })
    .select("id")
    .single();

  if (error) return { error: "Couldn't create the item. Please try again." };

  // 5. revalidate
  revalidatePath("/my-items");
  revalidatePath("/");
  redirect(`/items/${item.id}`);
}

export async function updateItem(
  itemId: string,
  _prevState: ItemActionState,
  formData: FormData,
): Promise<ItemActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Authorization check up front (RLS backs this up too, but this gives a
  // clear error instead of a silent no-op update).
  const { data: existing } = await supabase
    .from("items")
    .select("owner_id")
    .eq("id", itemId)
    .single();
  if (!existing || existing.owner_id !== user.id) {
    return { error: "You can only edit your own items." };
  }

  const { error } = await supabase
    .from("items")
    .update(parsed.data)
    .eq("id", itemId);

  if (error) return { error: "Couldn't update the item. Please try again." };

  revalidatePath("/my-items");
  revalidatePath(`/items/${itemId}`);
  redirect(`/items/${itemId}`);
}

export async function deleteItem(itemId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { data: existing } = await supabase
    .from("items")
    .select("owner_id")
    .eq("id", itemId)
    .single();
  if (!existing || existing.owner_id !== user.id) {
    throw new Error("You can only delete your own items.");
  }

  // Phase 2: trades don't exist yet, so every delete is a hard delete.
  // Phase 4 revisits this to soft-delete (status='deleted') instead,
  // whenever the item has ever appeared in a trade_items row — per
  // docs/technical-design.md §4, so trade history stays intact.
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw new Error("Couldn't delete the item.");

  revalidatePath("/my-items");
}
