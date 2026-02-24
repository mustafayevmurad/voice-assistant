import { readFile } from "fs/promises";
import { basename } from "path";
import { ZodSchema } from "zod";
import { getRequiredEnv, HttpError } from "./http";

const ANTHROPIC_MODEL = "claude-3-5-sonnet-latest";

const nowBaku = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "Asia/Baku"
  }).format(new Date());

export const transcribeWithWhisper = async (filePath: string, mimeType: string, fileName?: string): Promise<string> => {
  const apiKey = getRequiredEnv("OPENAI_API_KEY");
  const data = await readFile(filePath);
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", new Blob([data], { type: mimeType }), fileName ?? basename(filePath));

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const details = await response.text();
    throw new HttpError(500, `Whisper API failed: ${details}`);
  }

  const payload = (await response.json()) as { text?: string };
  if (!payload.text) {
    throw new HttpError(500, "Whisper API returned empty text");
  }
  return payload.text;
};

const extractText = (content: any[]): string =>
  content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();

export const callClaudeJson = async <T>(input: {
  instruction: string;
  userPrompt: string;
  schema: ZodSchema<T>;
}): Promise<T> => {
  const apiKey = getRequiredEnv("ANTHROPIC_API_KEY");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: `Return ONLY valid JSON without markdown. Current datetime in Asia/Baku: ${nowBaku()}. ${input.instruction}`,
        messages: [
          {
            role: "user",
            content: input.userPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const details = await response.text();
      throw new HttpError(500, `Anthropic API failed: ${details}`);
    }

    const payload = (await response.json()) as { content?: any[] };
    const rawText = extractText(payload.content ?? []);

    try {
      const parsed = JSON.parse(rawText);
      return input.schema.parse(parsed);
    } catch {
      if (attempt === 1) {
        throw new HttpError(500, "Claude returned invalid JSON after retry");
      }
    }
  }

  throw new HttpError(500, "Claude parsing failed");
};

export const createTodoistTask = async (payload: { content: string; due_datetime?: string }): Promise<{ id: string }> => {
  const token = getRequiredEnv("TODOIST_TOKEN");
  const response = await fetch("https://api.todoist.com/rest/v2/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new HttpError(500, `Todoist create task failed: ${details}`);
  }

  return (await response.json()) as { id: string };
};

export const getTodoistOpenTasks = async (): Promise<Array<{ id: string; content: string }>> => {
  const token = getRequiredEnv("TODOIST_TOKEN");
  const response = await fetch("https://api.todoist.com/rest/v2/tasks?limit=100", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const details = await response.text();
    throw new HttpError(500, `Todoist fetch tasks failed: ${details}`);
  }

  const tasks = (await response.json()) as Array<{ id: string; content: string }>;
  return tasks.slice(0, 100);
};

export const closeTodoistTask = async (id: string): Promise<void> => {
  const token = getRequiredEnv("TODOIST_TOKEN");
  const response = await fetch(`https://api.todoist.com/rest/v2/tasks/${id}/close`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const details = await response.text();
    throw new HttpError(500, `Todoist close task failed: ${details}`);
  }
};

export const telegramSendMessage = async (text: string): Promise<void> => {
  const token = getRequiredEnv("TELEGRAM_BOT_TOKEN");
  const chatId = getRequiredEnv("TELEGRAM_CHAT_ID");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new HttpError(500, `Telegram sendMessage failed: ${details}`);
  }
};

export const telegramSendDocument = async (content: string, filename: string): Promise<void> => {
  const token = getRequiredEnv("TELEGRAM_BOT_TOKEN");
  const chatId = getRequiredEnv("TELEGRAM_CHAT_ID");
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", new Blob([content], { type: "text/plain" }), filename);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    const details = await response.text();
    throw new HttpError(500, `Telegram sendDocument failed: ${details}`);
  }
};
