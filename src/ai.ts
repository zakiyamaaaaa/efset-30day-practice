type AiMode = 'explain' | 'chat';
type LessonKind = 'listening' | 'reading';

type Question = {
  prompt: string;
  options: string[];
  answer: number;
  selected?: number;
  why: string;
};

type ChatTurn = {
  role: 'user' | 'model';
  text: string;
};

type AiRequest = {
  mode: AiMode;
  day: number;
  kind: LessonKind;
  lessonText: string;
  questions: Question[];
  question?: Question;
  optionIndex?: number;
  message?: string;
  history: ChatTurn[];
};

export const DEFAULT_GEMINI_MODEL = 'models/gemini-3.6-flash';

export class AiApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'AiApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new AiApiError(400, `invalid ${field}`);
  }
  return value.trim();
}

function numberValue(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new AiApiError(400, `invalid ${field}`);
  }
  return value as number;
}

function parseQuestion(value: unknown, field: string): Question {
  if (!isRecord(value)) throw new AiApiError(400, `invalid ${field}`);
  const options = value.options;
  if (!Array.isArray(options) || options.length !== 3 || options.some((option) => typeof option !== 'string' || option.length > 300)) {
    throw new AiApiError(400, `invalid ${field}.options`);
  }
  const question: Question = {
    prompt: stringValue(value.prompt, `${field}.prompt`, 600),
    options: options as string[],
    answer: numberValue(value.answer, `${field}.answer`, 0, 2),
    why: stringValue(value.why, `${field}.why`, 1_500),
  };
  if (value.selected !== undefined) question.selected = numberValue(value.selected, `${field}.selected`, 0, 2);
  return question;
}

function parseHistory(value: unknown): ChatTurn[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) throw new AiApiError(400, 'invalid history');
  return value.map((turn, index) => {
    if (!isRecord(turn) || (turn.role !== 'user' && turn.role !== 'model')) {
      throw new AiApiError(400, `invalid history[${index}]`);
    }
    return { role: turn.role, text: stringValue(turn.text, `history[${index}].text`, 2_000) } as ChatTurn;
  });
}

export function parseAiRequest(value: unknown): AiRequest {
  if (!isRecord(value)) throw new AiApiError(400, 'invalid JSON body');
  const mode = value.mode;
  if (mode !== 'explain' && mode !== 'chat') throw new AiApiError(400, 'invalid mode');

  const day = numberValue(value.day, 'day', 1, 30);
  const kind = value.kind;
  if (kind !== 'listening' && kind !== 'reading') throw new AiApiError(400, 'invalid kind');

  const questionsValue = value.questions;
  if (!Array.isArray(questionsValue) || questionsValue.length < 1 || questionsValue.length > 10) {
    throw new AiApiError(400, 'invalid questions');
  }
  const questions = questionsValue.map((question, index) => parseQuestion(question, `questions[${index}]`));
  const request: AiRequest = {
    mode,
    day,
    kind,
    lessonText: stringValue(value.lessonText, 'lessonText', 12_000),
    questions,
    history: parseHistory(value.history),
  };

  if (mode === 'explain') {
    request.question = parseQuestion(value.question, 'question');
    request.optionIndex = numberValue(value.optionIndex, 'optionIndex', 0, 2);
  } else {
    request.message = stringValue(value.message, 'message', 2_000);
  }
  return request;
}

const systemInstruction = [
  'あなたはEF SET対策の英語学習コーチです。',
  '回答は日本語で、学習者に寄り添いながら具体的に説明してください。',
  '与えられた英文・音声スクリプト・問題データを根拠にし、根拠にないことは推測せず「本文からは判断できない」と伝えてください。',
  '英語の語句は原文のまま示し、その直後に自然な日本語の意味を添えてください。',
  '問題の正解番号や根拠を勝手に変更しないでください。',
].join('\n');

function questionBlock(question: Question, index: number): string {
  const options = question.options.map((option, optionIndex) => `${'ABC'[optionIndex]}. ${option}`).join('\n');
  const selected = question.selected === undefined ? '未回答' : `${'ABC'[question.selected]}. ${question.options[question.selected]}`;
  return [
    `Q${index + 1}: ${question.prompt}`,
    `選択肢:\n${options}`,
    `正解: ${'ABC'[question.answer]}. ${question.options[question.answer]}`,
    `学習者の回答: ${selected}`,
    `既存の短い解説: ${question.why}`,
  ].join('\n');
}

function buildPrompt(request: AiRequest): string {
  const skill = request.kind === 'listening' ? 'Listening（音声スクリプト）' : 'Reading（本文）';
  const context = `Day ${request.day} / ${skill}\n${request.lessonText}`;
  if (request.mode === 'explain' && request.question && request.optionIndex !== undefined) {
    const option = request.question.options[request.optionIndex];
    const verdict = request.optionIndex === request.question.answer ? '正解の選択肢' : '不正解の選択肢';
    return [
      '次の問題について、指定された選択肢を詳しく解説してください。',
      `指定された選択肢: ${'ABC'[request.optionIndex]}. ${option}（${verdict}）`,
      '必ず次の順番で、見出しを付けて説明してください：',
      '1. 結論（この選択肢が正解／不正解である理由）',
      '2. 本文または音声スクリプトの根拠（英語の短い引用と日本語訳）',
      '3. 他の選択肢との違い・ひっかけポイント',
      '4. 覚えておきたい英語表現',
      '英語学習者が読みやすい分量（400〜700字程度）にしてください。',
      `
【教材】
${context}

【問題】
${questionBlock(request.question, 0)}`,
    ].join('\n');
  }

  return [
    '今日の問題について、学習者の質問に答えてください。',
    '問題を解く前の質問には、必要なら答えを直接言わずヒントから説明してください。学習者が正解と根拠を尋ねた場合は、根拠を明確に示してください。',
    '複数の問題に触れる場合は、Q番号ごとに整理してください。',
    `
【教材】
${context}

【今日の問題】
${request.questions.map(questionBlock).join('\n\n')}

【学習者の質問】
${request.message}`,
  ].join('\n');
}

function buildContents(request: AiRequest, prompt: string) {
  const history = request.history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));
  return history.concat({ role: 'user', parts: [{ text: prompt }] });
}

export async function generateAi(value: unknown, apiKey: string | undefined, model = DEFAULT_GEMINI_MODEL) {
  const request = parseAiRequest(value);
  const key = apiKey?.trim();
  if (!key) throw new AiApiError(503, 'Gemini APIが設定されていません。GEMINI_API_KEYを設定してください。');

  const modelName = model.replace(/^models\//, '').trim() || DEFAULT_GEMINI_MODEL.replace(/^models\//, '');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: buildContents(request, buildPrompt(request)),
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 1_200,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch {
    throw new AiApiError(502, 'Gemini APIに接続できませんでした。時間をおいて再試行してください。');
  }

  const body = await response.json().catch(() => ({})) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) {
    const detail = body.error?.message;
    throw new AiApiError(502, detail ? `Gemini APIエラー: ${detail}` : 'Gemini APIで生成に失敗しました。');
  }
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').filter(Boolean).join('\n').trim();
  if (!text) throw new AiApiError(502, 'Gemini APIから解説を受け取れませんでした。');
  return { text, model: modelName };
}
