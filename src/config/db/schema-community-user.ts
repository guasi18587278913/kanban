import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

// 独立的社区用户映射表，避免污染原有 schema 引入冲突
export const communityUser = pgTable(
  'community_user',
  {
    id: text('id').primaryKey(), // slug/uuid
    nickname: text('nickname').notNull(),
    normalized: text('normalized').notNull(),
    role: text('role').notNull().default('member'), // coach | student | member
    source: text('source'), // csv/manual/llm/import
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_community_user_normalized').on(table.normalized),
    index('idx_community_user_role').on(table.role),
  ]
);

export type CommunityUser = typeof communityUser.$inferSelect;
