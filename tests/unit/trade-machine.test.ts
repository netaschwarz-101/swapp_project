import { describe, expect, it } from "vitest";
import {
  canAccept,
  canCancel,
  canConfirmComplete,
  canDecline,
  canSendMessage,
  isTerminal,
  roleOf,
} from "@/lib/trade-machine";
import { TRADE_STATUSES, type TradeStatus } from "@/lib/constants";

// Every (status, role) combination the guards can be asked about, so a
// change to one guard's boundaries shows up as a failing assertion
// instead of a silently-widened permission. See docs/test-plan.md §4.
const ROLES = ["initiator", "responder"] as const;

describe("canAccept", () => {
  it("allows only the responder, only while pending", () => {
    expect(canAccept("pending", "responder")).toBe(true);
    expect(canAccept("pending", "initiator")).toBe(false);
  });

  it("rejects every non-pending status regardless of role", () => {
    for (const status of TRADE_STATUSES.filter((s) => s !== "pending")) {
      for (const role of ROLES) {
        expect(canAccept(status, role)).toBe(false);
      }
    }
  });
});

describe("canDecline", () => {
  it("allows only the responder, only while pending", () => {
    expect(canDecline("pending", "responder")).toBe(true);
    expect(canDecline("pending", "initiator")).toBe(false);
  });

  it("rejects every non-pending status regardless of role", () => {
    for (const status of TRADE_STATUSES.filter((s) => s !== "pending")) {
      for (const role of ROLES) {
        expect(canDecline(status, role)).toBe(false);
      }
    }
  });
});

describe("canCancel", () => {
  it("allows only the initiator while pending", () => {
    expect(canCancel("pending", "initiator")).toBe(true);
    expect(canCancel("pending", "responder")).toBe(false);
  });

  it("allows either participant to withdraw once accepted", () => {
    expect(canCancel("accepted_by_responder", "initiator")).toBe(true);
    expect(canCancel("accepted_by_responder", "responder")).toBe(true);
  });

  it("rejects every terminal status regardless of role", () => {
    for (const status of ["completed", "declined", "cancelled"] as const) {
      for (const role of ROLES) {
        expect(canCancel(status, role)).toBe(false);
      }
    }
  });
});

describe("canConfirmComplete", () => {
  it("allows only the initiator, only once accepted", () => {
    expect(canConfirmComplete("accepted_by_responder", "initiator")).toBe(
      true,
    );
    expect(canConfirmComplete("accepted_by_responder", "responder")).toBe(
      false,
    );
  });

  it("rejects every other status regardless of role — including pending (can't skip acceptance)", () => {
    for (const status of TRADE_STATUSES.filter(
      (s) => s !== "accepted_by_responder",
    )) {
      for (const role of ROLES) {
        expect(canConfirmComplete(status, role)).toBe(false);
      }
    }
  });
});

describe("canSendMessage", () => {
  it("allows messaging on every non-terminal status", () => {
    expect(canSendMessage("pending")).toBe(true);
    expect(canSendMessage("accepted_by_responder")).toBe(true);
  });

  it("blocks messaging once a trade reaches any terminal status", () => {
    expect(canSendMessage("completed")).toBe(false);
    expect(canSendMessage("declined")).toBe(false);
    expect(canSendMessage("cancelled")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("flags exactly the three terminal statuses", () => {
    const terminal: TradeStatus[] = ["completed", "declined", "cancelled"];
    const nonTerminal: TradeStatus[] = ["pending", "accepted_by_responder"];
    for (const status of terminal) expect(isTerminal(status)).toBe(true);
    for (const status of nonTerminal) expect(isTerminal(status)).toBe(false);
  });
});

describe("roleOf", () => {
  const trade = { initiator_id: "user-a", responder_id: "user-b" };

  it("identifies the initiator", () => {
    expect(roleOf("user-a", trade)).toBe("initiator");
  });

  it("identifies the responder", () => {
    expect(roleOf("user-b", trade)).toBe("responder");
  });

  it("returns null for a non-participant — the case notFound() relies on", () => {
    expect(roleOf("user-c", trade)).toBeNull();
  });
});
