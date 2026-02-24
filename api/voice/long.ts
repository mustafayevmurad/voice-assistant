import { ensureMethod, jsonResponse } from "../../src/http";
import { withErrorHandling, VercelRequest } from "../../src/handler";
import { parseAudioFromJson } from "../../src/audio_from_json";
import { parseAudioUpload } from "../../src/multipart";
import {
  callClaudeJson,
  createTodoistTask,
  telegramSendDocument,
  telegramSendMessage,
  transcribeWithWhisper
} from "../../src/integrations";
import { longSchema } from "../../src/types";
function getContentType(req: any): string {
  const h: any = req.headers;
  if (!h) return "";
  if (typeof h.get === "function") return String(h.get("content-type") || "");
  return String(h["content-type"] || h["Content-Type"] || "");
}


export default async function handler(req: VercelRequest, res: any): Promise<void> {
  await withErrorHandling(res, async () => {
    ensureMethod(req, "POST");
    const ct = getContentType(req);
const file = ct.includes("application/json")
  ? await parseAudioFromJson(req)
  : await parseAudioUpload(req);
    const transcript = await transcribeWithWhisper(file.filepath, file.mimetype || "audio/m4a", file.originalFilename || undefined);

    const structured = await callClaudeJson({
      instruction:
        "Summarize transcript in Russian (3-5 sentences). Extract actionable tasks and key points. language must be ru|az|en|mixed.",
      userPrompt: `Transcript:\n${transcript}`,
      schema: longSchema
    });

    const message = [
      "📌 Summary:",
      structured.summary,
      "",
      "🔑 Key points:",
      ...structured.key_points.map((p, idx) => `${idx + 1}. ${p}`),
      "",
      "✅ Tasks:",
      ...(structured.tasks.length ? structured.tasks.map((t, idx) => `${idx + 1}. ${t}`) : ["No tasks"]) 
    ].join("\n");

    await telegramSendMessage(message);
    await telegramSendDocument(transcript, "transcript.txt");

    let created = 0;
    for (const task of structured.tasks) {
      await createTodoistTask({ content: task });
      created += 1;
    }

    jsonResponse(res, 200, { ok: true, tasks_created: created });
  });
}
