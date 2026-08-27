import type { TradeStatus } from "@/lib/constants";

export type TradeRole = "initiator" | "responder";

/**
 * Pure, side-effect-free encoding of the trade state machine (see
 * docs/technical-design.md §3.1). No I/O — this is what makes it directly
 * unit-testable. The Server Actions in actions/trades.ts call these guards
 * before issuing any database write; the database itself enforces the same
 * rules a second time (CHECK constraints + the complete_trade() function),
 * so a bug here can't produce an illegal state, only a rejected request.
 */

export function canAccept(status: TradeStatus, role: TradeRole): boolean {
  return status === "pending" && role === "responder";
}

export function canDecline(status: TradeStatus, role: TradeRole): boolean {
  return status === "pending" && role === "responder";
}

export function canCancel(status: TradeStatus, role: TradeRole): boolean {
  if (status === "pending") return role === "initiator";
  if (status === "accepted_by_responder") return true; // either side may withdraw
  return false;
}

export function canConfirmComplete(
  status: TradeStatus,
  role: TradeRole,
): boolean {
  return status === "accepted_by_responder" && role === "initiator";
}

export function canSendMessage(status: TradeStatus): boolean {
  return (
    status !== "completed" && status !== "declined" && status !== "cancelled"
  );
}

export function isTerminal(status: TradeStatus): boolean {
  return (
    status === "completed" || status === "declined" || status === "cancelled"
  );
}

export function roleOf(
  userId: string,
  trade: { initiator_id: string; responder_id: string },
): TradeRole | null {
  if (userId === trade.initiator_id) return "initiator";
  if (userId === trade.responder_id) return "responder";
  return null;
}
