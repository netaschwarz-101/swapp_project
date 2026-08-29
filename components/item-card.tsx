import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InkBlock } from "@/components/ink-block";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/constants";

export type ItemCardData = {
  id: string;
  title: string;
  category: string;
  condition: string;
  city: string;
  status: string;
  image_urls: string[];
};

export function ItemCard({
  item,
  index,
}: {
  item: ItemCardData;
  index?: number;
}) {
  const tone = index !== undefined && index % 2 ? "cool" : "warm";

  return (
    <Link href={`/items/${item.id}`}>
      <InkBlock tone={tone}>
        <Card className="gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
          <div className="bg-muted relative aspect-square w-full">
            {item.image_urls[0] ? (
              <Image
                src={item.image_urls[0]}
                alt={item.title}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
                No photo
              </div>
            )}
            {item.status !== "available" && (
              <Badge
                variant="secondary"
                className="absolute top-2 right-2 capitalize"
              >
                {item.status}
              </Badge>
            )}
          </div>
          <CardContent className="flex flex-col gap-1 px-3 py-3">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <p className="text-muted-foreground text-xs">
              {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ??
                item.category}{" "}
              ·{" "}
              {CONDITION_LABELS[
                item.condition as keyof typeof CONDITION_LABELS
              ] ?? item.condition}
            </p>
            <p className="text-muted-foreground text-xs">{item.city}</p>
          </CardContent>
        </Card>
      </InkBlock>
    </Link>
  );
}
