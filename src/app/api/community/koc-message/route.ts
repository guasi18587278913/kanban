import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { memberMessage } from '@/config/db/schema-community-v2';

function parseContext(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceLogId = searchParams.get('sourceLogId');
  const messageIndexParam = searchParams.get('messageIndex');
  const messageIndex = messageIndexParam ? Number(messageIndexParam) : NaN;

  if (!sourceLogId || Number.isNaN(messageIndex)) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  const [row] = await db()
    .select({
      id: memberMessage.id,
      authorName: memberMessage.authorName,
      messageContent: memberMessage.messageContent,
      messageTime: memberMessage.messageTime,
      messageIndex: memberMessage.messageIndex,
      contextBefore: memberMessage.contextBefore,
      contextAfter: memberMessage.contextAfter,
    })
    .from(memberMessage)
    .where(
      and(
        eq(memberMessage.sourceLogId, sourceLogId),
        eq(memberMessage.messageIndex, messageIndex)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    message: {
      id: row.id,
      authorName: row.authorName,
      messageContent: row.messageContent,
      messageTime: row.messageTime,
      messageIndex: row.messageIndex,
      contextBefore: parseContext(row.contextBefore),
      contextAfter: parseContext(row.contextAfter),
    },
  });
}
