import { ensureMethod, jsonResponse } from "../../src/http";
import { withErrorHandling, VercelRequest } from "../../src/handler";
import { parseAudioFromJson } from "../../src/audio_from_json";
import { parseAudioUpload } from "../../src/multipart";
import {
  callClaudeJson,
  closeTodoistTask,
  getTodoistOpenTasks,
  transcribeWithWhisper
} from "../../src/integrations";
import { completeInitialSchema, completeMatchSchema } from "../../src/types";

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

    const completion = await callClaudeJson({
      instruction: "Extract completion statement as JSON object with type='complete' and text.",
      userPrompt: `Transcript:\n${transcript}`,
      schema: completeInitialSchema
    });

    const tasks = await getTodoistOpenTasks();

    const match = await callClaudeJson({
      instruction:
        "Find best matching task id by semantic similarity to completion text. Return id or null and confidence in [0,1].",
      userPrompt: `Completion text:\n${completion.text}\n\nOpen tasks:\n${JSON.stringify(tasks)}`,
      schema: completeMatchSchema
    });

    if (!match.id || match.confidence < 0.55) {
      jsonResponse(res, 200, { ok: false, error: "No match" });
      return;
    }

    await closeTodoistTask(match.id);
    jsonResponse(res, 200, { ok: true, closed_task_id: match.id, confidence: match.confidence });
  });
}
