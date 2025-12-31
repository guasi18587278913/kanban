CREATE TABLE "daily_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"product_line" text NOT NULL,
	"period" text NOT NULL,
	"group_number" integer NOT NULL,
	"stats_date" timestamp NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"active_users" integer DEFAULT 0 NOT NULL,
	"question_count" integer DEFAULT 0 NOT NULL,
	"resolved_count" integer DEFAULT 0 NOT NULL,
	"resolution_rate" integer,
	"avg_response_minutes" integer,
	"good_news_count" integer DEFAULT 0 NOT NULL,
	"koc_count" integer DEFAULT 0 NOT NULL,
	"hourly_distribution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "good_news" (
	"id" text PRIMARY KEY NOT NULL,
	"source_log_id" text NOT NULL,
	"member_id" text,
	"author_name" text NOT NULL,
	"content" text NOT NULL,
	"category" text,
	"revenue_level" text,
	"milestones" text,
	"event_date" timestamp NOT NULL,
	"confidence" text,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "koc_record" (
	"id" text PRIMARY KEY NOT NULL,
	"source_log_id" text NOT NULL,
	"member_id" text,
	"koc_name" text NOT NULL,
	"contribution" text NOT NULL,
	"contribution_type" text,
	"helped_count" integer,
	"record_date" timestamp NOT NULL,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"planet_id" text,
	"nickname" text NOT NULL,
	"nickname_normalized" text,
	"role" text NOT NULL,
	"product_line" text NOT NULL,
	"period" text,
	"circle_identity" text,
	"location" text,
	"activity_level" text,
	"join_date" timestamp,
	"expire_date" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"progress_ai_product" text,
	"progress_youtube" text,
	"progress_bilibili" text,
	"milestones" text,
	"revenue_level" text,
	"niche" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_message" (
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
);
--> statement-breakpoint
CREATE TABLE "member_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_stats_member_id_unique" UNIQUE("member_id")
);
--> statement-breakpoint
CREATE TABLE "member_tag" (
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
);
--> statement-breakpoint
CREATE TABLE "qa_record" (
	"id" text PRIMARY KEY NOT NULL,
	"source_log_id" text NOT NULL,
	"asker_id" text,
	"asker_name" text NOT NULL,
	"question_content" text NOT NULL,
	"question_time" timestamp NOT NULL,
	"answerer_id" text,
	"answerer_name" text,
	"answerer_role" text,
	"answer_content" text,
	"answer_time" timestamp,
	"response_minutes" integer,
	"is_resolved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_chat_log" (
	"id" text PRIMARY KEY NOT NULL,
	"product_line" text NOT NULL,
	"period" text NOT NULL,
	"group_number" integer NOT NULL,
	"chat_date" timestamp NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text,
	"raw_content" text NOT NULL,
	"message_count" integer DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_student" (
	"id" text PRIMARY KEY NOT NULL,
	"source_log_id" text NOT NULL,
	"member_id" text,
	"student_name" text NOT NULL,
	"type" text NOT NULL,
	"achievement" text NOT NULL,
	"revenue_level" text,
	"record_date" timestamp NOT NULL,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_daily_report" ADD COLUMN "activity_feature_verified" text;--> statement-breakpoint
ALTER TABLE "community_daily_report" ADD COLUMN "good_news_count_verified" integer;--> statement-breakpoint
ALTER TABLE "community_daily_report" ADD COLUMN "action_list_verified" text;--> statement-breakpoint
ALTER TABLE "community_daily_report" ADD COLUMN "is_verified" boolean DEFAULT false;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_daily_stats_unique" ON "daily_stats" USING btree ("product_line","period","group_number","stats_date");--> statement-breakpoint
CREATE INDEX "idx_daily_stats_date" ON "daily_stats" USING btree ("stats_date");--> statement-breakpoint
CREATE INDEX "idx_daily_stats_product" ON "daily_stats" USING btree ("product_line","period");--> statement-breakpoint
CREATE INDEX "idx_good_news_source" ON "good_news" USING btree ("source_log_id");--> statement-breakpoint
CREATE INDEX "idx_good_news_date" ON "good_news" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "idx_good_news_member" ON "good_news" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_koc_record_source" ON "koc_record" USING btree ("source_log_id");--> statement-breakpoint
CREATE INDEX "idx_koc_record_date" ON "koc_record" USING btree ("record_date");--> statement-breakpoint
CREATE INDEX "idx_koc_record_member" ON "koc_record" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_member_planet_id" ON "member" USING btree ("planet_id");--> statement-breakpoint
CREATE INDEX "idx_member_role" ON "member" USING btree ("role","product_line");--> statement-breakpoint
CREATE INDEX "idx_member_nickname" ON "member" USING btree ("nickname_normalized");--> statement-breakpoint
CREATE INDEX "idx_member_activity" ON "member" USING btree ("activity_level");--> statement-breakpoint
CREATE INDEX "idx_member_revenue" ON "member" USING btree ("revenue_level");--> statement-breakpoint
CREATE INDEX "idx_member_message_member" ON "member_message" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_member_message_timeline" ON "member_message" USING btree ("member_id","message_time");--> statement-breakpoint
CREATE INDEX "idx_member_message_source" ON "member_message" USING btree ("source_log_id");--> statement-breakpoint
CREATE INDEX "idx_member_message_type" ON "member_message" USING btree ("member_id","message_type");--> statement-breakpoint
CREATE INDEX "idx_member_message_author" ON "member_message" USING btree ("author_normalized");--> statement-breakpoint
CREATE INDEX "idx_member_stats_product" ON "member_stats" USING btree ("product_line","period");--> statement-breakpoint
CREATE INDEX "idx_member_stats_messages" ON "member_stats" USING btree ("total_messages");--> statement-breakpoint
CREATE INDEX "idx_member_stats_answers" ON "member_stats" USING btree ("answer_count");--> statement-breakpoint
CREATE INDEX "idx_member_stats_active" ON "member_stats" USING btree ("active_days");--> statement-breakpoint
CREATE INDEX "idx_member_tag_member" ON "member_tag" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_member_tag_category" ON "member_tag" USING btree ("member_id","tag_category");--> statement-breakpoint
CREATE INDEX "idx_member_tag_name" ON "member_tag" USING btree ("tag_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_member_tag_unique" ON "member_tag" USING btree ("member_id","tag_category","tag_name");--> statement-breakpoint
CREATE INDEX "idx_qa_record_source" ON "qa_record" USING btree ("source_log_id");--> statement-breakpoint
CREATE INDEX "idx_qa_record_date" ON "qa_record" USING btree ("question_time");--> statement-breakpoint
CREATE INDEX "idx_qa_record_asker" ON "qa_record" USING btree ("asker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_raw_chat_unique" ON "raw_chat_log" USING btree ("product_line","period","group_number","chat_date");--> statement-breakpoint
CREATE INDEX "idx_raw_chat_date" ON "raw_chat_log" USING btree ("chat_date");--> statement-breakpoint
CREATE INDEX "idx_raw_chat_status" ON "raw_chat_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_star_student_source" ON "star_student" USING btree ("source_log_id");--> statement-breakpoint
CREATE INDEX "idx_star_student_date" ON "star_student" USING btree ("record_date");--> statement-breakpoint
CREATE INDEX "idx_star_student_member" ON "star_student" USING btree ("member_id");