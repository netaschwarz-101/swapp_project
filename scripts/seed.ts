/**
 * Seeds ~5 demo users and ~40 items across cities/categories/conditions,
 * so the feed, search, and (later) trades have realistic data to browse
 * and demo against — an empty database makes for a bad presentation.
 *
 * Uses the Supabase *service role* key via the admin API, which is why
 * this can't run from the app itself or from this sandbox: it needs
 * real network access to your Supabase project (this cloud workspace's
 * network is allowlisted to package registries only) and a secret that
 * must never reach client code. Run it from your own machine:
 *
 *   npm run seed
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example —
 * find it in the Supabase dashboard under Settings -> API). Safely
 * re-runnable: it deletes any previously-seeded @swapp.test users first
 * (their own trades explicitly, then the user itself — see the comment
 * in deletePriorDemoUsers for why the order matters — which cascades to
 * their profiles/items via the FKs' `on delete cascade`), so re-running
 * never leaves duplicates, even once the demo accounts have real trade
 * history from actually using the app.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { CITIES } from "../lib/constants";
import type { Category, Condition } from "../lib/constants";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — see .env.example.",
  );
  process.exit(1);
}

// Admin client: service_role bypasses RLS entirely, which is exactly
// what a trusted, developer-run seed script should do (and exactly why
// this key can never ship to the browser).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAIL_DOMAIN = "@swapp.test";
const DEMO_PASSWORD = "SwappDemo123!";

const DEMO_USERS: { email: string; username: string; city: string }[] = [
  { email: `maya${DEMO_EMAIL_DOMAIN}`, username: "maya_tlv", city: "Tel Aviv" },
  {
    email: `danny${DEMO_EMAIL_DOMAIN}`,
    username: "danny_jlm",
    city: "Jerusalem",
  },
  { email: `noa${DEMO_EMAIL_DOMAIN}`, username: "noa_haifa", city: "Haifa" },
  {
    email: `omer${DEMO_EMAIL_DOMAIN}`,
    username: "omer_bs",
    city: "Beer Sheva",
  },
  {
    email: `shira${DEMO_EMAIL_DOMAIN}`,
    username: "shira_rlz",
    city: "Rishon LeZion",
  },
];

// Unsplash direct-CDN URLs (images.unsplash.com/photo-<id>), not the
// deprecated source.unsplash.com redirect service and not an API call —
// this is Unsplash's documented hotlinking allowance, so no API key is
// needed. Each id was pulled from a real unsplash.com search-results page
// for that item's category (Phase 9 follow-up — the previous
// picsum.photos/seed/... URLs were deterministic but content-random, so
// e.g. the "Levi's 501 jeans" item could show literally any photo).
const ITEM_TEMPLATES: {
  title: string;
  category: Category;
  condition: Condition;
  images: string[];
}[] = [
  // clothing
  {
    title: "Levi's 501 jeans, size 32",
    category: "clothing",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1637069585336-827b298fe84a?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1631112230741-446762ee05ac?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Wool winter coat, size M",
    category: "clothing",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1701108112679-ee16096d84d8?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Nike Air Max sneakers, size 42",
    category: "clothing",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Leather jacket, size L",
    category: "clothing",
    condition: "worn",
    images: [
      "https://images.unsplash.com/photo-1727524366429-27de8607d5f6?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Summer dress, size S",
    category: "clothing",
    condition: "new",
    images: [
      "https://images.unsplash.com/photo-1631287381310-925554130169?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1648027286072-fb339b0d0c06?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Wool sweater, size M",
    category: "clothing",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1581497396202-5645e76a3a8e?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Hiking boots, size 40",
    category: "clothing",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1599012307605-23a0ebe4d321?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1530792271526-7ddf516473b3?w=600&h=600&fit=crop&q=80",
    ],
  },
  // electronics
  {
    title: "iPhone 12, 128GB, cracked screen",
    category: "electronics",
    condition: "worn",
    images: [
      "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Sony WH-1000XM4 headphones",
    category: "electronics",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Kindle Paperwhite (10th gen)",
    category: "electronics",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1611328857214-a5aae689f21a?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Nintendo Switch + 2 controllers",
    category: "electronics",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1612036781124-847f8939b154?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1634924052395-c8a61c1caedb?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Bluetooth speaker, JBL Flip 5",
    category: "electronics",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1589256469067-ea99122bbdc4?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "USB-C monitor, 24-inch",
    category: "electronics",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1484788984921-03950022c9ef?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Wireless mouse + keyboard set",
    category: "electronics",
    condition: "new",
    images: [
      "https://images.unsplash.com/photo-1585314614250-d213876625e1?w=600&h=600&fit=crop&q=80",
    ],
  },
  // books
  {
    title: "Sapiens by Yuval Noah Harari",
    category: "books",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1610116306796-6fea9f4fae38?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1541963463532-d68292c34b19?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "The Hebrew Bible, study edition",
    category: "books",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1497621122273-f5cfb6065c56?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Introduction to Algorithms (CLRS)",
    category: "books",
    condition: "worn",
    images: [
      "https://images.unsplash.com/photo-1517770413964-df8ca61194a6?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1669652639337-c513cc42ead6?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Harry Potter box set (1-7)",
    category: "books",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1593430980369-68efc5a5eb34?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Atomic Habits by James Clear",
    category: "books",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1576872381149-7847515ce5d8?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Hebrew-English dictionary",
    category: "books",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1583361704493-d4d4d1b1d70a?w=600&h=600&fit=crop&q=80",
    ],
  },
  // home
  {
    title: "Cast iron skillet, 10-inch",
    category: "home",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1637739699971-7d4d5194e75c?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1716488286931-79cef654e08c?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "IKEA MALM desk, white",
    category: "home",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1518655048521-f130df041f66?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Espresso machine, semi-automatic",
    category: "home",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1620807773206-49c1f2957417?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1616388761741-a5936c6f61f6?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Set of 4 dining chairs",
    category: "home",
    condition: "worn",
    images: [
      "https://images.unsplash.com/photo-1705169612592-32610774a5d0?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Standing lamp, brushed steel",
    category: "home",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Ceramic dinnerware set (12 pcs)",
    category: "home",
    condition: "new",
    images: [
      "https://images.unsplash.com/photo-1571987530791-58e3e7744d99?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Memory foam pillow, 2-pack",
    category: "home",
    condition: "new",
    images: [
      "https://images.unsplash.com/photo-1600414428640-f78a67c2aa3b?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1629949009765-40fc74c9ec21?w=600&h=600&fit=crop&q=80",
    ],
  },
  // sports
  {
    title: "Road bike, 54cm frame",
    category: "sports",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1713184149461-69b0abeb3daa?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Yoga mat + block set",
    category: "sports",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Tennis racket, Wilson Pro Staff",
    category: "sports",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1617883861744-13b534e3b928?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Adjustable dumbbells, 2x10kg",
    category: "sports",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1638536532686-d610adfc8e5c?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1576678927484-cc907957088c?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Surfboard, 6'2\", used but solid",
    category: "sports",
    condition: "worn",
    images: [
      "https://images.unsplash.com/photo-1531722569936-825d3dd91b15?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Camping tent, 4-person",
    category: "sports",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1631635589499-afd87d52bf64?w=600&h=600&fit=crop&q=80",
    ],
  },
  // other
  {
    title: "Acoustic guitar, Yamaha F310",
    category: "other",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Board game bundle (5 games)",
    category: "other",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1629760946220-5693ee4c46ac?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1547638375-ebf04735d792?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Vinyl record collection (~30)",
    category: "other",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1580656449278-e8381933522c?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Polaroid camera + film pack",
    category: "other",
    condition: "like_new",
    images: [
      "https://images.unsplash.com/photo-1696408291154-bc4f4c890ad5?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1623082185808-579b6093d0dd?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Houseplant collection, 3 pots",
    category: "other",
    condition: "new",
    images: [
      "https://images.unsplash.com/photo-1604762524889-3e2fcc145683?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Skateboard, complete setup",
    category: "other",
    condition: "worn",
    images: [
      "https://images.unsplash.com/photo-1673378963667-fac1c7be88ca?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1597019558926-3eef445fdf60?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Watercolor paint set",
    category: "other",
    condition: "new",
    images: [
      "https://images.unsplash.com/photo-1630609083938-3acb39a06392?w=600&h=600&fit=crop&q=80",
    ],
  },
  {
    title: "Backpack, 40L hiking pack",
    category: "other",
    condition: "used",
    images: [
      "https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&h=600&fit=crop&q=80",
      "https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=600&h=600&fit=crop&q=80",
    ],
  },
];

async function deletePriorDemoUsers() {
  console.log("Checking for previously-seeded demo users...");
  let page = 1;
  const toDelete: string[] = [];
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(DEMO_EMAIL_DOMAIN)) toDelete.push(u.id);
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  for (const id of toDelete) {
    // Delete this user's trades (either side) before the user itself.
    // trade_items.item_id has no ON DELETE CASCADE from items
    // (0005_trades.sql, deliberately, so trade history always points at
    // something real) — deleting the user cascades auth.users -> profiles
    // -> items, and if any trade_items row still referenced one of those
    // items at that point, the item delete hits a live foreign-key
    // reference and the whole deleteUser() call fails with a generic
    // "Database error deleting user". Every trade touching this user's
    // items necessarily has them as initiator or responder (the RLS
    // policy on trade_items inserts enforces that), so this explicit
    // delete — which itself cascades to trade_items/messages via
    // trade_id — guarantees the right order instead of depending on how
    // Postgres happens to sequence a multi-branch cascade from one row.
    const { error: tradesError } = await admin
      .from("trades")
      .delete()
      .or(`initiator_id.eq.${id},responder_id.eq.${id}`);
    if (tradesError) throw tradesError;

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  if (toDelete.length > 0) {
    console.log(
      `Deleted ${toDelete.length} previously-seeded demo user(s) (profiles/items/trades cascade).`,
    );
  }
}

async function createDemoUsers() {
  const ids: string[] = [];
  for (const u of DEMO_USERS) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true, // demo accounts, no need to prove mailbox ownership
      user_metadata: { username: u.username, city: u.city },
    });
    if (error) throw error;
    ids.push(data.user.id);
    console.log(`Created ${u.email} (${u.username}, ${u.city})`);
  }
  return ids;
}

async function createDemoItems(ownerIds: string[]) {
  // Owner cycles every 5 items (i % 5) and city cycles every 5 *items of
  // the same owner slot* (Math.floor(i / 5) % 10), not every item — if
  // both cycled off the same `i` directly (i % 5 and i % 10), every
  // city's items would always land on exactly one fixed owner, since 10
  // is a multiple of 5. That's exactly what happened the first time:
  // every item in a given demo user's own city turned out to be owned
  // by that same user, so their "For You" feed (which excludes your own
  // items) came back empty for every single demo account. Grouping city
  // by row instead of by item breaks that correlation: each block of 5
  // consecutive items has one item per owner before the city changes.
  const rows = ITEM_TEMPLATES.map((tpl, i) => ({
    owner_id: ownerIds[i % ownerIds.length],
    title: tpl.title,
    description: `${tpl.title} — barely used, posted as part of Swapp's demo data.`,
    category: tpl.category,
    condition: tpl.condition,
    city: CITIES[Math.floor(i / ownerIds.length) % CITIES.length],
    image_urls: tpl.images,
  }));

  const { error } = await admin.from("items").insert(rows);
  if (error) throw error;
  console.log(`Inserted ${rows.length} demo items.`);
}

async function main() {
  await deletePriorDemoUsers();
  const ownerIds = await createDemoUsers();
  await createDemoItems(ownerIds);
  console.log(
    `\nDone. Demo login: any of the emails above with password "${DEMO_PASSWORD}".`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
