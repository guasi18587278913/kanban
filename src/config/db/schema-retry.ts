import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const retryQueue = pgTable('retry_queue', {
  id: text('id').primaryKey(),
  rawLogId: text('raw_log_id').notNull(),
  status: text('status').notNull().default('pending'), // pending, processing, done, failed
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
