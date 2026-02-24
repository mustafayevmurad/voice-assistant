import Busboy from "busboy";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import type { VercelRequest } from "./handler";
import { HttpError } from "./http";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "audio/x-m4a",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/x-pn-wav",
  "audio/caf",
  "audio/x-caf",
]);

export type UploadedAudio = {
  filepath: string;
  mimetype: string;
  originalFilename?: string;
  size: number;
};

function randomId(): string {
  // node 22 has crypto.randomUUID, but keep fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyCrypto: any = crypto as any;
  return typeof anyCrypto.randomUUID === "function"
    ? anyCrypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
}

function normalizeHeaders(req: VercelRequest): Record<string, string> {
  const headersObj: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h: any = (req as any).headers;

  if (h && typeof h.get === "function" && typeof h.entries === "function") {
    // Fetch Headers instance
    for (const [k, v] of h.entries()) {
      headersObj[String(k).toLowerCase()] = String(v);
    }
  } else if (h && typeof h === "object") {
    // Plain object headers
    for (const k of Object.keys(h)) {
      const v = h[k];
      if (typeof v === "string") headersObj[k.toLowerCase()] = v;
      else if (Array.isArray(v) && v.length) headersObj[k.toLowerCase()] = String(v[0]);
      else if (v != null) headersObj[k.toLowerCase()] = String(v);
    }
  }

  return headersObj;
}

export async function parseAudioUpload(req: VercelRequest): Promise<UploadedAudio> {
  const headersObj = normalizeHeaders(req);
  const contentType = headersObj["content-type"];

  if (!contentType || !contentType.includes("multipart/form-data")) {
    throw new HttpError(400, "Invalid multipart payload");
  }

  // VercelRequest must be a readable stream for busboy
  const reqAny = req as any;
  if (!reqAny || typeof reqAny.pipe !== "function") {
    throw new HttpError(500, "Request is not a stream");
  }

  return await new Promise<UploadedAudio>((resolve, reject) => {
    let found = false;
    let finished = false;

    const bb = Busboy({
      headers: headersObj,
      limits: { files: 1, fileSize: MAX_FILE_SIZE },
    });

    bb.on("file", (fieldname, file, info) => {
      if (fieldname !== "file") {
        file.resume();
        return;
      }

      found = true;

      const mimetype = info?.mimeType ? String(info.mimeType) : "";
      const originalFilename = info?.filename ? String(info.filename) : undefined;

      if (!mimetype || !ALLOWED_MIME.has(mimetype)) {
        file.resume();
        reject(new HttpError(400, "Unsupported file type"));
        return;
      }

      const filepath = path.join(os.tmpdir(), `audio-${randomId()}`);
      let size = 0;

      const out = fs.createWriteStream(filepath);

      file.on("data", (chunk: Buffer) => {
        size += chunk.length;
      });

      file.on("limit", () => {
        out.destroy();
        try {
          fs.unlinkSync(filepath);
        } catch {}
        reject(new HttpError(413, "Audio too large"));
      });

      out.on("error", (err) => {
        try {
          fs.unlinkSync(filepath);
        } catch {}
        reject(err);
      });

      out.on("finish", () => {
        resolve({
          filepath,
          mimetype,
          originalFilename,
          size,
        });
      });

      file.pipe(out);
    });

    bb.on("error", (err) => reject(err));

    bb.on("finish", () => {
      finished = true;
      if (!found) reject(new HttpError(400, "Missing file"));
    });

    reqAny.pipe(bb);

    // safety timeout
    setTimeout(() => {
      if (!finished) reject(new HttpError(408, "Upload timeout"));
    }, 25_000);
  });
}
