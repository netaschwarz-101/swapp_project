import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/constants";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: userData }] = await Promise.all([
    supabase
      .from("items")
      .select("*, owner:profiles(id, username, city)")
      .eq("id", id)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!item) notFound();

  const user = userData.user;
  const isOwner = user?.id === item.owner_id;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-lg border">
          {item.image_urls[0] ? (
            <Image
              src={item.image_urls[0]}
              alt={item.title}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              No photo
            </div>
          )}
        </div>
        {item.image_urls.length > 1 && (
          <div className="flex gap-2">
            {item.image_urls.slice(1).map((url: string) => (
              <div
                key={url}
                className="bg-muted relative h-16 w-16 overflow-hidden rounded-md border"
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{item.title}</h1>
            {item.status !== "available" && (
              <Badge variant="secondary" className="capitalize">
                {item.status}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ??
              item.category}{" "}
            ·{" "}
            {CONDITION_LABELS[
              item.condition as keyof typeof CONDITION_LABELS
            ] ?? item.condition}{" "}
            · {item.city}
          </p>
        </div>

        {item.description && (
          <p className="text-sm whitespace-pre-wrap">{item.description}</p>
        )}

        <div className="rounded-lg border p-3 text-sm">
          Posted by{" "}
          <span className="font-medium">
            {item.owner?.username ?? "a Swapp user"}
          </span>
        </div>

        {isOwner ? (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/items/${item.id}/edit`}>Edit item</Link>
            </Button>
          </div>
        ) : item.status === "available" ? (
          user ? (
            <Button asChild>
              <Link href={`/trades/new?item=${item.id}`}>Offer a trade</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href={`/login?next=/items/${item.id}`}>
                Log in to offer a trade
              </Link>
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
