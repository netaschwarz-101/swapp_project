"use client";

import {
  acceptTrade,
  cancelTrade,
  confirmCompleteTrade,
  declineTrade,
} from "@/actions/trades";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
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
export function TradeActions({ tradeId, status, role }: Props) {
  const actions: React.ReactNode[] = [];

  if (canAccept(status, role)) {
    actions.push(
      <form key="accept" action={() => acceptTrade(tradeId)}>
        <SubmitButton pendingText="Accepting…">Accept</SubmitButton>
      </form>,
    );
  }

  if (canDecline(status, role)) {
    actions.push(
      <form key="decline" action={() => declineTrade(tradeId)}>
        <Button type="submit" variant="outline">
          Decline
        </Button>
      </form>,
    );
  }

  if (canConfirmComplete(status, role)) {
    actions.push(
      <form key="complete" action={() => confirmCompleteTrade(tradeId)}>
        <SubmitButton pendingText="Completing…">
          Confirm trade complete
        </SubmitButton>
      </form>,
    );
  }

  if (canCancel(status, role)) {
    actions.push(
      <form
        key="cancel"
        action={() => cancelTrade(tradeId)}
        onSubmit={(e) => {
          if (!confirm("Cancel this trade?")) e.preventDefault();
        }}
      >
        <Button type="submit" variant="outline">
          Cancel
        </Button>
      </form>,
    );
  }

  if (actions.length === 0) return null;

  return <div className="flex flex-wrap gap-2">{actions}</div>;
}
