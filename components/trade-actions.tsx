"use client";

import { useState, useTransition } from "react";
import {
  acceptTrade,
  cancelTrade,
  confirmCompleteTrade,
  declineTrade,
} from "@/actions/trades";
import { Button } from "@/components/ui/button";
import {
  canAccept,
  canCancel,
  canConfirmComplete,
  canDecline,
  type TradeRole,
} from "@/lib/trade-machine";
import type { TradeStatus } from "@/lib/constants";

type Props = {
  tradeId: string;
  status: TradeStatus;
  role: TradeRole;
};

// Only ever renders the buttons that are actually legal right now — the
// same guard functions the Server Actions use to double-check server
// side (lib/trade-machine.ts), so the UI never offers something the
// backend would reject (docs/technical-design.md §9).
//
// Accept/decline/cancel/complete throw on failure (actions/trades.ts) —
// e.g. accept_trade() rejecting a second acceptance for an item already
// committed elsewhere (0008_trade_accept_conflict_resolution.sql). These
// buttons used to be plain <form action={...}> submissions, which sent
// any thrown error straight to Next's nearest error boundary — a jarring
// generic "Something went wrong!" page for what's actually an expected,
// well-defined rejection. Calling the actions directly inside a
// try/catch instead lets us show the real message inline, in place,
// without losing the rest of the page.
export function TradeActions({ tradeId, status, role }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Something went wrong. Please try again.",
        );
      }
    });
  }

  const actions: React.ReactNode[] = [];

  if (canAccept(status, role)) {
    actions.push(
      <Button
        key="accept"
        disabled={isPending}
        onClick={() => run(() => acceptTrade(tradeId))}
      >
        {isPending ? "Accepting…" : "Accept"}
      </Button>,
    );
  }

  if (canDecline(status, role)) {
    actions.push(
      <Button
        key="decline"
        variant="outline"
        className="text-destructive border-destructive hover:bg-destructive/10"
        disabled={isPending}
        onClick={() => run(() => declineTrade(tradeId))}
      >
        Decline
      </Button>,
    );
  }

  if (canConfirmComplete(status, role)) {
    actions.push(
      <Button
        key="complete"
        disabled={isPending}
        onClick={() => run(() => confirmCompleteTrade(tradeId))}
      >
        {isPending ? "Confirming…" : "Confirm exchange"}
      </Button>,
    );
  }

  if (canCancel(status, role)) {
    // Same action (cancelTrade), different copy depending on where the
    // trade is: withdrawing a still-pending offer isn't the same feeling
    // as backing out of one the other person already accepted, even
    // though the backend transition is identical either way.
    const isWithdrawal = status === "accepted_by_responder";
    actions.push(
      <Button
        key="cancel"
        variant="outline"
        className={
          isWithdrawal
            ? "text-destructive border-destructive hover:bg-destructive/10"
            : undefined
        }
        disabled={isPending}
        onClick={() =>
          run(
            () => cancelTrade(tradeId),
            isWithdrawal
              ? "Withdraw from this trade?"
              : "Cancel this trade offer?",
          )
        }
      >
        {isWithdrawal ? "Withdraw" : "Cancel offer"}
      </Button>,
    );
  }

  if (actions.length === 0 && !error) return null;

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">{actions}</div>
      )}
    </div>
  );
}
