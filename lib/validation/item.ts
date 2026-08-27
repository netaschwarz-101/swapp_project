import { z } from "zod";
import {
  CATEGORIES,
  CITIES,
  CONDITIONS,
  MAX_IMAGES_PER_ITEM,
} from "@/lib/constants";

export const itemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(80, "Title must be at most 80 characters"),
  description: z
    .string()
    .trim()
    .max(1000, "Description must be at most 1000 characters")
    .optional()
    .default(""),
  category: z.enum(CATEGORIES, { message: "Select a category" }),
  condition: z.enum(CONDITIONS, { message: "Select a condition" }),
  city: z.enum(CITIES, { message: "Select a city" }),
  image_urls: z
    .array(z.string().url())
    .min(1, "Add at least 1 photo")
    .max(MAX_IMAGES_PER_ITEM, `Add at most ${MAX_IMAGES_PER_ITEM} photos`),
});

export type ItemInput = z.infer<typeof itemSchema>;
