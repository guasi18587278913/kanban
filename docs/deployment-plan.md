# 部署上线计划

## 当前状态

### 已完成
- [x] Neon 数据库配置
- [x] 数据迁移（1455 成员 + 487 群聊记录）
- [x] 分析引擎实现
- [x] 派生数据生成（4016 好事 + 3489 KOC + 10492 问答 + 521 标杆）

### 待完成
- [ ] 前端面板使用 V2 数据
- [ ] 环境变量配置
- [ ] 本地测试
- [ ] Git 提交
- [ ] Vercel 部署

---

## 任务 1: 更新前端面板

### 1.1 修改 community-actions.ts
将 `getDashboardStats()` 改为读取 V2 表：
- `daily_stats` 替代 `community_daily_report`
- `good_news` 替代旧的 `activityFeature`
- `star_student` 替代 `community_star_student`
- `koc_record` 替代 `community_koc`

### 1.2 修改前端页面
- `src/app/[locale]/community/page.tsx`
- 使用 `community-v2-actions.ts` 的函数

---

## 任务 2: 环境变量配置

### 本地 .env.local (已配置)
```env
DATABASE_URL="postgresql://neondb_owner:***@ep-shiny-breeze-afp416jf.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require"
EVOLINK_API_KEY=sk-***
EVOLINK_MODEL=gemini-2.5-flash
EVOLINK_BASE_URL=https://api.evolink.ai/v1
```

### Vercel 环境变量 (需配置)
在 Vercel 项目设置中添加：
1. `DATABASE_URL` - Neon 连接字符串
2. `AUTH_SECRET` - 认证密钥
3. `NEXT_PUBLIC_APP_URL` - 生产域名
4. `EVOLINK_API_KEY` - LLM API 密钥 (可选)

---

## 任务 3: 本地测试

```bash
# 启动开发服务器
npm run dev

# 访问测试
http://localhost:3000/community

# 检查项
- [ ] 面板数据正确加载
- [ ] 好事墙显示
- [ ] KOC 列表显示
- [ ] 问答统计正确
```

---

## 任务 4: Git 提交

```bash
git add .
git commit -m "feat: 完成 V2 架构迁移和分析引擎

- 迁移数据库到 Neon
- 实现分析引擎（预处理层+规则引擎+输出层）
- 处理 487 条群聊记录
- 提取 4016 条好事、3489 条 KOC、10492 条问答
- 更新前端面板读取 V2 数据

🤖 Generated with Claude Code"

git push origin main
```

---

## 任务 5: Vercel 部署

### 5.1 连接 GitHub 仓库
1. 登录 https://vercel.com
2. 导入 GitHub 仓库 `00群看板`

### 5.2 配置环境变量
在 Vercel 项目 Settings > Environment Variables 添加：
- `DATABASE_URL`
- `AUTH_SECRET`
- 其他必要变量

### 5.3 部署
- Vercel 会自动构建和部署
- 检查构建日志确保无错误

---

## 预计耗时

| 任务 | 时间 |
|------|------|
| 更新前端面板 | 30 分钟 |
| 环境变量配置 | 10 分钟 |
| 本地测试 | 15 分钟 |
| Git 提交 | 5 分钟 |
| Vercel 部署 | 15 分钟 |
| **总计** | **约 1.5 小时** |

---

## 注意事项

1. **数据库连接**
   - Neon 免费版有连接数限制，确保使用连接池
   - 已在 `.env.local` 配置 `?sslmode=require`

2. **敏感信息**
   - 不要将 `.env.local` 提交到 Git
   - 确保 `.gitignore` 包含 `.env.local`

3. **构建优化**
   - 如果构建慢，检查是否有不必要的依赖
   - Vercel 免费版有构建时间限制

4. **回滚方案**
   - 本地备份在 `backups/` 目录
   - Neon 有时间点恢复功能
