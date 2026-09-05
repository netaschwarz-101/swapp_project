# Manual Test Checklist

Things worth checking by hand instead of automating — they need a real file picker or real visual judgment, or aren't worth the setup cost to automate at this project's size. Run through this before final submission and after any change touching these areas. Everything else has an automated test (`docs/test-plan.md`).

## Image upload

- [x] Upload 1 photo when posting an item — appears as a thumbnail immediately, item saves with it.
- [x] Upload the maximum (4) photos — the "Add photo" tile disappears after the 4th.
- [x] Select 5 photos at once — only 4 are accepted, with an "Only 4 photos allowed" message.
- [x] Try uploading a non-image file (e.g. a `.pdf`) — rejected with "Only JPEG, PNG, or WebP images are allowed."
- [x] Try uploading an image over 5MB — rejected with "Each image must be 5MB or smaller."
- [x] Remove a photo before saving — it's gone from the preview and not submitted.
- [x] Edit an existing item's photos — the change persists after saving.
- [x] Check the browser's network tab during upload — the request goes directly to Supabase Storage, not through a Server Action.

## Visual / responsive checks

- [x] Resize to phone width (~375px) on `/`, `/search`, `/my-items`, `/trades`, `/trades/[id]`, an item page, and the item form — nothing overflows, and the trade detail page's panels stack to one column.
- [x] Light and dark mode on every page above — text stays readable everywhere.
- [x] Long content doesn't break layout: a long item title, a long username, a long chat message.
- [x] Empty states look intentional, not blank: an empty city feed, a search with no results, a fresh account's `/my-items`/`/trades`, a new trade's empty chat.
- [x] Status badges are visually distinct at a glance (items and trades).
- [x] The trade detail page's offered → requested arrow renders correctly both stacked and side-by-side.

## Chat polling

- [x] Open the same trade in two sessions (e.g. a normal window + incognito), logged in as each participant. A message sent from one side appears on the other within ~5 seconds, with no manual refresh.
- [x] The message input disables with "This trade is no longer active" on a declined or completed trade.

## Auth edge cases (hard to automate without a mailbox)

- [x] Sign up with a real email, receive and click the confirmation link, land logged in. Note: some email providers pre-fetch links for safety scanning, which can consume the one-time confirmation code before you click it yourself — this shows as "That confirmation link is invalid or expired" even though confirmation already succeeded. If you see that, just log in directly; if it works, the account was confirmed. Confirmed on this project (2026-09-05).
- [ ] Try logging in before confirming — see "Resend confirmation email," use it, get a new email.

## Profile

- [x] `/profile` is a read-only view (avatar, username, city); "Edit profile" reaches `/profile/edit`.
- [x] Change your username to one another demo account already uses — rejected with "That username is already taken."
- [x] Upload an avatar, save, confirm it shows; remove it — falls back to the initials placeholder.
- [x] Change your city — existing posted items keep their old city until edited individually; a newly-posted item uses the new one.
