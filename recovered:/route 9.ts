import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/core/db';
import { rawChatLog } from '@/config/db/schema-community-v2';
import { desc } from 'drizzle-orm';
import { parseFilenameMeta } from '@/lib/community-raw-parser';

const MESSAGE_REGEX = /^.+?(?:\([^)]*\)\s+)?(?:\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}/gm;

function parseMeta(fileName: string) {
  const meta = parseFilenameMeta(fileName);
  if (!meta || !meta.productLine || meta.productLine === 'Unknown') return null;
  const chatDate = new Date(meta.dateStr);
  if (Number.isNaN(chatDate.getTime())) return null;
  return {
    productLine: meta.productLine,
    period: meta.period ?? '',
    groupNumber: Number(meta.groupNumber || 1),
    chatDate,
  };
}

function countMessages(content: string) {
  const matches = content.match(MESSAGE_REGEX);
  return matches ? matches.length : 0;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }

    const results: any[] = [];

    for (const file of files) {
      const meta = parseMeta(file.name);
      if (!meta) {
        results.push({ file: file.name, status: 'error', reason: '文件名未匹配产品线/期/群/日期' });
        continue;
      }

      const content = await file.text();
      const fileHash = crypto.createHash('md5').update(content).digest('hex');
      const msgCount = countMessages(content);

      // upsert
      await db()
        .insert(rawChatLog)
        .values({
          id: nanoid(),
          productLine: meta.productLine,
          period: meta.period,
          groupNumber: meta.groupNumber,
          chatDate: meta.chatDate,
          fileName: file.name,
          fileHash,
          rawContent: content,
          messageCount: msgCount,
          status: 'pending',
          processedAt: null,
          statusReason: null,
        })
        .onConflictDoUpdate({
          target: [rawChatLog.productLine, rawChatLog.period, rawChatLog.groupNumber, rawChatLog.chatDate],
          set: {
            fileName: file.name,
            fileHash,
            rawContent: content,
            messageCount: msgCount,
            status: 'pending',
            processedAt: null,
            statusReason: null,
            updatedAt: new Date(),
          },
        });

      results.push({
        file: file.name,
        status: 'ok',
        productLine: meta.productLine,
        period: meta.period,
        group: meta.groupNumber,
        date: meta.chatDate,
        messages: msgCount,
      });
    }

    return NextResponse.json({ uploaded: results });
  } catch (e: any) {
    console.error('upload-chat error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const logs = await db()
      .select({
        id: rawChatLog.id,
        fileName: rawChatLog.fileName,
        productLine: rawChatLog.productLine,
        period: rawChatLog.period,
        groupNumber: rawChatLog.groupNumber,
        chatDate: rawChatLog.chatDate,
        messageCount: rawChatLog.messageCount,
        status: rawChatLog.status,
        processedAt: rawChatLog.processedAt,
        updatedAt: rawChatLog.updatedAt,
      })
      .from(rawChatLog)
      .orderBy(desc(rawChatLog.chatDate))
      .limit(50);

    return NextResponse.json({ items: logs });
  } catch (e: any) {
    console.error('upload-chat list error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
