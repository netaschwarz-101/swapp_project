# Product Specification — Swapp

## 1. Problem

People accumulate items they no longer want — clothes that don't fit, gadgets they've upgraded from, books they've read, furniture they've replaced — while at the same time wanting other things they'd rather not pay full price for. Selling individual low-value items (via marketplaces built around money) is high-friction: pricing, payment handling, and the psychological asymmetry of "loss" (paying money) versus "gain" (getting an item) discourage transactions that would otherwise be mutually beneficial. Meanwhile, usable goods are thrown away or left unused because the effort of selling them isn't worth the small amount of money they'd fetch.

Barter — direct item-for-item exchange — removes the money step entirely. It's a natural fit for low-value, high-utility-per-person items, but there's no dedicated low-friction platform for it: today it happens ad hoc in Facebook groups or informal trades among friends, with no structured way to browse what's available, propose a multi-item trade, or track its status.

## 2. Users and Customer

**Users:** individuals who have unused items and are willing to trade them for other items, rather than sell or donate them. No specific demographic restriction — students, young professionals, and households downsizing are likely early adopters given the "trade, don't buy" appeal.

**Customer (who the platform serves commercially):** the platform operator. Swapp itself is free to use in this version, but the business model mirrors other classifieds/marketplace platforms: the operator's future revenue comes from promoted listings (pay to appear higher in a city's feed) and verified-user badges (identity verification for trust), not from a cut of trades — there is no money in trades to take a cut of. This is noted as future work; v1 has no monetization built in.

## 3. Business Value

- **Reduces waste:** unlocks value in items that would otherwise be discarded or sit unused, by matching them with someone who wants them.
- **No money required:** removes the friction and risk (scams, payment disputes, shipping cost negotiation) of a cash marketplace — trades are arranged and completed by the users themselves, in person, like Facebook Marketplace pickups.
- **Low-friction alternative to selling:** posting an item to trade requires no pricing decision, which is often the biggest barrier to listing something in the first place.
- **Local by design:** city-based matching means trades are practical (in-person exchange), which keeps the trust and logistics problem tractable for a v1.

## 4. Core Capabilities (v1 scope)

1. **Account & profile:** sign up with email/password, choose a username and a home city from a fixed list; edit city/username/avatar later.
2. **List items:** post an item with title, description, category, condition, and up to 4 photos.
3. **Browse & discover:** a "For You" feed of available items in the user's city, and a search page with keyword search plus category/condition/city filters.
4. **Propose trades:** from an item's page, offer 1..N of your own available items in exchange for 1..N of the owner's items — a single trade offer can bundle multiple items on each side.
5. **Negotiate:** each trade has a message thread where both sides can discuss details before accepting.
6. **Respond to offers:** the item owner can accept, or decline outright; once accepted, either side can still withdraw before the trade is confirmed complete.
7. **Complete trades:** the initiator gives final confirmation once they've arranged and (in real life) carried out the physical exchange; the app then marks all traded items as no longer available and automatically cancels any other pending offers that referenced those items.
8. **Manage your items and trades:** a page listing your own posted items (with edit/delete) and a trades inbox showing incoming and outgoing offers with their status.

## 5. Explicitly Out of Scope (v1)

- **Money/payments** of any kind — this is barter only.
- **Moderation and reporting** of users or listings (flagged as future work).
- **Realtime chat** — the message thread refreshes on open and polls periodically while open, not a live socket connection (see `docs/architecture.md` for rationale; realtime is a stretch goal only).
- **Native mobile app** — responsive web only.
- **Geolocation/radius search** — location is a user-selected city from a fixed list, not GPS coordinates.

## 6. Core User Flows

### 6.1 Sign up and post a first item

1. Visitor lands on `/`, sees a public feed, clicks "Sign up."
2. Enters email, password, username, and selects their city from a fixed list.
3. Lands on their (now personalized) feed; navigates to "My Items" → "New Item."
4. Fills in title, description, category, condition, uploads 1–4 photos.
5. Item appears immediately in their own "My Items" list and in the city feed for other users.

### 6.2 Browse and propose a trade

1. User browses the feed or searches by keyword/category/condition/city.
2. Opens an item's detail page, sees photos, description, and the owner's info.
3. Clicks "Offer a trade" (login required if not already signed in).
4. Selects 1..N of their own currently-available items to offer in exchange for the requested item(s).
5. Submits — this creates a trade in `pending` status and opens a message thread.

### 6.3 Negotiate and respond to an offer

1. Item owner sees the new offer in their trades inbox.
2. Opens the trade detail page: sees both sides' items, and a message thread.
3. Exchanges messages with the initiator (e.g., to agree on a meeting point).
4. Accepts or declines. Accepting moves the trade to `accepted_by_responder`; declining ends it (`declined`).

### 6.4 Complete a trade

1. After accepting, either side can still back out (moves to `cancelled`) if plans fall through.
2. Once the physical exchange has actually happened, the initiator confirms completion in the app.
3. The trade moves to `completed`; all involved items are marked `traded` and removed from the feed; any other pending offers on those same items are automatically cancelled, since the items are no longer available.

### 6.5 Manage items and trades

1. User visits "My Items" to see all items they've posted, with status (available/traded/deleted) and edit/delete actions.
2. User visits "Trades" to see all incoming and outgoing offers, with status badges (pending, accepted, completed, declined, cancelled), and can open any to see its detail/thread.

## 7. Success Criteria (for this course project)

- A visitor can sign up, post an item, browse other items in their city, and complete a full multi-item trade with a second seeded user end-to-end, entirely through the deployed app.
- Every mutation is protected by both a server-side auth/authorization check and a database-level Row Level Security policy, demonstrable live (e.g., a logged-out or unauthorized request is blocked).
- The trade state machine cannot be violated (e.g., accepting an already-declined trade is rejected) — enforced in the database, not just the UI.
