import Busboy from "busboy";
import type { VercelRequest } from "./handler";
import { HttpError } from "./http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

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

type UploadedAudio = {
  filepath: string;
  mimetype: string;
  originalFilename?: string;
  size: number;
};

export async function parseAudioUpload(req: VercelRequest): Promise<UploadedAudio> {
  const contentType = req.headers["content-type"] || req.headers["Content-Type"];
  if (!contentType || !String(contentType).includes("multipart/form-data")) {
    throw new HttpError(400, "Invalid multipart payload");
  }

  return await new Promise<UploadedAudio>((resolve, reject) => {
    let found = false;
    let finished = false;

    const bb = Busboy({
      headers: req.headers as any,
      limits: { files: 1, fileSize: MAX_FILE_SIZE },
    });

    bb.on("file", (fieldname, file, info) => {
      if (fieldname !== "file") {
        // игнорируем другие поля
        file.resume();
        return;
      }

      found = true;
      const mimetype = info.mimeType || "";
      const filename = info.filename || undefined;

      if (!mimetype || !ALLOWED_MIME.has(mimetype)) {
        file.resume();
        reject(new HttpError(400, "Unsupported file type"));
        return;
      }

      const tmpName = `audio-${crypto.randomUUID?.() ?? crypto.randomBytes(16).toString("hex")}`;
      const filepath = path.join(os.tmpdir(), tmpName);

      let size = 0;
      const out = fs.createWriteStream(filepath);

      file.on("data", (chunk: Buffer) => {
        size += chunk.length;
      });

      file.on("limit", () => {
        out.destroy();
        try { fs.unlinkSync(filepath); } catch {}
        reject(new HttpError(413, "Audio too large"));
      });

      out.on("error", (err) => {
        reject(err);
      });

      out.on("finish", () => {
        resolve({
          filepath,
          mimetype,
          originalFilename: filename,
          size,
        });
      });

      file.pipe(out);
    });

    bb.on("error", (err) => reject(err));

    bb.on("finish", () => {
      finished = true;
      if (!found) {
        reject(new HttpError(400, "Missing file"));
      }
    });

    // req в Vercel — это стрим
    req.pipe(bb);

    // safety timeout (на всякий)
    setTimeout(() => {
      if (!finished) reject(new HttpError(408, "Upload timeout"));
    }, 25_000);
  });
}
