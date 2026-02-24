import formidable, { type File, type Files } from "formidable";
import type { IncomingMessage } from "http";
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
  "audio/x-caf"
]);

const parseForm = (req: IncomingMessage): Promise<Files> => {
  const form = formidable({
    multiples: false,
    maxFiles: 1,
    maxFileSize: MAX_FILE_SIZE
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, _fields, files) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(files);
    });
  });
};

export const parseAudioUpload = async (req: IncomingMessage): Promise<File> => {
  try {
    const files = await parseForm(req);
    const field = files.file;
    const file = Array.isArray(field) ? field[0] : field;

    if (!file) {
      throw new HttpError(400, "Missing file");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new HttpError(413, "Audio too large");
    }

    if (!file.mimetype || !ALLOWED_MIME.has(file.mimetype)) {
      throw new HttpError(400, "Unsupported file type");
    }

    return file;
  } catch (error: any) {
    if (error?.httpCode === 413 || error?.code === 1009) {
      throw new HttpError(413, "Audio too large");
    }
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "Invalid multipart payload");
  }
};
