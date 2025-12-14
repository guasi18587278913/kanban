#!/bin/bash
# 数据库备份脚本
# 用法: ./scripts/backup-db.sh

set -e

# 配置
PSQL_PATH="/Applications/Postgres.app/Contents/Versions/latest/bin"
DB_URL="postgresql://liyadong@localhost:5432/postgres"
BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

# 确保备份目录存在
mkdir -p "$BACKUP_DIR"

echo "开始备份数据库..."
echo "备份文件: $BACKUP_FILE"

# 执行备份
"$PSQL_PATH/pg_dump" "$DB_URL" > "$BACKUP_FILE"

# 获取文件大小
FILE_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')

echo "✅ 备份完成!"
echo "   文件: $BACKUP_FILE"
echo "   大小: $FILE_SIZE"

# 清理旧备份（保留最近10个）
echo ""
echo "清理旧备份（保留最近10个）..."
cd "$BACKUP_DIR"
ls -t backup_*.sql 2>/dev/null | tail -n +11 | xargs -I {} rm -f {}
echo "当前备份文件:"
ls -lh backup_*.sql 2>/dev/null || echo "  (无备份文件)"
