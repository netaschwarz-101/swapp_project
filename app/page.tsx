import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">
        Trade what you have for what you want.
      </h1>
      <p className="text-muted-foreground max-w-lg">
        Swapp is a local barter marketplace — no prices, no payments. Post items
        you don&rsquo;t need, browse what others in your city are offering, and
        propose a trade.
      </p>
      {user ? (
        <p className="text-muted-foreground text-sm">
          You&rsquo;re logged in. The item feed lands in Phase 3 — for now, try{" "}
          <Link href="/my-items" className="underline underline-offset-4">
            My Items
          </Link>
          .
        </p>
      ) : (
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
