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
 * re-runnable: it deletes any previously-seeded @swapp.test users first,
 * which cascades to their profiles/items via the FKs' `on delete
 * cascade`, so re-running never leaves duplicates.
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

const ITEM_TEMPLATES: {
  title: string;
  category: Category;
  condition: Condition;
}[] = [
  // clothing
  {
    title: "Levi's 501 jeans, size 32",
    category: "clothing",
    condition: "used",
  },
  {
    title: "Wool winter coat, size M",
    category: "clothing",
    condition: "like_new",
  },
  {
    title: "Nike Air Max sneakers, size 42",
    category: "clothing",
    condition: "used",
  },
  { title: "Leather jacket, size L", category: "clothing", condition: "worn" },
  { title: "Summer dress, size S", category: "clothing", condition: "new" },
  {
    title: "Wool sweater, size M",
    category: "clothing",
    condition: "like_new",
  },
  { title: "Hiking boots, size 40", category: "clothing", condition: "used" },
  // electronics
  {
    title: "iPhone 12, 128GB, cracked screen",
    category: "electronics",
    condition: "worn",
  },
  {
    title: "Sony WH-1000XM4 headphones",
    category: "electronics",
    condition: "like_new",
  },
  {
    title: "Kindle Paperwhite (10th gen)",
    category: "electronics",
    condition: "used",
  },
  {
    title: "Nintendo Switch + 2 controllers",
    category: "electronics",
    condition: "used",
  },
  {
    title: "Bluetooth speaker, JBL Flip 5",
    category: "electronics",
    condition: "used",
  },
  {
    title: "USB-C monitor, 24-inch",
    category: "electronics",
    condition: "like_new",
  },
  {
    title: "Wireless mouse + keyboard set",
    category: "electronics",
    condition: "new",
  },
  // books
  {
    title: "Sapiens by Yuval Noah Harari",
    category: "books",
    condition: "used",
  },
  {
    title: "The Hebrew Bible, study edition",
    category: "books",
    condition: "like_new",
  },
  {
    title: "Introduction to Algorithms (CLRS)",
    category: "books",
    condition: "worn",
  },
  { title: "Harry Potter box set (1-7)", category: "books", condition: "used" },
  {
    title: "Atomic Habits by James Clear",
    category: "books",
    condition: "like_new",
  },
  { title: "Hebrew-English dictionary", category: "books", condition: "used" },
  // home
  { title: "Cast iron skillet, 10-inch", category: "home", condition: "used" },
  { title: "IKEA MALM desk, white", category: "home", condition: "used" },
  {
    title: "Espresso machine, semi-automatic",
    category: "home",
    condition: "like_new",
  },
  { title: "Set of 4 dining chairs", category: "home", condition: "worn" },
  {
    title: "Standing lamp, brushed steel",
    category: "home",
    condition: "used",
  },
  {
    title: "Ceramic dinnerware set (12 pcs)",
    category: "home",
    condition: "new",
  },
  { title: "Memory foam pillow, 2-pack", category: "home", condition: "new" },
  // sports
  { title: "Road bike, 54cm frame", category: "sports", condition: "used" },
  { title: "Yoga mat + block set", category: "sports", condition: "like_new" },
  {
    title: "Tennis racket, Wilson Pro Staff",
    category: "sports",
    condition: "used",
  },
  {
    title: "Adjustable dumbbells, 2x10kg",
    category: "sports",
    condition: "used",
  },
  {
    title: "Surfboard, 6'2\", used but solid",
    category: "sports",
    condition: "worn",
  },
  {
    title: "Camping tent, 4-person",
    category: "sports",
    condition: "like_new",
  },
  // other
  {
    title: "Acoustic guitar, Yamaha F310",
    category: "other",
    condition: "used",
  },
  {
    title: "Board game bundle (5 games)",
    category: "other",
    condition: "used",
  },
  {
    title: "Vinyl record collection (~30)",
    category: "other",
    condition: "used",
  },
  {
    title: "Polaroid camera + film pack",
    category: "other",
    condition: "like_new",
  },
  {
    title: "Houseplant collection, 3 pots",
    category: "other",
    condition: "new",
  },
  { title: "Skateboard, complete setup", category: "other", condition: "worn" },
  { title: "Watercolor paint set", category: "other", condition: "new" },
  { title: "Backpack, 40L hiking pack", category: "other", condition: "used" },
];

function imageUrls(seed: string, count: number) {
  return Array.from(
    { length: count },
    (_, i) => `https://picsum.photos/seed/${seed}-${i}/600/600`,
  );
}

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
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  if (toDelete.length > 0) {
    console.log(
      `Deleted ${toDelete.length} previously-seeded demo user(s) (profiles/items cascade).`,
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
  const rows = ITEM_TEMPLATES.map((tpl, i) => ({
    owner_id: ownerIds[i % ownerIds.length],
    title: tpl.title,
    description: `${tpl.title} — barely used, posted as part of Swapp's demo data.`,
    category: tpl.category,
    condition: tpl.condition,
    city: CITIES[i % CITIES.length],
    image_urls: imageUrls(`swapp-${i}`, i % 2 === 0 ? 2 : 1),
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
