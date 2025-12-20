import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { member, memberAlias } from '@/config/db/schema-community-v2';
import {
  memberMessage,
  qaRecord,
  goodNews,
  kocRecord,
  starStudent as starStudentV2,
  memberStats,
} from '@/config/db/schema-community-v2';

/**
 * 简易合并成员（Admin）
 * Body: { targetId: string, sourceId: string }
 * 将 source 相关记录指向 target，并将 source 昵称写入 alias，软删除 source
 * 注意：未做鉴权，请在受控环境使用
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { targetId, sourceId } = body || {};
    if (!targetId || !sourceId || targetId === sourceId) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }
    const database = db();

    const sources = await database.select().from(member).where(eq(member.id, sourceId));
    if (sources.length === 0) {
      return NextResponse.json({ error: 'source not found' }, { status: 404 });
    }

    const existingAlias = await database
      .select()
      .from(memberAlias)
      .where(eq(memberAlias.alias, sources[0].nicknameNormalized || sourceId));
    if (existingAlias.length === 0) {
      await database.insert(memberAlias).values({
        id: `${sourceId}-alias`,
        memberId: targetId,
        alias: sources[0].nicknameNormalized || sourceId,
        createdAt: new Date(),
      });
    }

    // update references
    await database
      .update(memberMessage)
      .set({ memberId: targetId })
      .where(eq(memberMessage.memberId, sourceId));
    await database
      .update(qaRecord)
      .set({ askerId: targetId })
      .where(eq(qaRecord.askerId, sourceId));
    await database
      .update(qaRecord)
      .set({ answererId: targetId })
      .where(eq(qaRecord.answererId, sourceId));
    await database
      .update(goodNews)
      .set({ memberId: targetId })
      .where(eq(goodNews.memberId, sourceId));
    await database
      .update(kocRecord)
      .set({ memberId: targetId })
      .where(eq(kocRecord.memberId, sourceId));
    await database
      .update(starStudentV2)
      .set({ memberId: targetId })
      .where(eq(starStudentV2.memberId, sourceId));
    await database
      .update(memberStats)
      .set({ memberId: targetId })
      .where(eq(memberStats.memberId, sourceId));

    // soft delete source
    await database.update(member).set({ status: 'expired' }).where(eq(member.id, sourceId));

    return NextResponse.json({ code: 0, message: 'merged' });
  } catch (e: any) {
    console.error('merge-member error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
