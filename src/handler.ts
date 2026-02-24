import type { IncomingMessage, ServerResponse } from "http";
import { HttpError, jsonResponse } from "./http";

export const withErrorHandling = async (
  res: ServerResponse,
  action: () => Promise<void>
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    if (error instanceof HttpError) {
      jsonResponse(res, error.status, { ok: false, error: error.message });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { ok: false, error: message });
  }
};

export type VercelRequest = IncomingMessage & { method?: string };
