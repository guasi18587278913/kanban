CREATE TABLE IF NOT EXISTS community_user (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    normalized TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    source TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_user_normalized ON community_user(normalized);
CREATE INDEX IF NOT EXISTS idx_community_user_role ON community_user(role);
