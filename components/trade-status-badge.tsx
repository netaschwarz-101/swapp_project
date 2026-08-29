import { Badge } from "@/components/ui/badge";
import type { TradeStatus } from "@/lib/constants";

const LABELS: Record<TradeStatus, string> = {
  pending: "Pending",
  accepted_by_responder: "Accepted",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const VARIANTS: Record<
  TradeStatus,
  "default" | "secondary" | "destructive" | "success" | "outline"
> = {
  pending: "secondary",
  accepted_by_responder: "default",
  completed: "success",
  declined: "destructive",
  cancelled: "outline",
};

export function TradeStatusBadge({ status }: { status: TradeStatus }) {
  // Bigger and bolder than the base Badge default (which is sized for
  // small inline item-status tags) — this is the primary signal on the
  // trades list and trade detail page, so it needs to read at a glance,
  // not blend into surrounding text.
  return (
    <Badge
      variant={VARIANTS[status]}
      className="px-3 py-1 text-sm font-semibold tracking-wide"
    >
      {LABELS[status]}
    </Badge>
  );
}
