import { z } from "zod";

export const quickSchema = z.object({
  type: z.enum(["task", "reminder", "note"]),
  text: z.string().min(1),
  datetime: z.string().datetime().nullable(),
  language: z.enum(["ru", "az", "en", "mixed"])
});

export const completeInitialSchema = z.object({
  type: z.literal("complete"),
  text: z.string().min(1)
});

export const completeMatchSchema = z.object({
  id: z.string().nullable(),
  confidence: z.number().min(0).max(1)
});

export const longSchema = z.object({
  summary: z.string().min(1),
  tasks: z.array(z.string().min(1)),
  key_points: z.array(z.string().min(1)),
  language: z.enum(["ru", "az", "en", "mixed"])
});

export type QuickResult = z.infer<typeof quickSchema>;
export type CompleteInitialResult = z.infer<typeof completeInitialSchema>;
export type CompleteMatchResult = z.infer<typeof completeMatchSchema>;
export type LongResult = z.infer<typeof longSchema>;
