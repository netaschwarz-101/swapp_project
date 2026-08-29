"use client";

import Image from "next/image";
import { useActionState } from "react";
import { createTrade, type TradeActionState } from "@/actions/trades";
import { SubmitButton } from "@/components/submit-button";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/constants";

type OfferItem = {
  id: string;
  title: string;
  category: string;
  condition: string;
  image_urls: string[];
};

type Props = {
  requestedItem: OfferItem;
  responderId: string;
  ownItems: OfferItem[];
};

const initialState: TradeActionState = {};

export function OfferBuilder({ requestedItem, responderId, ownItems }: Props) {
  const [state, formAction] = useActionState(createTrade, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="responder_id" value={responderId} />
      <input type="hidden" name="requested_item_ids" value={requestedItem.id} />

      <div>
        <h2 className="mb-2 text-sm font-medium">You&rsquo;re requesting</h2>
        <ItemRow item={requestedItem} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">
          Choose 1 or more of your items to offer in exchange
        </h2>
        {ownItems.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            You don&rsquo;t have any available items to offer yet. Post an item
            first.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {ownItems.map((item) => (
              <label
                key={item.id}
                className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg border p-2"
              >
                <input
                  type="checkbox"
                  name="offered_item_ids"
                  value={item.id}
                  className="accent-foreground size-4"
                />
                <ItemRow item={item} compact />
              </label>
            ))}
          </div>
        )}
      </div>

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}

      <SubmitButton
        disabled={ownItems.length === 0}
        pendingText="Sending offer…"
      >
        Send trade offer
      </SubmitButton>
    </form>
  );
}

function ItemRow({
  item,
  compact = false,
}: {
  item: OfferItem;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 ${compact ? "" : "rounded-lg border p-3"}`}
    >
      <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-md">
        {item.image_urls[0] ? (
          <Image
            src={item.image_urls[0]}
            alt={item.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-muted-foreground text-xs">
          {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ??
            item.category}{" "}
          ·{" "}
          {CONDITION_LABELS[item.condition as keyof typeof CONDITION_LABELS] ??
            item.condition}
        </p>
      </div>
    </div>
  );
}
