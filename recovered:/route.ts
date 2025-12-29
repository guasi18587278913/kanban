import { NextResponse } from 'next/server';
import { getCoachStudentStats } from '@/lib/coach-student-stats';

const SUMMARY_CACHE_HEADERS = {
  'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get('period');
  const validPeriods = ['一期', '二期', '全部'] as const;
  const period = validPeriods.includes(periodParam as any) ? (periodParam as any) : '全部';

  try {
    const stats = getCoachStudentStats(period);
    return NextResponse.json(stats, { headers: SUMMARY_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
