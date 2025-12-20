# 数据库迁移操作步骤（手动执行版）

> 适用场景：本地已安装 psql 客户端（通过 `brew install libpq`），并已配置 `DATABASE_URL`。

## 一次性准备
1. 终端执行（分两行依次回车），将 psql 路径加入 PATH：
   ```bash
   echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
   exec zsh
   ```

## 迁移执行
在终端按以下顺序执行（可整段复制后分步粘贴）：

1) 进入项目目录：
```bash
cd "/Users/liyadong/Documents/GitHub/00群看板"
```

2) 创建缺失的 V2 表（raw_chat_log/good_news/koc_record/qa_record/star_student/member_message）：
```bash
psql "$DATABASE_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS raw_chat_log (
  id text PRIMARY KEY,
  product_line text NOT NULL,
  period text NOT NULL,
  group_number integer NOT NULL,
  chat_date timestamp NOT NULL,
  file_name text NOT NULL,
  file_hash text,
  raw_content text NOT NULL,
  message_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamp,
  status_reason text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_chat_unique ON raw_chat_log (product_line, period, group_number, chat_date);
CREATE INDEX IF NOT EXISTS idx_raw_chat_date ON raw_chat_log (chat_date);
CREATE INDEX IF NOT EXISTS idx_raw_chat_status ON raw_chat_log (status);

CREATE TABLE IF NOT EXISTS good_news (
  id text PRIMARY KEY,
  source_log_id text NOT NULL,
  member_id text,
  author_name text NOT NULL,
  content text NOT NULL,
  category text,
  revenue_level text,
  milestones text,
  event_date timestamp NOT NULL,
  confidence text,
  is_verified boolean DEFAULT false,
  status text DEFAULT 'active',
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS koc_record (
  id text PRIMARY KEY,
  source_log_id text NOT NULL,
  member_id text,
  koc_name text NOT NULL,
  contribution text NOT NULL,
  contribution_type text,
  helped_count integer,
  record_date timestamp NOT NULL,
  is_verified boolean DEFAULT false,
  confidence text,
  status text DEFAULT 'active',
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS qa_record (
  id text PRIMARY KEY,
  source_log_id text NOT NULL,
  asker_id text,
  asker_name text NOT NULL,
  question_content text NOT NULL,
  question_time timestamp NOT NULL,
  answerer_id text,
  answerer_name text,
  answerer_role text,
  answer_content text,
  answer_time timestamp,
  response_minutes integer,
  is_resolved boolean DEFAULT false,
  confidence text,
  status text DEFAULT 'active',
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS star_student (
  id text PRIMARY KEY,
  source_log_id text NOT NULL,
  member_id text,
  student_name text NOT NULL,
  type text NOT NULL,
  achievement text NOT NULL,
  revenue_level text,
  record_date timestamp NOT NULL,
  is_verified boolean DEFAULT false,
  confidence text,
  status text DEFAULT 'active',
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS member_message (
  id text PRIMARY KEY,
  member_id text,
  source_log_id text NOT NULL,
  author_name text NOT NULL,
  author_normalized text,
  message_content text NOT NULL,
  message_time timestamp NOT NULL,
  message_index integer NOT NULL,
  message_type text NOT NULL,
  related_qa_id text,
  related_good_news_id text,
  related_koc_id text,
  context_before text,
  context_after text,
  product_line text NOT NULL,
  period text NOT NULL,
  group_number integer NOT NULL,
  status text DEFAULT 'active',
  created_at timestamp DEFAULT now() NOT NULL
);
SQL
```

3) 运行补充列与 retry_queue 的脚本（如列已存在会忽略）：
```bash
psql "$DATABASE_URL" -f drizzle/20241215_add_v2_columns_and_retry.sql
```

执行完毕即可完成 V2 表创建和新增字段。若遇到错误信息，将终端输出发给开发协助定位。***
