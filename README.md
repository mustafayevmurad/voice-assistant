# Voice Assistant API for Vercel (Node.js + TypeScript)

Готовый проект с 3 endpoint'ами:

- `POST /api/voice/quick`
- `POST /api/voice/complete`
- `POST /api/voice/long`

Все endpoint'ы принимают `multipart/form-data` с полем `file` (`m4a/wav/caf`) и работают только в Node runtime.

## Deploy на Vercel (кнопками)

1. Загрузите проект в GitHub.
2. Нажмите кнопку:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

3. В настройках проекта задайте ENV-переменные (ниже).
4. Deploy.

## ENV переменные

Обязательные:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `TODOIST_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Локальный запуск

```bash
npm install
npm run check
```

Для локального теста Vercel функций можно использовать `vercel dev`.

## API

### 1) `POST /api/voice/quick`

Пайплайн:
1. Whisper транскрибирует аудио.
2. Claude возвращает JSON:
   ```json
   {
     "type": "task|reminder|note",
     "text": "кратко, на языке оригинала",
     "datetime": "ISO или null",
     "language": "ru|az|en|mixed"
   }
   ```
3. Действие:
   - `task` -> создаётся Todoist task (`content=text`)
   - `reminder` -> Todoist task с `due_datetime=datetime`
   - `note` -> сообщение в Telegram

### 2) `POST /api/voice/complete`

Пайплайн:
1. Whisper -> transcript
2. Claude #1 -> `{ "type":"complete", "text":"что сделано" }`
3. Получение открытых задач Todoist (до 100)
4. Claude #2 -> `{ "id":"..."|null, "confidence":0..1 }`
5. Если `confidence >= 0.55` -> закрытие задачи Todoist

Ответ:
- успех: `{ "ok": true, "closed_task_id": "...", "confidence": 0.77 }`
- no match: `{ "ok": false, "error": "No match" }`

### 3) `POST /api/voice/long`

Пайплайн:
1. Whisper -> transcript
2. Claude ->
   ```json
   {
     "summary":"3-5 предложений на русском",
     "tasks":["..."],
     "key_points":["..."],
     "language":"ru|az|en|mixed"
   }
   ```
3. Telegram:
   - одно сообщение: Summary + Key points + Tasks
   - transcript отправляется как `transcript.txt` через `sendDocument`
4. Создание задач Todoist из `tasks[]`

Ответ: `{ "ok": true, "tasks_created": N }`

## Ограничения и обработка ошибок

- Если `file` отсутствует -> `400`
- Если размер файла > 25MB -> `413 Audio too large`
- Если внешний API вернул ошибку -> `500`
- JSON от Claude валидируется через `zod`; при невалидном JSON выполняется 1 retry.

## Shortcuts (2 штуки)

Рекомендуемые Apple Shortcuts:

1. **Voice Quick Capture**
   - Запись или выбор аудио
   - `Get Contents of URL`:
     - URL: `https://<your-domain>/api/voice/quick`
     - Method: `POST`
     - Request Body: `Form`
     - Поле: `file` (audio)

2. **Voice Complete Task**
   - Запись аудио "что выполнено"
   - POST на `https://<your-domain>/api/voice/complete`
   - Поле формы `file`

## Automation для long

Пример автоматизации (iOS Automation):
- Триггер: по времени (например, каждый вечер)
- Действия:
  1. Выбрать аудиофайл из папки/диктофона
  2. `Get Contents of URL` -> `POST https://<your-domain>/api/voice/long`
  3. Передать `file` как multipart form-data

## Пример cURL

```bash
curl -X POST "https://<your-domain>/api/voice/quick" \
  -F "file=@sample.m4a"
```
