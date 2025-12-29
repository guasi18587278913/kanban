import { NextResponse } from 'next/server';
import { db } from '@/core/db';
import { rawChatLog, member, memberMessage, qaRecord } from '@/config/db/schema-community-v2';
import { and, or, eq, desc, isNull, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·｜|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
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
        statusReason: rawChatLog.statusReason,
        updatedAt: rawChatLog.updatedAt,
      })
      .from(rawChatLog)
      .where(or(eq(rawChatLog.status, 'pending'), eq(rawChatLog.status, 'failed')))
      .orderBy(desc(rawChatLog.updatedAt))
      .limit(100);

    const unmatchedMembers = await db()
      .select({
        id: memberMessage.id,
        authorName: memberMessage.authorName,
        messageContent: memberMessage.messageContent,
        messageTime: memberMessage.messageTime,
        productLine: memberMessage.productLine,
        period: memberMessage.period,
        groupNumber: memberMessage.groupNumber,
      })
      .from(memberMessage)
      .where(and(isNull(memberMessage.memberId), eq(memberMessage.status, 'active')))
      .orderBy(desc(memberMessage.messageTime))
      .limit(50);

    const unansweredQA = await db()
      .select({
        id: qaRecord.id,
        questionContent: qaRecord.questionContent,
        questionTime: qaRecord.questionTime,
        askerName: qaRecord.askerName,
        productLine: qaRecord.productLine,
        period: qaRecord.period,
        groupNumber: qaRecord.groupNumber,
        answererId: qaRecord.answererId,
        answererName: qaRecord.answererName,
        isResolved: qaRecord.isResolved,
      })
      .from(qaRecord)
      .where(
        and(
          eq(qaRecord.status, 'active'),
          or(isNull(qaRecord.answererId), eq(qaRecord.isResolved, false))
        )
      )
      .orderBy(desc(qaRecord.questionTime))
      .limit(50);

    return NextResponse.json({ rawLogs: logs, unmatchedMembers, unansweredQA });
  } catch (e: any) {
    console.error('import-issues list error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body?.action || (body?.logId ? 'retryLog' : null);

    if (action === 'retryLog') {
      const logId = body?.logId as string | undefined;
      if (!logId) {
        return NextResponse.json({ error: '缺少 logId' }, { status: 400 });
      }
      await db()
        .update(rawChatLog)
        .set({
          status: 'pending',
          statusReason: null,
          processedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(rawChatLog.id, logId));
      return NextResponse.json({ ok: true });
    }

    if (action === 'createMemberAndLink') {
      const nickname = String(body?.nickname || '').trim();
      if (!nickname) {
        return NextResponse.json({ error: '缺少昵称' }, { status: 400 });
      }
      const role = body?.role === 'coach' || body?.role === 'volunteer' ? body.role : 'student';
      const productLine = String(body?.productLine || 'AI产品出海').trim();
      const period = body?.period ? String(body.period).trim() : null;
      const nicknameNormalized = normalizeName(nickname);
      if (!nicknameNormalized) {
        return NextResponse.json({ error: '昵称无法标准化，请手动处理' }, { status: 400 });
      }

      const [existing] = await db()
        .select({ id: member.id })
        .from(member)
        .where(eq(member.nicknameNormalized, nicknameNormalized))
        .limit(1);

      const memberId = existing?.id || nanoid();

      if (existing?.id) {
        await db()
          .update(member)
          .set({
            nickname,
            nicknameNormalized,
            role,
            productLine,
            period,
            updatedAt: new Date(),
          })
          .where(eq(member.id, memberId));
      } else {
        await db()
          .insert(member)
          .values({
            id: memberId,
            nickname,
            nicknameNormalized,
            role,
            productLine,
            period,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
      }

      const updateResult = await db()
        .update(memberMessage)
        .set({ memberId })
        .where(
          and(
            isNull(memberMessage.memberId),
            eq(memberMessage.status, 'active'),
            eq(memberMessage.authorNormalized, nicknameNormalized)
          )
        )
        .returning({ id: memberMessage.id });

      return NextResponse.json({ ok: true, memberId, linked: updateResult.length });
    }

    if (action === 'ignoreUnmatched') {
      const nickname = String(body?.nickname || '').trim();
      if (!nickname) {
        return NextResponse.json({ error: '缺少昵称' }, { status: 400 });
      }
      const nicknameNormalized = normalizeName(nickname);
      if (!nicknameNormalized) {
        return NextResponse.json({ error: '昵称无法标准化，请手动处理' }, { status: 400 });
      }
      const res = await db()
        .update(memberMessage)
        .set({ status: 'ignored' })
        .where(
          and(
            isNull(memberMessage.memberId),
            eq(memberMessage.status, 'active'),
            eq(memberMessage.authorNormalized, nicknameNormalized)
          )
        )
        .returning({ id: memberMessage.id });
      return NextResponse.json({ ok: true, ignored: res.length });
    }

    if (action === 'markQaResolved') {
      const qaId = String(body?.qaId || '').trim();
      if (!qaId) {
        return NextResponse.json({ error: '缺少 qaId' }, { status: 400 });
      }
      await db()
        .update(qaRecord)
        .set({ isResolved: true })
        .where(eq(qaRecord.id, qaId));
      return NextResponse.json({ ok: true });
    }

    if (action === 'assignQaAnswerer') {
      const qaId = String(body?.qaId || '').trim();
      const answererName = String(body?.answererName || '').trim();
      const markResolved = Boolean(body?.markResolved);
      if (!qaId || !answererName) {
        return NextResponse.json({ error: '缺少 qaId 或 answererName' }, { status: 400 });
      }
      const normalized = normalizeName(answererName);
      const [answerer] = await db()
        .select({
          id: member.id,
          role: member.role,
        })
        .from(member)
        .where(eq(member.nicknameNormalized, normalized))
        .limit(1);

      await db()
        .update(qaRecord)
        .set({
          answererId: answerer?.id || null,
          answererName,
          answererRole: answerer?.role || null,
          isResolved: markResolved ? true : sql`${qaRecord.isResolved}`,
        })
        .where(eq(qaRecord.id, qaId));

      return NextResponse.json({ ok: true, matchedMember: Boolean(answerer?.id) });
    }

    if (action === 'ignoreQa') {
      const qaId = String(body?.qaId || '').trim();
      if (!qaId) {
        return NextResponse.json({ error: '缺少 qaId' }, { status: 400 });
      }
      await db()
        .update(qaRecord)
        .set({ status: 'ignored' })
        .where(eq(qaRecord.id, qaId));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (e: any) {
    console.error('import-issues retry error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
