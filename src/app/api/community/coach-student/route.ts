import { NextResponse } from 'next/server';
import { and, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { member, memberStats, memberTag } from '@/config/db/schema-community-v2';

type PeriodKey = '全部' | '一期' | '二期';

function normalizePeriod(period?: string | null) {
  if (!period) return '';
  return period.replace(/期$/g, '').trim();
}

function toDisplayPeriod(period?: string | null) {
  if (!period) return '全部';
  if (period === '1' || period === '01') return '一期';
  if (period === '2' || period === '02') return '二期';
  return `第${period}期`;
}

function score(stat: any) {
  const msg = stat.totalMessages || 0;
  const q = stat.questionCount || 0;
  const a = stat.answerCount || 0;
  const gn = stat.goodNewsCount || 0;
  return msg * 1 + q * 3 + a * 5 + gn * 20;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get('period') as PeriodKey | null;
  const productLine = searchParams.get('productLine') || undefined;
  const q = searchParams.get('q') || '';
  const validPeriods: PeriodKey[] = ['全部', '一期', '二期'];
  const period: PeriodKey = validPeriods.includes(periodParam || '全部')
    ? (periodParam as PeriodKey)
    : '全部';

  try {
    const database = db();

    const memberConditions: any[] = [eq(member.status, 'active')];
    if (productLine) memberConditions.push(eq(member.productLine, productLine));

    const members = await database
      .select({
        id: member.id,
        role: member.role,
        nickname: member.nickname,
        normalized: member.nicknameNormalized,
        productLine: member.productLine,
        period: member.period,
      })
      .from(member)
      .where(and(...memberConditions));

    const memberMapByNorm = new Map<string, any>();
    const memberMapById = new Map<string, any>();
    members.forEach((m: any) => {
      if (m.normalized) memberMapByNorm.set(m.normalized, m);
      memberMapById.set(m.id, m);
    });

    let statsQuery = database.select().from(memberStats);
    if (productLine) {
      statsQuery = statsQuery.where(eq(memberStats.productLine, productLine));
    }
    const stats = await statsQuery;

    const filteredStats = stats.filter((s) => {
      if (period === '全部') return true;
      return normalizePeriod(s.period) === (period === '一期' ? '1' : '2');
    });

    const coachList: any[] = [];
    const studentList: any[] = [];

    filteredStats.forEach((s) => {
      const m = memberMapByNorm.get(s.memberId) || memberMapById.get(s.memberId);
      const role = m?.role || null;
      const name = m?.nickname || s.memberId;
      const displayPeriod = toDisplayPeriod(m?.period || s.period);
      const item = {
        id: m?.id || s.memberId,
        name,
        role: role || 'unknown',
        period: displayPeriod,
        productLine: m?.productLine || s.productLine,
        messageCount: s.totalMessages || 0,
        questionCount: s.questionCount || 0,
        answerCount: s.answerCount || 0,
        goodNewsCount: s.goodNewsCount || 0,
        score: score(s),
      };

      if (role === 'coach' || role === 'volunteer') {
        coachList.push(item);
      } else if (role === 'student') {
        studentList.push(item);
      } else {
        // 未知角色：根据数据归类
        if ((s.answerCount || 0) > 0) {
          coachList.push(item);
        } else {
          studentList.push(item);
        }
      }
    });

    const filterBySearch = (list: any[]) => {
      if (!q) return list;
      const key = q.toLowerCase();
      return list.filter((i) => i.name?.toLowerCase().includes(key));
    };

    const sortedCoach = filterBySearch(coachList).sort((a, b) => b.score - a.score);
    const sortedStudent = filterBySearch(studentList).sort((a, b) => b.score - a.score);

    // 取出所有成员 ID，用于标签查询
    const allIds = [...sortedCoach, ...sortedStudent].map((i) => i.id).filter(Boolean);
    let tagsMap = new Map<string, string[]>();
    if (allIds.length) {
      const tagRows = await database
        .select({
          memberId: memberTag.memberId,
          category: memberTag.tagCategory,
          name: memberTag.tagName,
        })
        .from(memberTag)
        .where(inArray(memberTag.memberId, allIds));
      const map = new Map<string, string[]>();
      tagRows.forEach((t) => {
        const list = map.get(t.memberId) || [];
        list.push(t.name);
        map.set(t.memberId, list);
      });
      tagsMap = map;
    }

    const attachTags = (list: any[]) =>
      list.map((item) => ({
        ...item,
        tags: (tagsMap.get(item.id) || []).slice(0, 4),
      }));

    const coachSummary = {
      total: sortedCoach.length,
      coachAnswerTotal: sortedCoach.reduce((acc, cur) => acc + (cur.answerCount || 0), 0),
      coachActive: sortedCoach.filter((c) => (c.messageCount || 0) > 0).length,
    };

    const studentSummary = {
      total: sortedStudent.length,
      studentActive: sortedStudent.filter((s) => (s.messageCount || 0) > 0).length,
    };

    return NextResponse.json({
      period,
      productLine: productLine || '全部',
      coach: {
        summary: coachSummary,
        list: attachTags(sortedCoach),
      },
      student: {
        summary: studentSummary,
        list: attachTags(sortedStudent),
      },
    });
  } catch (e: any) {
    console.error('coach-student api error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
