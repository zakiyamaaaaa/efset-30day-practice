import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

type LearningRecord = {
  first?: number;
  help?: boolean;
  firstDate?: string;
  last?: number;
  attempts?: number;
  choices?: number[];
  note?: string;
  updatedAt?: string;
};

const tableName = process.env.TABLE_NAME;
if (!tableName) throw new Error('TABLE_NAME is required');

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'content-type': 'application/json; charset=utf-8',
};

function response(statusCode: number, body: unknown) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

function validUserId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function validRecordKey(value: unknown): value is string {
  return typeof value === 'string' && /^([1-9]|[12][0-9]|30)-(listening|reading)$/.test(value);
}

function validRecord(value: unknown): value is LearningRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as LearningRecord;
  if (record.note !== undefined && (typeof record.note !== 'string' || record.note.length > 2000)) return false;
  if (record.choices !== undefined && (!Array.isArray(record.choices) || record.choices.length > 10 || record.choices.some((n) => !Number.isInteger(n) || n < 0 || n > 2))) return false;
  for (const score of [record.first, record.last]) {
    if (score !== undefined && (!Number.isInteger(score) || score < 0 || score > 10)) return false;
  }
  if (record.attempts !== undefined && (!Number.isInteger(record.attempts) || record.attempts < 0 || record.attempts > 1000)) return false;
  if (record.help !== undefined && typeof record.help !== 'boolean') return false;
  if (record.firstDate !== undefined && typeof record.firstDate !== 'string') return false;
  return true;
}

function parseBody(event: Parameters<APIGatewayProxyHandlerV2>[0]) {
  if (!event.body) return undefined;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (raw.length > 100_000) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = event.requestContext.http.method;
  if (method === 'OPTIONS') return response(204, {});

  if (method === 'GET') {
    const userId = event.queryStringParameters?.userId;
    if (!validUserId(userId)) return response(400, { error: 'valid userId is required' });
    const result = await db.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#userId = :userId',
      ExpressionAttributeNames: { '#userId': 'userId' },
      ExpressionAttributeValues: { ':userId': userId },
    }));
    const records = Object.fromEntries((result.Items ?? []).map((item) => [item.recordKey as string, item.record as LearningRecord]));
    return response(200, { records });
  }

  if (method === 'POST') {
    const body = parseBody(event);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return response(400, { error: 'invalid JSON body' });
    const { userId, recordKey, record } = body as { userId?: unknown; recordKey?: unknown; record?: unknown };
    if (!validUserId(userId) || !validRecordKey(recordKey) || !validRecord(record)) {
      return response(400, { error: 'invalid record' });
    }
    const updatedAt = new Date().toISOString();
    await db.send(new PutCommand({
      TableName: tableName,
      Item: { userId, recordKey, record: { ...record, updatedAt }, updatedAt },
    }));
    return response(200, { ok: true, recordKey, updatedAt });
  }

  return response(405, { error: 'method not allowed' });
};
