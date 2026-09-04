# Manual Test Checklist

Things worth checking by hand rather than automating — either because they need a real file picker / real visual judgment, or because the cost of automating them properly (a second image fixture library, cross-browser visual diffing) isn't worth it for a project this size. Run through this before the final submission and after any change touching these areas. Per `docs/test-plan.md`, everything else has an automated test.

## Image upload

- [ ] Upload 1 photo when posting an item — appears as a thumbnail immediately, item saves with it.
- [ ] Upload the maximum (4) photos — the "Add photo" tile disappears once the 4th is added.
- [ ] Try uploading a 5th photo (select 5 files at once) — only the first 4 (up to the remaining slots) are accepted, with the "Only 4 photos allowed" message.
- [ ] Try uploading a non-image file (e.g. a `.pdf`) — rejected client-side with "Only JPEG, PNG, or WebP images are allowed."
- [ ] Try uploading an image over 5MB — rejected client-side with "Each image must be 5MB or smaller."
- [ ] Remove a photo (the × button) before saving — it's gone from the preview and not submitted.
- [ ] Edit an existing item and add/remove photos — the change persists after saving.
- [ ] Open the browser's network tab during upload and confirm the request goes to Supabase Storage's `item-images` bucket, not through a Server Action (client-side direct upload, per `docs/technical-design.md` §2).

## Visual / responsive checks

- [ ] Resize the browser down to a phone width (~375px) on: `/`, `/search`, `/my-items`, `/trades`, `/trades/[id]`, an item detail page, the item form. Nothing overflows horizontally; the trade detail page's offered/requested panels stack to one column instead of squeezing side by side.
- [ ] Light and dark mode (the theme toggle) on every page above — text stays readable, no invisible-text-on-same-color-background spots.
- [ ] Long content doesn't break layout: a very long item title (near 80 chars), a long username, a long chat message (near 1000 chars).
- [ ] Empty states render correctly and aren't just blank: a city with zero items in the feed, a search with zero results, a fresh account's `/my-items` and `/trades`, a new trade's empty chat thread.
- [ ] Status badges are visually distinct at a glance: item "Traded"/"Deleted", trade "Pending"/"Accepted"/"Completed"/"Declined"/"Cancelled" (`components/trade-status-badge.tsx`).
- [ ] The trade detail page's directional arrow (offered → requested) renders correctly in both the stacked (mobile) and side-by-side (desktop) layouts.

## Chat polling (Phase 5)

- [ ] Open the same trade in two different browsers (or a normal window + incognito window) logged in as each participant. Send a message from one side — confirm it appears on the other side within ~5 seconds without a manual refresh.
- [ ] Confirm the message input disables with "This trade is no longer active" once a trade reaches a terminal status (test with a declined or completed trade).

## Auth edge cases (hard to automate without a mailbox)

- [ ] Sign up, actually receive and click the real confirmation email, confirm it lands you logged in.
- [ ] Try logging in before confirming — see the "Resend confirmation email" option, use it, confirm a new email arrives (subject to Supabase's rate limit).

## Profile (Phase 8)

- [ ] Change your username to one another seeded demo account already uses — rejected with "That username is already taken." (the DB's unique constraint, surfaced as a friendly error, not a crash).
- [ ] Upload an avatar, save, reload `/profile` — it's still there. Remove it (the "Remove" link), save — falls back to the initials placeholder.
- [ ] Change your city on `/profile` — your existing posted items keep showing their original city (per the denormalization note in `docs/technical-design.md` §3) until you edit each one individually; a newly-posted item after the change uses the new city.
