import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { goodNews } from '@/config/db/schema-community-v2';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const fallbackId = url.pathname.split('/').filter(Boolean).pop();
  const id = params?.id || fallbackId;
  if (!id) {
    console.error('[good-news PATCH] missing id, params=', params, 'url=', req.url);
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  let isVerified: boolean;
  if (typeof body.isVerified === 'boolean') {
    isVerified = body.isVerified;
  } else if (body.isVerified === 'true' || body.isVerified === 'false') {
    isVerified = body.isVerified === 'true';
  } else {
    return NextResponse.json({ error: 'isVerified must be boolean' }, { status: 400 });
  }

  try {
    const res = await db()
      .update(goodNews)
      .set({ isVerified })
      .where(eq(goodNews.id, id))
      .returning({ id: goodNews.id, isVerified: goodNews.isVerified });

    if (!res.length) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json(res[0]);
  } catch (e: any) {
    console.error('[good-news PATCH] error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
