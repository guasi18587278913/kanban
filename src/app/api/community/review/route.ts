import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { goodNews, qaRecord, kocRecord, starStudent } from '@/config/db/schema-community-v2';

type ReviewType = 'good_news' | 'qa' | 'koc' | 'star';
type Decision = 'approve' | 'reject';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, id, decision } = body || {};

    if (!type || !id || !decision) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    if (!['good_news', 'qa', 'koc', 'star'].includes(type)) {
      return NextResponse.json({ error: 'invalid type' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(decision)) {
      return NextResponse.json({ error: 'invalid decision' }, { status: 400 });
    }

    // Simple Auth (Mock/Env based)
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      console.error('Server Configuration Error: ADMIN_SECRET is missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const authHeader = req.headers.get('x-admin-secret');
    if (authHeader !== adminSecret) {
       return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const isVerified = decision === 'approve';
    const status = decision === 'reject' ? 'rejected' : 'active';
    const now = new Date();

    const database = db();
    if (type === 'good_news') {
      await database.update(goodNews).set({ isVerified, status, updatedAt: now }).where(eq(goodNews.id, id));
    } else if (type === 'qa') {
      await database.update(qaRecord).set({ isVerified, status, updatedAt: now }).where(eq(qaRecord.id, id));
    } else if (type === 'koc') {
      await database.update(kocRecord).set({ isVerified, status, updatedAt: now }).where(eq(kocRecord.id, id));
    } else if (type === 'star') {
      await database.update(starStudent).set({ isVerified, status, updatedAt: now }).where(eq(starStudent.id, id));
    }

    return NextResponse.json({ ok: true, type, id, decision, isVerified, status, updatedAt: now });
  } catch (e: any) {
    console.error('review api error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
