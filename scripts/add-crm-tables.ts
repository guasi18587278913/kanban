/**
 * 添加 CRM 数据表
 * 用于个人看板功能
 */

import 'dotenv/config';
import { db } from '../src/core/db';
import { sql } from 'drizzle-orm';

async function addCrmTables() {
  console.log('Adding CRM tables...\n');

  // 1. member_message 表
  console.log('Creating member_message table...');
  await db().execute(sql`
    CREATE TABLE IF NOT EXISTS "member_message" (
      "id" text PRIMARY KEY NOT NULL,
      "member_id" text,
      "source_log_id" text NOT NULL,
      "author_name" text NOT NULL,
      "author_normalized" text,
      "message_content" text NOT NULL,
      "message_time" timestamp NOT NULL,
      "message_index" integer NOT NULL,
      "message_type" text NOT NULL,
      "related_qa_id" text,
      "related_good_news_id" text,
      "related_koc_id" text,
      "context_before" text,
      "context_after" text,
      "product_line" text NOT NULL,
      "period" text NOT NULL,
      "group_number" integer NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  // member_message indexes
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_message_member" ON "member_message" USING btree ("member_id")`);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_message_timeline" ON "member_message" USING btree ("member_id","message_time")`);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_message_source" ON "member_message" USING btree ("source_log_id")`);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_message_type" ON "member_message" USING btree ("member_id","message_type")`);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_message_author" ON "member_message" USING btree ("author_normalized")`);
  console.log('  ✓ member_message created');

  // 2. member_stats 表
  console.log('Creating member_stats table...');
  await db().execute(sql`
    CREATE TABLE IF NOT EXISTS "member_stats" (
      "id" text PRIMARY KEY NOT NULL,
      "member_id" text NOT NULL UNIQUE,
      "product_line" text NOT NULL,
      "period" text,
      "total_messages" integer DEFAULT 0 NOT NULL,
      "question_count" integer DEFAULT 0 NOT NULL,
      "answer_count" integer DEFAULT 0 NOT NULL,
      "good_news_count" integer DEFAULT 0 NOT NULL,
      "share_count" integer DEFAULT 0 NOT NULL,
      "encouragement_count" integer DEFAULT 0 NOT NULL,
      "avg_response_minutes" integer,
      "resolved_count" integer,
      "helped_students" integer,
      "active_days" integer DEFAULT 0 NOT NULL,
      "last_active_date" timestamp,
      "first_active_date" timestamp,
      "koc_contributions" integer DEFAULT 0 NOT NULL,
      "total_helped_count" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  // member_stats indexes
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_stats_product" ON "member_stats" USING btree ("product_line","period")`);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_stats_messages" ON "member_stats" USING btree ("total_messages")`);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_stats_answers" ON "member_stats" USING btree ("answer_count")`);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_stats_active" ON "member_stats" USING btree ("active_days")`);
  console.log('  ✓ member_stats created');

  // 3. member_tag 表
  console.log('Creating member_tag table...');
  await db().execute(sql`
    CREATE TABLE IF NOT EXISTS "member_tag" (
      "id" text PRIMARY KEY NOT NULL,
      "member_id" text NOT NULL,
      "tag_category" text NOT NULL,
      "tag_name" text NOT NULL,
      "tag_value" text,
      "source" text NOT NULL,
      "source_log_id" text,
      "confidence" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  // member_tag indexes
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_tag_member" ON "member_tag" USING btree ("member_id")`);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_tag_category" ON "member_tag" USING btree ("member_id","tag_category")`);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_tag_name" ON "member_tag" USING btree ("tag_name")`);
  await db().execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "idx_member_tag_unique" ON "member_tag" USING btree ("member_id","tag_category","tag_name")`);
  console.log('  ✓ member_tag created');

  // 4. member_alias 表
  console.log('Creating member_alias table...');
  await db().execute(sql`
    CREATE TABLE IF NOT EXISTS "member_alias" (
      "id" text PRIMARY KEY NOT NULL,
      "member_id" text NOT NULL,
      "alias" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db().execute(sql`CREATE INDEX IF NOT EXISTS "idx_member_alias_member" ON "member_alias" USING btree ("member_id")`);
  await db().execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "idx_member_alias_unique" ON "member_alias" USING btree ("alias")`);
  console.log('  ✓ member_alias created');

  console.log('\n✅ All CRM tables created successfully!');
}

addCrmTables()
  .catch(console.error)
  .finally(() => process.exit(0));
