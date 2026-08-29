import { Check } from "lucide-react";
import type { TradeStatus } from "@/lib/constants";
import { Card } from "@/components/ui/card";

type StepState = "done" | "active" | "todo" | "terminal";
type Step = { title: string; caption: string; state: StepState };

type Props = {
  status: TradeStatus;
  isInitiator: boolean;
  otherName: string;
  sentAt: string;
};

function formatSentAt(iso: string) {
  const sent = new Date(iso);
  const now = new Date();
  const time = sent.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sent.toDateString() === now.toDateString()
    ? `Today at ${time}`
    : `${sent.toLocaleDateString()} at ${time}`;
}

// Pure, presentational — takes the trade status and the viewer's role and
// derives which of three fixed steps is active. Status becomes a
// *position* on this bar rather than a standalone label, so "whose turn is
// it" is legible at a glance instead of requiring the reader to already
// know what "Pending" or "Accepted" implies.
export function TradeSteps({ status, isInitiator, otherName, sentAt }: Props) {
  const steps = buildSteps({ status, isInitiator, otherName, sentAt });

  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-2">
        {steps.map((step, i) => (
          <div key={step.title + i} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Marker state={step.state} />
              {i < steps.length - 1 && (
                <div
                  className={`hidden h-0.5 flex-1 sm:block ${
                    step.state === "done" ? "bg-foreground" : "bg-input"
                  }`}
                />
              )}
            </div>
            <div>
              <p
                className={`text-sm font-semibold ${
                  step.state === "todo" ? "text-muted-foreground" : ""
                }`}
              >
                {step.title}
              </p>
              <p className="text-muted-foreground text-xs">{step.caption}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Marker({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="bg-foreground text-background flex size-[22px] shrink-0 items-center justify-center rounded-full">
        <Check className="size-3" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="bg-ink-olive border-border size-[22px] shrink-0 rounded-full border-[1.5px]" />
    );
  }
  if (state === "terminal") {
    return (
      <span className="bg-muted-foreground size-[22px] shrink-0 rounded-full" />
    );
  }
  return (
    <span className="border-input size-[22px] shrink-0 rounded-full border-[1.5px]" />
  );
}

function buildSteps({ status, isInitiator, otherName, sentAt }: Props): Step[] {
  const step1: Step = {
    title: "Offer sent",
    caption: formatSentAt(sentAt),
    state: "done",
  };

  if (status === "declined" || status === "cancelled") {
    return [
      step1,
      {
        title: status === "declined" ? "Declined" : "Cancelled",
        caption: "This offer is closed.",
        state: "terminal",
      },
      {
        title: "Meet & confirm",
        caption: "Both confirm the exchange",
        state: "todo",
      },
    ];
  }

  if (status === "pending") {
    return [
      step1,
      {
        title: isInitiator ? `Pending — ${otherName}'s turn` : "Pending — your turn",
        caption: isInitiator
          ? `${otherName} accepts or declines`
          : "You accept or decline",
        state: "active",
      },
      {
        title: "Meet & confirm",
        caption: "Both confirm the exchange",
        state: "todo",
      },
    ];
  }

  if (status === "accepted_by_responder") {
    return [
      step1,
      { title: "Accepted", caption: "They said yes.", state: "done" },
      {
        title: "Meet & confirm",
        // Only the initiator can confirm completion (complete_trade(),
        // lib/trade-machine.ts canConfirmComplete) — a single-sided
        // confirmation by design, so the caption says who acts next
        // rather than implying either side can.
        caption: isInitiator
          ? "Confirm once you've swapped"
          : `${otherName} confirms once you've swapped`,
        state: "active",
      },
    ];
  }

  // completed
  return [
    step1,
    { title: "Accepted", caption: "They said yes.", state: "done" },
    { title: "Completed", caption: "The exchange is confirmed.", state: "done" },
  ];
}
