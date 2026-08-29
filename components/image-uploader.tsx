"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { X, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES_PER_ITEM,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/constants";

type Props = {
  value: string[];
  onChange: (urls: string[]) => void;
};

/**
 * Picks up to MAX_IMAGES_PER_ITEM images, validates type/size client-side
 * for fast feedback, and uploads directly to Supabase Storage from the
 * browser (bucket policy scopes writes to the caller's own uid() folder —
 * see supabase/migrations/0003_storage.sql). The resulting public URLs are
 * handed to the parent form via onChange; the Server Action re-validates
 * the URL list server-side before writing the item row (see
 * lib/validation/item.ts) since client-side checks are never trusted alone.
 */
export function ImageUploader({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const remainingSlots = MAX_IMAGES_PER_ITEM - value.length;
    const picked = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setError(
        `Only ${MAX_IMAGES_PER_ITEM} photos allowed — some were skipped.`,
      );
    }

    for (const file of picked) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setError("Only JPEG, PNG, or WebP images are allowed.");
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setError("Each image must be 5MB or smaller.");
        continue;
      }

      setUploading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in to upload images.");
        setUploading(false);
        return;
      }

      const ext = file.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("item-images")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setError(uploadError.message);
        setUploading(false);
        continue;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("item-images").getPublicUrl(path);

      onChange([...value, publicUrl]);
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {value.map((url) => (
          <div
            key={url}
            className="bg-muted relative h-24 w-24 overflow-hidden rounded-md border"
          >
            <Image src={url} alt="" fill className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => removeImage(url)}
              className="bg-foreground/60 text-background absolute top-1 right-1 rounded-full p-1"
              aria-label="Remove image"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {value.length < MAX_IMAGES_PER_ITEM && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-muted-foreground hover:bg-accent flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed disabled:opacity-50"
          >
            <Upload className="size-5" />
            <span className="text-xs">
              {uploading ? "Uploading…" : "Add photo"}
            </span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-muted-foreground text-xs">
        1–{MAX_IMAGES_PER_ITEM} photos, JPEG/PNG/WebP, up to 5MB each.
      </p>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {/* Hidden inputs so the URLs are part of the surrounding <form>'s FormData */}
      {value.map((url) => (
        <input key={url} type="hidden" name="image_urls" value={url} />
      ))}
    </div>
  );
}
