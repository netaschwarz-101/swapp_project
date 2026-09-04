"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { X, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES } from "@/lib/constants";

type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
  /** Initials shown in the placeholder circle when there's no avatar yet. */
  fallback: string;
};

/**
 * Single-image sibling of components/image-uploader.tsx, same upload
 * mechanics (client-side direct upload to Supabase Storage, type/size
 * validated up front) but capped at one file and reusing the item-images
 * bucket rather than a dedicated one — its RLS policy
 * (supabase/migrations/0003_storage.sql) only checks that the path's
 * first folder segment is the caller's own uid(), not that the file is
 * actually attached to an item, so an "<uid>/avatar-<uuid>.ext" path is
 * just as valid as an item photo's path and needed no new migration.
 */
export function AvatarUploader({ value, onChange, fallback }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError("Each image must be 5MB or smaller.");
      return;
    }

    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in to upload an avatar.");
      setUploading(false);
      return;
    }

    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("item-images")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("item-images").getPublicUrl(path);

    onChange(publicUrl);
    setUploading(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-full border">
          {value ? (
            <Image
              src={value}
              alt=""
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center text-lg font-medium">
              {fallback}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="border-input hover:bg-accent inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            {uploading ? "Uploading…" : value ? "Change photo" : "Add photo"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
            >
              <X className="size-3" />
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => handleFile(e.target.files)}
      />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {/* Part of the surrounding <form>'s FormData — empty string when
          there's no avatar, which the Server Action treats as null. */}
      <input type="hidden" name="avatar_url" value={value ?? ""} />
    </div>
  );
}
