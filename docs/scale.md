# Scale — Swapp

Swapp is built for this course project's actual scale — a handful of demo users, ~40 items. This doc names the v1 simplifications made along the way, why each is fine for now, and what the upgrade path would look like at real scale. None of this needs to happen before submission.

## City-based matching, not geospatial

Location is a fixed list of cities, not GPS coordinates, so matching is a plain equality filter instead of a distance calculation. Trade-off: someone just outside a city boundary won't see nearby listings in the next city over. Upgrade path: store `lat`/`lng` and use PostGIS for radius search, keeping the city as a readable label.

## Offset pagination, not cursor pagination

Search results use `.range()` with an exact row count — simple, and works naturally with plain page-number links. At real scale, counting every row on each page load gets expensive, and rows inserted between page loads can shift results by one. Upgrade path: cursor-based pagination (seek from the last row seen, instead of counting and skipping).

## Keyword search, not full-text search

Search uses a basic `ilike '%term%'` match — no ranking, and can't fully use a standard index. Fine at today's volume. Upgrade path: Postgres full-text search (ranked results, indexed) or a trigram index if fuzzy substring matching needs to stay.

## Polling, not realtime, for chat

The trade chat refreshes every 5 seconds instead of using a live connection — simpler, and fast enough for a two-person negotiation. The real cost is wasted requests from open chat windows that scale with how many trades are being actively negotiated at once, not with total users. Upgrade path: a Supabase Realtime subscription per open trade.

## `items.city` is copied, not looked up live

An item's city is copied from its owner's profile when posted, so the feed query never has to join the profiles table. If a user changes their city later, their existing listings keep showing the old one until edited — acceptable since profile city changes are rare. Upgrade path: a trigger that re-stamps a user's active listings when their profile city changes.

## Indexes

The feed and search rely on one composite index (`city`, `status`, `created_at`), sized to make that query a single index scan rather than a full table scan. This is based on how the index is built, not measured against real data volume — worth a quick `EXPLAIN` check once the dataset is meaningfully bigger than today's.

## What would matter first, if this grew

Roughly in order: the search count/pagination cost, then chat polling load, then keyword search cost, then the city-boundary matching gap. None of these are reachable at this project's actual scale.

## Concurrency is a scale issue too

The one real concurrency bug found in this project (two simultaneous trade completions on the same item, fixed in migration `0010`) only shows up under genuine simultaneous use — something a handful of demo users clicking through a course project would basically never hit, but that real concurrent traffic would eventually surface on its own. The fix (locking the relevant rows before checking them) is what makes it safe at any scale, not just today's.
