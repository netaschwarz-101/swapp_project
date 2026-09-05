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

There's no custom backend server. Next.js's own server runtime — Server Components for reads, Server Actions for writes — is the entire backend, talking directly to Supabase over a session-scoped Postgres client. Authorization is checked twice: once in application code, and once by Postgres Row Level Security. API route handlers are used only where a Server Action doesn't fit (e.g. returning a signed upload URL to a browser `fetch`), not as a general pattern.

## 2. Why This Stack

| Choice | Why |
| --- | --- |
| Next.js App Router | Course-mandated. Server Components fetch data close to the database with no hand-rolled API layer — the biggest scope-reducer for a solo project. |
| TypeScript (strict) | Catches shape/type bugs before runtime, which matters more with no team code review. |
| Supabase | Course-mandated. Postgres, Auth, and Storage from one provider, with RLS built on Auth's JWTs. |
| Tailwind + shadcn/ui | Fast, consistent UI. shadcn components are copied into the repo, not an opaque dependency, so they're easy to read and modify. |
| zod | One source of truth for input shape, shared by client-side and server-side validation. |
| No client state library | Data is almost entirely server state, refetched via Server Components and `revalidatePath`. The little client state that exists (form fields, polling state) doesn't need a store. |
| Vercel | Course-mandated deploy target with first-class Next.js support. |

## 3. Database Entities (overview — full schema in `technical-design.md`)

- **profiles** — one row per user, extending `auth.users` with `username` and `city`.
- **items** — a listing posted by a profile, with a status (`available`/`traded`/`deleted`).
- **trades** — a negotiation between an initiator and a responder, following a fixed state machine.
- **trade_items** — join table linking a trade to its items on each side (`offered` vs `requested`).
- **messages** — chat messages scoped to a trade, visible only to its two participants.

Relationships: `profiles 1—N items`, `profiles 1—N trades` (as initiator or responder), `trades 1—N trade_items`, `items 1—N trade_items`, `trades 1—N messages`.

## 4. Pages (full route table in `docs/technical-design.md §4`)

Public: landing/feed (`/`), search, item detail, login/signup.
Auth-required: item create/edit, my-items, trades inbox, trade detail, offer builder, profile.

Reads happen in Server Components, RLS-filtered per user. Writes happen in Server Actions colocated with the page that triggers them.

## 5. Roles, Auth, and Authorization

There's a single user role — no admin/moderator role in v1. Authorization here is about who can see or act on which rows, not feature-level roles.

- **Authentication:** Supabase Auth (email/password), session in cookies via `@supabase/ssr`.
- **Route protection:** middleware redirects unauthenticated users away from auth-required routes; browsing stays public so the feed is demoable without an account.
- **Row Level Security on every table** is the real security boundary, not a backup — even if a Server Action's own check had a bug, Postgres itself refuses to return or modify rows the requesting user isn't allowed to touch. Full policy details in `docs/security.md`.
- **Server Actions add an earlier layer** (auth check → validate → authorize → mutate) so invalid requests fail fast with a clear message instead of a raw database error.

## 6. Data Flow

**Reads:** navigation → Server Component → Supabase (RLS-filtered) → rendered HTML.

**Writes:** form → Server Action → zod validation → auth/authorization check → Supabase write (RLS-enforced again) → `revalidatePath` → fresh data on next render.

This "action → revalidate" loop replaces the fetch/mutate/refetch cycle a client-managed SPA would need, which is why no client state library is used.

## 7. External Libraries

| Library | Purpose |
| --- | --- |
| `@supabase/supabase-js`, `@supabase/ssr` | Supabase client (browser + server, cookie sessions) |
| `zod` | Schema validation shared by forms and Server Actions |
| `tailwindcss`, `shadcn/ui` | Styling and accessible UI primitives |
| `vitest` | Unit tests |
| `@playwright/test` | End-to-end tests |

## 8. Known Limitations (expanded in `docs/scale.md`)

City-based (not geospatial) matching, offset pagination, keyword (not full-text) search, and polling (not realtime) chat are deliberate v1 simplifications, chosen to keep the system small enough for one developer to fully understand and defend — each has a documented upgrade path.
