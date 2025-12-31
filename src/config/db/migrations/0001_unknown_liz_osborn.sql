CREATE TABLE "community_import_log" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"import_date" timestamp DEFAULT now() NOT NULL
);
