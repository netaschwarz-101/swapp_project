"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { AvatarUploader } from "@/components/avatar-uploader";
import { CITIES } from "@/lib/constants";
import { updateProfile, type ProfileActionState } from "@/actions/profile";

type Props = {
  defaultValues: {
    username: string;
    city: string;
    avatar_url: string | null;
  };
};

const initialState: ProfileActionState = {};

export function ProfileForm({ defaultValues }: Props) {
  const [state, formAction] = useActionState(updateProfile, initialState);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    defaultValues.avatar_url,
  );
  const [username, setUsername] = useState(defaultValues.username);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Avatar</Label>
        <AvatarUploader
          value={avatarUrl}
          onChange={setAvatarUrl}
          fallback={(username || defaultValues.username)
            .slice(0, 2)
            .toUpperCase()}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          required
          minLength={3}
          maxLength={24}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="city">City</Label>
        <Select name="city" required defaultValue={defaultValues.city}>
          <SelectTrigger id="city">
            <SelectValue placeholder="Select your city" />
          </SelectTrigger>
          <SelectContent>
            {CITIES.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Items you&rsquo;ve already posted keep their original city until
          you edit them individually.
        </p>
      </div>

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}

      <SubmitButton className="w-fit" pendingText="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
