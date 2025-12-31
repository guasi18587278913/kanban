CREATE TABLE IF NOT EXISTS tag_catalog (
  id text PRIMARY KEY,
  category text NOT NULL,
  name text NOT NULL,
  aliases text[],
  status text DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_catalog_unique
  ON tag_catalog (category, name);

CREATE INDEX IF NOT EXISTS idx_tag_catalog_category
  ON tag_catalog (category);

CREATE INDEX IF NOT EXISTS idx_tag_catalog_status
  ON tag_catalog (status);
