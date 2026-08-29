import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { itemSchema } from "@/lib/validation/item";
import { createTradeSchema } from "@/lib/validation/trade";
import { messageSchema } from "@/lib/validation/message";
import {
  loginSchema,
  profileUpdateSchema,
  signupSchema,
} from "@/lib/validation/profile";
import { MAX_IMAGES_PER_ITEM } from "@/lib/constants";

const validImage = "https://example.com/photo.jpg";
// zod's .uuid() checks the version/variant nibbles, not just the shape —
// a hand-written placeholder like "0000...0001" fails that check, so use
// real (random, but validly-formed) UUIDs here instead.
const uuid = () => randomUUID();

describe("itemSchema", () => {
  const validItem = {
    title: "Nike Air Max sneakers, size 42",
    description: "Lightly worn.",
    category: "clothing",
    condition: "used",
    city: "Tel Aviv",
    image_urls: [validImage],
  };

  it("accepts a fully valid item", () => {
    expect(itemSchema.safeParse(validItem).success).toBe(true);
  });

  it("defaults description to empty string when omitted", () => {
    const rest: Partial<typeof validItem> = { ...validItem };
    delete rest.description;
    const result = itemSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe("");
  });

  it("rejects an empty title", () => {
    expect(
      itemSchema.safeParse({ ...validItem, title: "" }).success,
    ).toBe(false);
  });

  it("rejects a title over 80 characters", () => {
    expect(
      itemSchema.safeParse({ ...validItem, title: "x".repeat(81) }).success,
    ).toBe(false);
  });

  it("rejects a description over 1000 characters", () => {
    expect(
      itemSchema.safeParse({ ...validItem, description: "x".repeat(1001) })
        .success,
    ).toBe(false);
  });

  it("rejects a category outside the fixed enum", () => {
    expect(
      itemSchema.safeParse({ ...validItem, category: "furniture" }).success,
    ).toBe(false);
  });

  it("rejects a condition outside the fixed enum", () => {
    expect(
      itemSchema.safeParse({ ...validItem, condition: "mint" }).success,
    ).toBe(false);
  });

  it("rejects a city outside the fixed list", () => {
    expect(
      itemSchema.safeParse({ ...validItem, city: "Eilat" }).success,
    ).toBe(false);
  });

  it("rejects zero images", () => {
    expect(
      itemSchema.safeParse({ ...validItem, image_urls: [] }).success,
    ).toBe(false);
  });

  it(`rejects more than ${MAX_IMAGES_PER_ITEM} images`, () => {
    const tooMany = Array.from(
      { length: MAX_IMAGES_PER_ITEM + 1 },
      () => validImage,
    );
    expect(
      itemSchema.safeParse({ ...validItem, image_urls: tooMany }).success,
    ).toBe(false);
  });

  it("rejects a non-URL image entry", () => {
    expect(
      itemSchema.safeParse({ ...validItem, image_urls: ["not-a-url"] })
        .success,
    ).toBe(false);
  });
});

describe("createTradeSchema", () => {
  const valid = {
    responder_id: uuid(),
    offered_item_ids: [uuid()],
    requested_item_ids: [uuid()],
  };

  it("accepts a valid single-item-for-single-item offer", () => {
    expect(createTradeSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts multiple offered items (N:M is schema-supported even though the UI only builds 1 requested item)", () => {
    expect(
      createTradeSchema.safeParse({
        ...valid,
        offered_item_ids: [uuid(), uuid()],
      }).success,
    ).toBe(true);
  });

  it("rejects zero offered items", () => {
    expect(
      createTradeSchema.safeParse({ ...valid, offered_item_ids: [] })
        .success,
    ).toBe(false);
  });

  it("rejects zero requested items", () => {
    expect(
      createTradeSchema.safeParse({ ...valid, requested_item_ids: [] })
        .success,
    ).toBe(false);
  });

  it("rejects a non-UUID responder_id", () => {
    expect(
      createTradeSchema.safeParse({ ...valid, responder_id: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  // "Can't trade with yourself" is checked in the Server Action, not this
  // schema — it needs the authenticated caller's id, which zod alone
  // doesn't have. Documented here so the gap is deliberate, not missed.
});

describe("messageSchema", () => {
  const valid = { trade_id: uuid(), body: "Sounds good, meet Friday?" };

  it("accepts a valid message", () => {
    expect(messageSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(messageSchema.safeParse({ ...valid, body: "" }).success).toBe(
      false,
    );
  });

  it("rejects a whitespace-only body (trimmed before the length check)", () => {
    expect(messageSchema.safeParse({ ...valid, body: "   " }).success).toBe(
      false,
    );
  });

  it("rejects a body over 1000 characters", () => {
    expect(
      messageSchema.safeParse({ ...valid, body: "x".repeat(1001) }).success,
    ).toBe(false);
  });

  it("accepts exactly 1000 characters (boundary)", () => {
    expect(
      messageSchema.safeParse({ ...valid, body: "x".repeat(1000) }).success,
    ).toBe(true);
  });
});

describe("signupSchema", () => {
  const valid = {
    email: "neta@example.com",
    password: "SwappDemo123!",
    username: "neta_swapper",
    city: "Tel Aviv",
  };

  it("accepts valid signup input", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(
      signupSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    expect(
      signupSchema.safeParse({ ...valid, password: "short1" }).success,
    ).toBe(false);
  });

  it("rejects a username under 3 characters", () => {
    expect(
      signupSchema.safeParse({ ...valid, username: "ab" }).success,
    ).toBe(false);
  });

  it("rejects a username over 24 characters", () => {
    expect(
      signupSchema.safeParse({ ...valid, username: "x".repeat(25) }).success,
    ).toBe(false);
  });

  it("rejects a username with disallowed characters", () => {
    expect(
      signupSchema.safeParse({ ...valid, username: "neta swapper!" })
        .success,
    ).toBe(false);
  });

  it("rejects a city outside the fixed list", () => {
    expect(
      signupSchema.safeParse({ ...valid, city: "Eilat" }).success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts any non-empty password with a valid email", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "x" }).success,
    ).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "" }).success,
    ).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "x" })
        .success,
    ).toBe(false);
  });
});

describe("profileUpdateSchema", () => {
  it("accepts valid username + city with no avatar", () => {
    expect(
      profileUpdateSchema.safeParse({ username: "neta_swapper", city: "Haifa" })
        .success,
    ).toBe(true);
  });

  it("accepts a null avatar_url explicitly", () => {
    expect(
      profileUpdateSchema.safeParse({
        username: "neta_swapper",
        city: "Haifa",
        avatar_url: null,
      }).success,
    ).toBe(true);
  });

  it("reuses signupSchema's username/city rules (rejects a bad username the same way)", () => {
    expect(
      profileUpdateSchema.safeParse({ username: "ab", city: "Haifa" })
        .success,
    ).toBe(false);
  });
});
