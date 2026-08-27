"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { ImageUploader } from "@/components/image-uploader";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CITIES,
  CONDITIONS,
  CONDITION_LABELS,
} from "@/lib/constants";
import type { ItemActionState } from "@/actions/items";

type ItemFormAction = (
  prevState: ItemActionState,
  formData: FormData,
) => Promise<ItemActionState>;

type Props = {
  action: ItemFormAction;
  submitLabel: string;
  defaultValues?: {
    title?: string;
    description?: string;
    category?: string;
    condition?: string;
    city?: string;
    image_urls?: string[];
  };
};

const initialState: ItemActionState = {};

export function ItemForm({ action, submitLabel, defaultValues }: Props) {
  const [state, formAction] = useActionState(action, initialState);
  const [imageUrls, setImageUrls] = useState<string[]>(
    defaultValues?.image_urls ?? [],
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={80}
          defaultValue={defaultValues?.title}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={1000}
          rows={4}
          defaultValue={defaultValues?.description}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Category</Label>
          <Select
            name="category"
            required
            defaultValue={defaultValues?.category}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="condition">Condition</Label>
          <Select
            name="condition"
            required
            defaultValue={defaultValues?.condition}
          >
            <SelectTrigger id="condition">
              <SelectValue placeholder="Select condition" />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="city">City</Label>
        <Select name="city" required defaultValue={defaultValues?.city}>
          <SelectTrigger id="city">
            <SelectValue placeholder="Select city" />
          </SelectTrigger>
          <SelectContent>
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Photos</Label>
        <ImageUploader value={imageUrls} onChange={setImageUrls} />
      </div>

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}

      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
