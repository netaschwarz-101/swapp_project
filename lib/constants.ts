export const CITIES = [
  "Tel Aviv",
  "Jerusalem",
  "Haifa",
  "Beer Sheva",
  "Rishon LeZion",
  "Petah Tikva",
  "Netanya",
  "Ashdod",
  "Herzliya",
  "Ramat Gan",
] as const;

export type City = (typeof CITIES)[number];

export const CATEGORIES = [
  "clothing",
  "electronics",
  "books",
  "home",
  "sports",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  clothing: "Clothing",
  electronics: "Electronics",
  books: "Books",
  home: "Home",
  sports: "Sports",
  other: "Other",
};

export const CONDITIONS = ["new", "like_new", "used", "worn"] as const;

export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  like_new: "Like new",
  used: "Used",
  worn: "Worn",
};

export const ITEM_STATUSES = ["available", "traded", "deleted"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const TRADE_STATUSES = [
  "pending",
  "accepted_by_responder",
  "completed",
  "declined",
  "cancelled",
] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const MAX_IMAGES_PER_ITEM = 4;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
