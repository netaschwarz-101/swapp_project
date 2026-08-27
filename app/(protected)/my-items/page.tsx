import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ItemCard } from "@/components/item-card";
import { DeleteItemButton } from "@/components/delete-item-button";

export default async function MyItemsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // proxy.ts already redirects unauthenticated users here

  const { data: items } = await supabase
    .from("items")
    .select("id, title, category, condition, city, status, image_urls")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Items</h1>
        <Button asChild>
          <Link href="/items/new">Post an item</Link>
        </Button>
      </div>

      {!items || items.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
          You haven&rsquo;t posted anything yet.{" "}
          <Link href="/items/new" className="underline underline-offset-4">
            Post your first item
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2">
              <ItemCard item={item} />
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link href={`/items/${item.id}/edit`}>Edit</Link>
                </Button>
                <DeleteItemButton itemId={item.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
