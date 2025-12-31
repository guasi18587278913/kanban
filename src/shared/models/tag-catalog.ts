import { and, count, desc, eq, ilike } from 'drizzle-orm';

import { db } from '@/core/db';
import { tagCatalog, memberTag } from '@/config/db/schema-community-v2';

export type TagCatalog = typeof tagCatalog.$inferSelect;
export type NewTagCatalog = typeof tagCatalog.$inferInsert;
export type UpdateTagCatalog = Partial<Omit<NewTagCatalog, 'id' | 'createdAt'>>;

export enum TagCatalogStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

function normalizeAliases(aliases?: string[] | null) {
  return (aliases || [])
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function addTagCatalog(data: NewTagCatalog) {
  const payload = {
    ...data,
    aliases: normalizeAliases(data.aliases),
  };
  const [result] = await db().insert(tagCatalog).values(payload).returning();
  return result;
}

export async function updateTagCatalog(id: string, data: UpdateTagCatalog) {
  const [existing] = await db()
    .select()
    .from(tagCatalog)
    .where(eq(tagCatalog.id, id))
    .limit(1);

  if (!existing) return null;

  const now = new Date();
  const nextAliases = normalizeAliases(data.aliases ?? existing.aliases);
  const rename = data.name && data.name !== existing.name;
  const mergedAliases = rename && data.name
    ? Array.from(new Set([existing.name, ...nextAliases]))
    : nextAliases;

  const [result] = await db()
    .update(tagCatalog)
    .set({
      ...data,
      aliases: mergedAliases,
      updatedAt: now,
    })
    .where(eq(tagCatalog.id, id))
    .returning();

  if (rename && data.name) {
    await db()
      .update(memberTag)
      .set({ tagName: data.name, updatedAt: now })
      .where(
        and(
          eq(memberTag.tagCategory, existing.category),
          eq(memberTag.tagName, existing.name)
        )
      );
  }

  return result;
}

export async function deleteTagCatalog(id: string) {
  const result = await updateTagCatalog(id, {
    status: TagCatalogStatus.INACTIVE,
  });
  return result;
}

export async function findTagCatalog({
  id,
}: {
  id?: string;
}) {
  if (!id) return null;
  const [result] = await db()
    .select()
    .from(tagCatalog)
    .where(eq(tagCatalog.id, id))
    .limit(1);
  return result;
}

export async function getTagCatalogs({
  category,
  status,
  keyword,
  page = 1,
  limit = 50,
}: {
  category?: string;
  status?: TagCatalogStatus;
  keyword?: string;
  page?: number;
  limit?: number;
} = {}): Promise<TagCatalog[]> {
  const result = await db()
    .select()
    .from(tagCatalog)
    .where(
      and(
        category ? eq(tagCatalog.category, category) : undefined,
        status ? eq(tagCatalog.status, status) : undefined,
        keyword ? ilike(tagCatalog.name, `%${keyword}%`) : undefined
      )
    )
    .orderBy(desc(tagCatalog.updatedAt), desc(tagCatalog.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return result;
}

export async function getTagCatalogCount({
  category,
  status,
  keyword,
}: {
  category?: string;
  status?: TagCatalogStatus;
  keyword?: string;
} = {}): Promise<number> {
  const [result] = await db()
    .select({ count: count() })
    .from(tagCatalog)
    .where(
      and(
        category ? eq(tagCatalog.category, category) : undefined,
        status ? eq(tagCatalog.status, status) : undefined,
        keyword ? ilike(tagCatalog.name, `%${keyword}%`) : undefined
      )
    )
    .limit(1);

  return Number(result?.count || 0);
}
