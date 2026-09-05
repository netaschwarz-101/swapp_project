# Product Specification — Swapp

## 1. Problem

People accumulate items they no longer want — clothes that don't fit, upgraded gadgets, books they've read, furniture they've replaced — while also wanting things they'd rather not pay full price for. Selling low-value items through money-based marketplaces is high-friction: pricing, payment handling, and the psychology of "loss" (paying) versus "gain" (getting something) discourage trades that would otherwise make sense. Usable goods end up thrown away instead.

Barter — direct item-for-item exchange — removes the money step entirely. It's a natural fit for low-value, high-utility items, but today it only happens ad hoc, in Facebook groups or informal trades among friends, with no structured way to browse what's available, propose a multi-item trade, or track its status.

## 2. Users and Customer

**Users:** people with unused items who'd rather trade than sell or donate them. No specific demographic — students, young professionals, and households downsizing are likely early adopters.

**Customer:** the platform operator. Swapp is free to use in this version; the future business model would come from promoted listings and verified-user badges, not a cut of trades (there's no money in a trade to take a cut of). Monetization is out of scope for v1.

## 3. Business Value

- **Reduces waste** by matching items that would otherwise be discarded with someone who wants them.
- **No money required**, which removes payment fraud and shipping/pricing disputes — trades are arranged and completed by users themselves, like a Facebook Marketplace pickup.
- **Lower friction than selling**, since posting an item requires no pricing decision — often the biggest barrier to listing something at all.
- **Local by design** — city-based matching keeps exchanges practical (in person) and the trust/logistics problem manageable for a v1.

## 4. Core Capabilities (v1 scope)

1. **Account & profile** — sign up with email/password, choose a username and home city; edit city/username/avatar later.
2. **List items** — post an item with title, description, category, condition, and up to 4 photos.
3. **Browse & discover** — a feed of available items in your city, plus a search page with keyword and category/condition/city filters.
4. **Propose trades** — offer 1..N of your own items in exchange for 1..N of another user's items; a trade can bundle multiple items per side.
5. **Negotiate** — each trade has a message thread for the two sides to work out details before accepting.
6. **Respond to offers** — the item owner can accept or decline; after accepting, either side can still withdraw before the trade is confirmed complete.
7. **Complete trades** — the initiator gives final confirmation once the exchange has actually happened; the app then marks all traded items unavailable and cancels any other pending offers on those items.
8. **Manage items and trades** — a page of your own posted items (edit/delete) and a trades inbox showing incoming/outgoing offers and their status.

## 5. Explicitly Out of Scope (v1)

- **Money or payments** of any kind — barter only.
- **Moderation and reporting** of users or listings.
- **Realtime chat** — messages refresh on open and poll periodically, not a live socket connection (see `docs/scale.md`).
- **Native mobile app** — responsive web only.
- **Geolocation/radius search** — a fixed city list, not GPS coordinates.

## 6. Core User Flows

### 6.1 Sign up and post a first item

1. Visitor lands on `/`, sees the public feed, clicks "Sign up."
2. Enters email, password, username, and city.
3. Goes to "My Items" → "New Item," fills in title, description, category, condition, and 1–4 photos.
4. The item appears immediately in "My Items" and in the city feed for others.

### 6.2 Browse and propose a trade

1. Browses the feed or searches by keyword/category/condition/city.
2. Opens an item, sees photos, description, and owner info.
3. Clicks "Offer a trade" (login required).
4. Selects 1..N of their own available items to offer.
5. Submits — creates a `pending` trade and opens a message thread.

### 6.3 Negotiate and respond to an offer

1. The item owner sees the new offer in their trades inbox.
2. Opens the trade: sees both sides' items and the message thread.
3. Messages back and forth (e.g. to agree on a meeting point).
4. Accepts (→ `accepted_by_responder`) or declines (→ `declined`, ending it).

### 6.4 Complete a trade

1. After accepting, either side can still back out (→ `cancelled`) if plans fall through.
2. Once the exchange has actually happened, the initiator confirms completion.
3. The trade becomes `completed`; its items are marked traded and removed from the feed; any other pending offers on those items are auto-cancelled.

### 6.5 Manage items and trades

1. "My Items" shows everything a user has posted, with status and edit/delete actions.
2. "Trades" shows all incoming/outgoing offers with status badges, each opening to its detail/thread.

## 7. Success Criteria (for this course project)

- A visitor can sign up, post an item, browse other items in their city, and complete a full multi-item trade with a second seeded user, entirely through the deployed app.
- Every mutation is protected by both a server-side check and a database-level Row Level Security policy — demonstrable live (e.g. a logged-out or unauthorized request is blocked).
- The trade state machine can't be violated (e.g. accepting an already-declined trade is rejected) — enforced in the database, not just the UI.
