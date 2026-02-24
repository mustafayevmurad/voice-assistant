export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const jsonResponse = (res: any, status: number, payload: unknown): void => {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

export const ensureMethod = (req: any, method: string): void => {
  if (req.method !== method) {
    throw new HttpError(405, "Method not allowed");
  }
};

export const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new HttpError(500, `Missing environment variable: ${name}`);
  }
  return value;
};
