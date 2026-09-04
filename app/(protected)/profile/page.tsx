import Image from "next/image";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // proxy.ts already redirects unauthenticated users here

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, city, avatar_url")
    .eq("id", user.id)
    .single();

  // profiles is populated by a DB trigger the moment auth.users gets a
  // row (0001_profiles.sql) — a signed-in user with no profile row would
  // mean that trigger failed, not a normal state to fall back from
  // silently.
  if (!profile) {
    return (
      <p className="text-destructive text-sm">
        Couldn&rsquo;t load your profile. Try refreshing, or contact
        support if this persists.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <Button asChild size="sm">
          <Link href="/profile/edit">
            <Pencil className="size-4" />
            Edit profile
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-full border">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt=""
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center text-lg font-medium">
              {profile.username.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <p className="text-lg font-semibold">{profile.username}</p>
          <p className="text-muted-foreground text-sm">{profile.city}</p>
        </div>
      </div>
    </div>
  );
}
