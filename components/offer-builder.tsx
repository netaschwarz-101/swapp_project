"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { createTrade, type TradeActionState } from "@/actions/trades";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InkBlock } from "@/components/ink-block";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/constants";

export type OfferItem = {
  id: string;
  title: string;
  category: string;
  condition: string;
  image_urls: string[];
};

type RequestedItem = OfferItem & { city: string };

type Props = {
  requestedItem: RequestedItem;
  responderId: string;
  responderUsername: string;
  ownItems: OfferItem[];
  hasHiddenCommittedItems: boolean;
};

const initialState: TradeActionState = {};

// Redesigned per SWAPP_TRADE_PAGES.md (design spec, Aug 2026): give/get
// framing instead of a plain checkbox list, selectable item cards carrying
// selection via three signals at once (ink block + border + tick — never
// colour alone), and a sticky "you get" summary so the ask stays visible
// while scrolling a longer "you give" grid.
//
// Two parts of that spec were intentionally left out — see docs/decisions.md
// for the full reasoning, short version here: an "opening message" field
// would require createTrade (actions/trades.ts) to also write to the
// messages table, and a "+ add another of her items" button would need a
// new browse-the-responder's-other-items flow that doesn't exist yet.
// Neither is a pure layout/styling change, so both were skipped rather than
// half-built.
export function OfferBuilder({
  requestedItem,
  responderId,
  responderUsername,
  ownItems,
  hasHiddenCommittedItems,
}: Props) {
  const [state, formAction] = useActionState(createTrade, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const noneAvailable = ownItems.length === 0;

  return (
    <form
      action={formAction}
      className="grid items-start gap-6 md:grid-cols-[1fr_310px]"
    >
      <input type="hidden" name="responder_id" value={responderId} />
      <input
        type="hidden"
        name="requested_item_ids"
        value={requestedItem.id}
      />
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name="offered_item_ids" value={id} />
      ))}

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">
            You give — your available items
          </h2>
          <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
            {selected.size} of {ownItems.length} selected
          </p>
        </div>

        {noneAvailable ? (
          <Card className="items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground text-sm">
              You have nothing available to offer yet.
            </p>
            <Button asChild>
              <Link href="/items/new">Post an item</Link>
            </Button>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              {ownItems.map((item) => {
                const isSelected = selected.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-pressed={isSelected}
                    className="text-left"
                  >
                    <MaybeInk selected={isSelected}>
                      <Card
                        className={`gap-0 overflow-hidden py-0 transition-colors ${
                          isSelected ? "border-border" : "border-input"
                        }`}
                      >
                        <div
                          className={`bg-muted relative aspect-[4/3] border-b-[1.5px] ${
                            isSelected ? "border-border" : "border-input"
                          }`}
                        >
                          {item.image_urls[0] ? (
                            <Image
                              src={item.image_urls[0]}
                              alt={item.title}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : null}
                          <span
                            className={`absolute top-2 left-2 flex size-[22px] items-center justify-center rounded-full border-[1.5px] border-border ${
                              isSelected
                                ? "bg-foreground text-background"
                                : "bg-card"
                            }`}
                          >
                            {isSelected && <Check className="size-3" />}
                          </span>
                        </div>
                        <div className="p-3">
                          <p
                            className={`truncate text-sm ${
                              isSelected ? "font-semibold" : "font-medium"
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {CATEGORY_LABELS[
                              item.category as keyof typeof CATEGORY_LABELS
                            ] ?? item.category}{" "}
                            ·{" "}
                            {CONDITION_LABELS[
                              item.condition as keyof typeof CONDITION_LABELS
                            ] ?? item.condition}
                          </p>
                        </div>
                      </Card>
                    </MaybeInk>
                  </button>
                );
              })}
            </div>
            {hasHiddenCommittedItems && (
              <p className="text-muted-foreground text-xs">
                Items already committed to an accepted trade are hidden.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 md:sticky md:top-6">
        <InkBlock tone="cool">
          <Card className="gap-3 p-4">
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.08em] uppercase">
              You get
            </p>
            <ItemRow
              item={requestedItem}
              subtitle={`${responderUsername} · ${requestedItem.city}`}
            />
          </Card>
        </InkBlock>

        {state.error && (
          <p className="text-destructive text-sm" role="alert">
            {state.error}
          </p>
        )}

        <Card className="gap-2 p-4">
          <SubmitButton
            disabled={noneAvailable || selected.size === 0}
            pendingText="Sending offer…"
            className="h-10"
          >
            {selected.size === 0
              ? "Select at least one item"
              : `Send offer — ${selected.size} for 1`}
          </SubmitButton>
          <Button asChild variant="outline">
            <Link href={`/items/${requestedItem.id}`}>Cancel</Link>
          </Button>
          <p className="text-muted-foreground text-xs">
            {responderUsername} can accept, decline, or message you back
            before anything is final.
          </p>
        </Card>
      </div>
    </form>
  );
}

// Renders <InkBlock tone="warm"> around a selected card, or the card alone
// when unselected — the ink is one of three simultaneous selection signals
// (with the border and tick), not the only one, since a colour-only signal
// would be invisible to colour-blind users and doesn't survive to print/
// grayscale contexts.
function MaybeInk({
  selected,
  children,
}: {
  selected: boolean;
  children: ReactNode;
}) {
  return selected ? (
    <InkBlock tone="warm">{children}</InkBlock>
  ) : (
    <>{children}</>
  );
}

function ItemRow({
  item,
  subtitle,
}: {
  item: OfferItem;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-muted relative size-[60px] shrink-0 overflow-hidden rounded-md">
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
          {CONDITION_LABELS[
            item.condition as keyof typeof CONDITION_LABELS
          ] ?? item.condition}
        </p>
        {subtitle && (
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
