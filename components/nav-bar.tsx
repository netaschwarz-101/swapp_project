import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    username = profile?.username ?? null;
  }

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Swapp
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <ThemeToggle />
          <Link
            href="/search"
            className="text-muted-foreground hover:text-foreground"
          >
            Search
          </Link>
          {user ? (
            <>
              <Link
                href="/my-items"
                className="text-muted-foreground hover:text-foreground"
              >
                My Items
              </Link>
              <Link
                href="/trades"
                className="text-muted-foreground hover:text-foreground"
              >
                Trades
              </Link>
              <Link
                href="/profile"
                className="text-muted-foreground hover:text-foreground"
              >
                {username ?? "Profile"}
              </Link>
              <form action={logout}>
                <Button type="submit" variant="outline" size="sm">
                  Log out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
