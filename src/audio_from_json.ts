import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { HttpError } from "./http";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export type UploadedAudio = {
  filepath: string;
  mimetype: string;
  originalFilename?: string;
  size: number;
};

function randomId() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyCrypto: any = crypto as any;
  return typeof anyCrypto.randomUUID === "function"
    ? anyCrypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
}

export async function parseAudioFromJson(req: any): Promise<UploadedAudio> {
  // Vercel Node function body may already be an object, or a string
  let body: any = req.body;

  if (!body) throw new HttpError(400, "Missing body");
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { throw new HttpError(400, "Invalid JSON"); }
  }

  const b64 = body.audio_base64;
  const mimetype = body.mimetype || "audio/m4a";
  const originalFilename = body.filename || undefined;

  if (!b64 || typeof b64 !== "string") throw new HttpError(400, "Missing audio_base64");

  // allow "data:audio/m4a;base64,...."
  const pureB64 = b64.includes("base64,") ? b64.split("base64,").pop()! : b64;

  let buf: Buffer;
  try {
    buf = Buffer.from(pureB64, "base64");
  } catch {
    throw new HttpError(400, "Invalid base64");
  }

  if (!buf.length) throw new HttpError(400, "Empty audio");
  if (buf.length > MAX_FILE_SIZE) throw new HttpError(413, "Audio too large");

  const filepath = path.join(os.tmpdir(), `audio-${randomId()}`);
  fs.writeFileSync(filepath, buf);

  return { filepath, mimetype, originalFilename, size: buf.length };
}
