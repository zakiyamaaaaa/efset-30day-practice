import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { AiApiError, generateAi } from '../ai';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'content-type': 'application/json; charset=utf-8',
};

function response(statusCode: number, body: unknown) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = event.requestContext.http.method;
  if (method === 'OPTIONS') return response(204, {});
  if (method !== 'POST') return response(405, { error: 'method not allowed' });

  if (!event.body || event.body.length > 100_000) return response(400, { error: 'invalid JSON body' });
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return response(400, { error: 'invalid JSON body' });
  }

  try {
    return response(200, await generateAi(body, process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL));
  } catch (error) {
    if (error instanceof AiApiError) return response(error.statusCode, { error: error.message });
    return response(500, { error: 'AI解説で予期しないエラーが発生しました。' });
  }
};
