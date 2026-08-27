import { z } from "zod";

export const messageSchema = z.object({
  trade_id: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Message can't be empty")
    .max(1000, "Message must be at most 1000 characters"),
});

export type MessageInput = z.infer<typeof messageSchema>;
