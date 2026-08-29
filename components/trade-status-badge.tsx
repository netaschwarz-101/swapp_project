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
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
