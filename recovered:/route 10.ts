import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/core/db';
import { member } from '@/config/db/schema-community-v2';
import { eq, sql, desc } from 'drizzle-orm';

const DEFAULT_PRODUCT_LINE = 'AI产品出海';

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

type CsvRow = {
  planetId: string;
  nickname: string;
  wechatId: string;
  joinDate: string;
  expireDate: string;
  period: string;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current);
  return result;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows: CsvRow[] = [];
  // 假定第一行为表头
  const headers = parseCsvLine(lines[0]).map((col) => col.trim().replace(/^\ufeff/, ''));
  const idxPlanetId = headers.indexOf('星球编号');
  const idxNickname = headers.indexOf('微信昵称');
  const idxWechatId = headers.findIndex((h) => h === 'wechat_id' || h === '微信号');
  const idxJoinDate = headers.indexOf('加入时间');
  const idxExpireDate = headers.indexOf('到期时间');
  const idxPeriod = headers.indexOf('期数');
  const fallbackIdx = [0, 1, 2, 3, 4];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (!cols.length) continue;
    const planetId = (cols[idxPlanetId >= 0 ? idxPlanetId : fallbackIdx[0]] || '').trim().replace(/^\ufeff/, '');
    const nickname = (cols[idxNickname >= 0 ? idxNickname : fallbackIdx[1]] || '').trim();
    const wechatId = (cols[idxWechatId >= 0 ? idxWechatId : -1] || '').trim();
    const joinDate = (cols[idxJoinDate >= 0 ? idxJoinDate : fallbackIdx[2]] || '').trim();
    const expireDate = (cols[idxExpireDate >= 0 ? idxExpireDate : fallbackIdx[3]] || '').trim();
    const period = (cols[idxPeriod >= 0 ? idxPeriod : fallbackIdx[4]] || '').trim();
    const finalName = nickname || planetId;
    if (!finalName) continue;
    rows.push({ planetId, nickname: finalName, wechatId, joinDate, expireDate, period });
  }
  return rows;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const mode = form.get('mode');
    const productLine = (form.get('productLine') as string) || DEFAULT_PRODUCT_LINE;

    // 单条录入模式
    if (mode === 'single') {
      const planetId = (form.get('planetId') as string) || '';
      const nickname = (form.get('nickname') as string) || planetId || '未命名';
      const wechatId = (form.get('wechatId') as string) || '';
      const period = (form.get('period') as string) || null;
      const joinDate = (form.get('joinDate') as string) || '';
      const expireDate = (form.get('expireDate') as string) || '';

      let nicknameNormalized = normalizeName(nickname || planetId);
      if (!nicknameNormalized && planetId) {
        nicknameNormalized = normalizeName(planetId) || planetId;
      }
      if (!nicknameNormalized) return NextResponse.json({ error: '昵称为空' }, { status: 400 });

      const values = {
        planetId: planetId || null,
        nickname: nickname,
        nicknameNormalized,
        wechatId: wechatId || null,
        role: 'student',
        productLine,
        period,
        status: 'active',
        joinDate: joinDate ? new Date(joinDate) : null,
        expireDate: expireDate ? new Date(expireDate) : null,
        updatedAt: new Date(),
      };
      const existing = planetId
        ? await db().select({ id: member.id }).from(member).where(eq(member.planetId, planetId)).limit(1)
        : await db()
          .select({ id: member.id })
          .from(member)
          .where(eq(member.nicknameNormalized, nicknameNormalized))
          .limit(1);

      if (existing[0]?.id) {
        const updateValues: any = { ...values };
        if (!wechatId) delete updateValues.wechatId;
        await db()
          .update(member)
          .set(updateValues)
          .where(eq(member.id, existing[0].id));
      } else {
        await db()
          .insert(member)
          .values({
            id: nanoid(),
            ...values,
            createdAt: new Date(),
          });
      }

      return NextResponse.json({ processed: 1, message: '单条录入成功' });
    }

    // CSV 批量模式
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少 CSV 文件' }, { status: 400 });
    }
    const content = await file.text();
    const csvRows = parseCsv(content);
    if (csvRows.length === 0) {
      return NextResponse.json({ error: 'CSV 内容为空' }, { status: 400 });
    }

    const existingRows = await db()
      .select({
        id: member.id,
        planetId: member.planetId,
        nicknameNormalized: member.nicknameNormalized,
      })
      .from(member)
      .where(eq(member.role, 'student'));

    const byPlanetId = new Map<string, string>();
    const byNickname = new Map<string, string>();
    for (const row of existingRows) {
      if (row.planetId) byPlanetId.set(row.planetId, row.id);
      if (row.nicknameNormalized) byNickname.set(row.nicknameNormalized, row.id);
    }

    for (const row of csvRows) {
      let nicknameNormalized = normalizeName(row.nickname || row.planetId || '');
      if (!nicknameNormalized && row.planetId) {
        nicknameNormalized = normalizeName(row.planetId) || row.planetId;
      }
      if (!nicknameNormalized) continue;
      const wechatId = (row.wechatId || '').trim();
      const values = {
        planetId: row.planetId || null,
        nickname: row.nickname || row.planetId || '未命名',
        nicknameNormalized,
        wechatId: wechatId || null,
        role: 'student',
        productLine,
        period: row.period || null,
        status: 'active',
        joinDate: row.joinDate ? new Date(row.joinDate) : null,
        expireDate: row.expireDate ? new Date(row.expireDate) : null,
        updatedAt: new Date(),
      };

      const existingId = (row.planetId && byPlanetId.get(row.planetId)) || byNickname.get(nicknameNormalized);
      if (existingId) {
        const updateValues: any = { ...values };
        if (!wechatId) delete updateValues.wechatId;
        await db()
          .update(member)
          .set(updateValues)
          .where(eq(member.id, existingId));
      } else {
        const id = nanoid();
        await db()
          .insert(member)
          .values({
            id,
            ...values,
            createdAt: new Date(),
          });
        if (row.planetId) byPlanetId.set(row.planetId, id);
        byNickname.set(nicknameNormalized, id);
      }
    }

    return NextResponse.json({ processed: csvRows.length, message: '上传成功，已写入 member 表' });
  } catch (e: any) {
    console.error('upload-members error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const total = await db()
      .select({ c: sql`count(*)` })
      .from(member)
      .where(eq(member.role, 'student'));

    const latest = await db()
      .select({
        updatedAt: member.updatedAt,
        nickname: member.nickname,
      })
      .from(member)
      .where(eq(member.role, 'student'))
      .orderBy(desc(member.updatedAt))
      .limit(1);

    return NextResponse.json({
      total: Number(total[0].c),
      latestUpdatedAt: latest[0]?.updatedAt || null,
      latestNickname: latest[0]?.nickname || null,
    });
  } catch (e: any) {
    console.error('upload-members list error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
