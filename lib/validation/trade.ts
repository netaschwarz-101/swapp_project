import { z } from "zod";

export const createTradeSchema = z.object({
  responder_id: z.string().uuid(),
  offered_item_ids: z.array(z.string().uuid()).min(1, "Offer at least 1 item"),
  requested_item_ids: z
    .array(z.string().uuid())
    .min(1, "Request at least 1 item"),
});

export type CreateTradeInput = z.infer<typeof createTradeSchema>;
