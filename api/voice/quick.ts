import { ensureMethod, HttpError, jsonResponse } from "../../src/http";
import { withErrorHandling, VercelRequest } from "../../src/handler";
import { parseAudioUpload } from "../../src/multipart";
import { callClaudeJson, createTodoistTask, telegramSendMessage, transcribeWithWhisper } from "../../src/integrations";
import { quickSchema } from "../../src/types";


export default async function handler(req: VercelRequest, res: any): Promise<void> {
  await withErrorHandling(res, async () => {
    ensureMethod(req, "POST");
    const ct = getContentType(req);
const file = ct.includes("application/json")
  ? await parseAudioFromJson(req)
  : await parseAudioUpload(req);
    const transcript = await transcribeWithWhisper(file.filepath, file.mimetype || "audio/m4a", file.originalFilename || undefined);

    const quick = await callClaudeJson({
      instruction:
        "Classify as task/reminder/note. Keep text concise in original language. datetime must be ISO 8601 or null.",
      userPrompt: `Transcript:\n${transcript}`,
      schema: quickSchema
    });

    if (quick.type === "task") {
      await createTodoistTask({ content: quick.text });
    } else if (quick.type === "reminder") {
      if (!quick.datetime) {
        throw new HttpError(500, "Reminder requires datetime");
      }
      await createTodoistTask({ content: quick.text, due_datetime: quick.datetime });
    } else {
      await telegramSendMessage(`📝 Note (${quick.language}):\n${quick.text}`);
    }

    jsonResponse(res, 200, { ok: true, result: quick });
  });
}
