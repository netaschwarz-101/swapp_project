import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/profile-form";

export default async function EditProfilePage() {
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
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href="/profile">
          <ArrowLeft className="size-4" />
          Back to profile
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">Edit profile</h1>
        <p className="text-muted-foreground text-sm">
          Update your username, city, and avatar.
        </p>
      </div>
      <ProfileForm defaultValues={profile} />
    </div>
  );
}
