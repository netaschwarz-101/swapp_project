/**
 * Deletes leftover E2E-test items (title prefixed "E2E ...") accumulated
 * across many `npm run test:e2e` runs — see docs/decisions.md, Phase 7
 * follow-up #3: every failed run's postItem() calls that succeeded before
 * a later step failed leave the item behind. Cosmetic debris only (RLS
 * already scopes everything to its owner), but noisy in the feed/My Items
 * view, and some of these items' images never finished uploading before a
 * run died — hence broken/blank image tiles in the UI.
 *
 * Uses the Supabase *service role* key via the admin API, same reason as
 * scripts/seed.ts: this needs real network access to your Supabase
 * project, which the sandbox this was written in doesn't have. Run it
 * from your own machine:
 *
 *   npm run cleanup:test-items
 *
 * Safe to re-run — only touches items whose title starts with "E2E ",
 * plus the trades/trade_items/messages/storage files that reference them
 * (trade_items.item_id has no on-delete-cascade, so those have to go
 * first or the item delete fails with a foreign-key violation).
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — see .env.example.",
  );
  process.exit(1);
}

// Admin client: service_role bypasses RLS entirely, same as scripts/seed.ts.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = "item-images";

// image_urls stores the full public URL (components/image-uploader.tsx's
// getPublicUrl() output) — storage.remove() wants just the object path
// that comes after ".../object/public/item-images/".
function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

async function main() {
  const { data: items, error: itemsErr } = await admin
    .from("items")
    .select("id, title, image_urls")
    .ilike("title", "E2E %");
  if (itemsErr) throw itemsErr;

  if (!items || items.length === 0) {
    console.log("No E2E test items found — nothing to clean up.");
    return;
  }

  const itemIds = items.map((i) => i.id);
  console.log(`Found ${itemIds.length} E2E test item(s).`);

  // Any trade that references one of these items (offered or requested
  // side) must be deleted first — deleting the trade cascades to its own
  // trade_items and messages rows (both `on delete cascade` on trade_id),
  // clearing the item_id references that would otherwise block the item
  // delete below.
  const { data: tradeItemRows, error: tradeItemsErr } = await admin
    .from("trade_items")
    .select("trade_id")
    .in("item_id", itemIds);
  if (tradeItemsErr) throw tradeItemsErr;

  const tradeIds = [...new Set((tradeItemRows ?? []).map((r) => r.trade_id))];
  if (tradeIds.length > 0) {
    console.log(
      `Deleting ${tradeIds.length} test trade(s) referencing these items...`,
    );
    const { error: delTradesErr } = await admin
      .from("trades")
      .delete()
      .in("id", tradeIds);
    if (delTradesErr) throw delTradesErr;
  }

  // Best-effort storage cleanup so orphaned files don't pile up in the
  // bucket. Not fatal if it fails — the row delete below is what actually
  // gets these items out of the feed.
  const paths = items
    .flatMap((i) => i.image_urls ?? [])
    .map(storagePathFromPublicUrl)
    .filter((p): p is string => p !== null);
  if (paths.length > 0) {
    console.log(`Deleting ${paths.length} storage file(s)...`);
    const { error: storageErr } = await admin.storage
      .from(BUCKET)
      .remove(paths);
    if (storageErr) {
      console.warn("Storage cleanup failed (continuing):", storageErr.message);
    }
  }

  const { error: delItemsErr } = await admin
    .from("items")
    .delete()
    .in("id", itemIds);
  if (delItemsErr) throw delItemsErr;

  console.log(`Deleted ${itemIds.length} E2E test item(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
