# Architecture — Swapp

## 1. High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (client)                          │
│  React Server Components (rendered HTML) + minimal client JS     │
│  (form inputs, chat polling, image picker)                       │
└───────────────┬────────────────────────────────────┬─────────────┘
                │ navigations / reads                │ form submits
                ▼                                     ▼
┌─────────────────────────────┐         ┌─────────────────────────────┐
│   Next.js Server Components  │         │      Next.js Server Actions  │
│   (data reads: feed, item,   │         │  (mutations: create item,    │
│    trade pages)              │         │   make offer, accept/decline,│
│                               │         │   send message, complete)    │
└───────────────┬───────────────┘         └───────────────┬─────────────┘
                │ supabase server client (cookie session)  │
                ▼                                           ▼
┌───────────────────────────────────────────────────────────────────┐
│                          Supabase                                  │
│  Postgres (tables + RLS policies + complete_trade() function)      │
│  Auth (email/password, cookie sessions via @supabase/ssr)          │
│  Storage (public-read bucket for item photos)                      │
└───────────────────────────────────────────────────────────────────┘
```

There is no custom backend server or Express layer. Next.js's own server runtime (Server Components for reads, Server Actions for writes) is the entire "backend" — it talks directly to Supabase using a session-scoped Postgres client, so authorization is enforced twice: once in application code (a guard at the top of each Server Action) and once, non-negotiably, by Postgres Row Level Security. API route handlers are used only where a Server Action is awkward (e.g. returning a signed upload URL to a browser `fetch`), not as a general pattern.

## 2. Why This Stack

| Choice                                         | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js App Router                             | Course-mandated. Server Components let data-fetching code run close to the database without a hand-rolled API layer, which is the biggest scope-reducer available for a solo, time-boxed project.                                                                                                                                                                                                                                                    |
| TypeScript (strict)                            | Catches a large class of bugs (wrong shape passed to a Server Action, mismatched props) before runtime, which matters more on a project with no team code review.                                                                                                                                                                                                                                                                                    |
| Supabase                                       | Course-mandated. Gets Postgres, Auth, and Storage from one provider with minimal glue code, and its Row Level Security integrates with Auth's JWTs, which is exactly the authorization model this app needs (see §5).                                                                                                                                                                                                                                |
| Tailwind + shadcn/ui                           | Fast, consistent UI without hand-writing a design system; shadcn components are copied into the repo (not an opaque dependency), so they're easy to read and modify — appropriate for a project the developer must be able to explain line-by-line.                                                                                                                                                                                                  |
| zod                                            | Single source of truth for input shape, shared between client-side form validation and server-side validation in Server Actions — avoids validating the same data two different ways.                                                                                                                                                                                                                                                                |
| No global client state library (Redux/Zustand) | The app's data is almost entirely server state (items, trades, messages) fetched fresh per navigation via Server Components and `revalidatePath` after mutations. The only client state is local to a component (form field values, whether the chat is currently polling) — plain `useState`/`useEffect` is sufficient and easier to explain than introducing a client store whose cache would just have to be kept in sync with the server anyway. |
| Vercel                                         | Course-mandated deploy target; first-class Next.js support (Server Components, Server Actions, edge middleware all work without extra configuration).                                                                                                                                                                                                                                                                                                |

## 3. Database Entities (overview — full schema in `technical-design.md`)

- **profiles** — one row per user, extends `auth.users` with `username` and `city`.
- **items** — a listing posted by a profile; belongs to exactly one owner, has a status (`available`/`traded`/`deleted`).
- **trades** — a single negotiation between an `initiator` and a `responder`, with a status that follows a fixed state machine.
- **trade_items** — join table linking a trade to the specific items on each side (`offered` vs `requested`), since a trade can bundle multiple items per side.
- **messages** — chat messages scoped to a trade, visible only to that trade's two participants.

Relationships: `profiles 1—N items`, `profiles 1—N trades` (as initiator or responder), `trades 1—N trade_items`, `items 1—N trade_items` (an item can appear in multiple trade proposals until one completes), `trades 1—N messages`.

## 4. Pages (see `docs/technical-design.md §4` for the full route table)

Public: landing/feed (`/`), search (`/search`), item detail (`/items/[id]`), login/signup.
Auth-required: item create/edit, my-items, trades inbox, trade detail, offer builder, profile.

Reads happen in Server Components directly against Supabase (RLS-filtered per the requesting user). Writes happen in Server Actions colocated with the page that triggers them, each following the same fixed sequence (see §6).

## 5. Roles, Auth, and Authorization

There is a single user role — no admin/moderator role exists in v1 (moderation is out of scope). "Authorization" in this app is entirely about **who can see or act on which rows**, not feature-level roles:

- **Authentication:** Supabase Auth (email/password), session stored in cookies via `@supabase/ssr`, so both Server Components and Server Actions can read the current user from the request without a client-side token dance.
- **Route protection:** Next.js middleware checks for a session cookie and redirects unauthenticated users away from auth-required routes (item creation, my-items, trades, profile); browsing (`/`, `/search`, `/items/[id]`) stays public so the feed is demoable without an account, but any mutation still requires login.
- **Data authorization — Row Level Security (RLS) on every table.** This is the centerpiece of the security model, not a backup: even if a Server Action's own guard had a bug, Postgres itself refuses to return or modify rows the requesting user (identified by their Auth JWT, via `auth.uid()`) isn't allowed to touch. For example, `trades` RLS restricts every read and update to rows where the requester is the `initiator_id` or `responder_id` — user A's Postgres session physically cannot fetch user B's trade, regardless of what the application code does or doesn't check. Full policy text lives in `docs/technical-design.md` and `docs/security.md`.
- **Server Actions add a second, earlier layer** (auth check → validate → authorize/state-check → mutate) so invalid requests fail fast with a clear error instead of relying solely on a Postgres error bubbling up — see the data flow below.

## 6. Data Flow

**Reads:** Browser navigation → Server Component → Supabase server client (cookie session attached) → Postgres, RLS-filtered → rendered HTML returned to the browser. No client-side data fetching library is needed for the primary flows.

**Writes:** Client form → Server Action (still on the server, invoked via a form `action` or a bound function) → `zod` schema parse → auth check (is there a session?) → authorization/state check (does this user own this row / is this transition legal?) → Supabase write (still RLS-enforced as a second layer) → `revalidatePath` on the affected route(s) → Next.js re-renders the affected Server Components with fresh data on the next request.

This "server action → revalidate" loop replaces the fetch-mutate-refetch-setState cycle a client-state-managed SPA would need, which is the main justification for skipping a client state library.

## 7. External Libraries

| Library                                                | Purpose                                                   |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `@supabase/supabase-js`, `@supabase/ssr`               | Supabase client (browser + server, cookie-based sessions) |
| `zod`                                                  | Schema validation shared by forms and Server Actions      |
| `tailwindcss`, `shadcn/ui` (built on Radix primitives) | Styling and accessible UI primitives                      |
| `vitest`                                               | Unit tests (Phase 6)                                      |
| `@playwright/test`                                     | End-to-end tests (Phase 6)                                |

## 8. Known Limitations (expanded in `docs/scale.md`, Phase 7)

City-based (not geospatial) matching, offset pagination, `ilike` search instead of full-text search, and polling instead of realtime chat are all deliberate v1 simplifications, chosen to keep the system small enough for one developer to fully understand and defend, with a documented upgrade path noted at each point.
