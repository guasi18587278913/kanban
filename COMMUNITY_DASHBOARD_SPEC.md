# 社群看板 V2 产品与技术方案（完整版）

> 目标：对产研提供无歧义的实现蓝图，覆盖产品需求、数据口径、架构、工程微操、风险控制。适用于 AI 产品出海为主的社群看板，可扩展其他赛道。

---

## 0. 读者指引
| 角色 | 关注重点 |
| --- | --- |
| 产品/运营 | 需求范围、指标口径、榜单/CRM 交互、标签体系、审核/隐私 |
| 前端 | 页面/组件清单、交互细节、移动端适配、虚拟滚动 |
| 后端/数据 | 导入链路、表模型、身份对齐、FTS/索引、缓存/归档、重试 |
| AI 工程 | L1/L2 漏斗、置信度、降本策略、失败兜底 |
| QA | 指标口径、筛选逻辑、隐私/权限、回归场景 |

---

## 0.1 最新进展（2025-12-19）
- Sprint 2 功能：搜索改进、隐私掩码、审核闭环、数据修复脚本均已上线。
- 成员数据：AI产品出海学员/教练 CSV 全量导入 1580 条，planet_id 统一为主键；历史重复 ID 已软删，member_alias 写入 1345 条，期数统一为数字 1/2。
- 群聊原始日志：已导入 487 条（1 期 402，2 期 85），`raw_chat_log` 状态 processed 32 / pending 451 / failed 4（持续跑 LLM 分析中）。
- 身份一致性：qa/good_news/koc/star/member_stats/member_message 的 memberId 均迁移到 planet_id，前端搜索/榜单/CRM 跳转使用 member.id。
- 环境：主用 OpenRouter（`OPENROUTER_MODEL=google/gemini-3-flash-preview`），EVOLINK 已置空以避免抢占。LLM 分析可跑通 1/5~10 批次，偶有网络中断需重试。

## 0.2 短期待办
- 继续跑 LLM 分析：分批执行 `pnpm tsx scripts/run-llm-analysis.ts --limit 5/10` 直到 pending=0，随后针对 failed 4 条单独重跑或排查网络错误。
- 分析完成后：执行 `pnpm tsx scripts/fix-missing-dimensions.ts --dry-run` 验证维度；抽样检查 `/community`、教练/学员 CRM 数据是否出现。
- 搜索/性能：按计划补 pg_jieba + GIN，替换 LIKE；检查 search API 性能。
- 数据核验：对比 member_message/qa/good_news 等量级与期数，必要时抽样核对消息/问答归属。
- UI 调整：好事墙用户视角只显示已审核，不再显式展示审核标识；榜单/CRM 显示轻量标签行（产品线/期数/赛道/阶段/活跃度），CRM 支持“全部原文/高光/过滤”切换。

## 0.3 聚焦「AI产品出海」版面与规划
- 看板范围：只展示 AI产品出海 SKU 的指标与榜单，入口筛选默认锁定该产品线/期数。
- 数据现状：成员 1580 条已导入并去重；群聊原始日志 487 条已入库，LLM 解析 processed 32 / pending 451 / failed 4。
- 页面状态：总览页 KPI/趋势/KOC/好事墙/双榜单已可用；点击昵称跳转教练/学员 CRM 已通，支持全量原文（虚拟滚动）与高光过滤。
- 新增面板：在社群看板增加“运营面板”区块，回答“目前运营最需要关注的事情是这些”，内容源自未解决问题、高等待时长 QA、负面情绪/高价值需求（后续可由 LLM 主题/标签生成简单列表）。
- “运营面板”设计（轻量规则版，后续可接 LLM）：  
  - 价值锚点：对照“出海实战/变现”预期，统计近 7 天出海相关 vs 噪音（红包/闲聊等）占比，列 3 条提醒，避免价值稀释。  
  - 关键用户：用 KOC/答疑/发言榜 Top10~20%，标出近 3 天新增活跃者，给出建议动作（感谢/邀请分享/徽章）。  
  - 确定性节奏：显示答疑平均等待、未解决数、固定节奏执行状态（如每周话题发布 Y/N），提示需推动的节奏。  
  - 交互：单卡模块《运营面板》，展示 5~10 条事项，按紧急度排序；用户视角无审核标识，管理员仍可在 CRM/管理视角审核。
- 下一步（为尽快上线首版）：  
  1) 清空 pending LLM 解析 → 处理 failed 4 → 跑维度校验脚本。  
  2) 看板端：好事墙仅显示已审核；新增“运营面板”模块（规则版）+ 榜单/CRM 标签行（先用现有字段）。  
  3) CRM：保留全量原文/高光/过滤切换；顶部轻量标签行（产品线/期数/赛道/阶段/活跃度）；审核按钮仅管理员可见。  
  4) 搜索/性能：补 pg_jieba + GIN（如时间不够，可先保留当前 LIKE，记为下一个迭代）。  
  5) 待 LLM 全量跑完后，再接入主题/风险标签，替换运营面板的规则信号。

---

## 1. 目标与范围
- 自动从群聊/日报生成结构化数据，提供可行动的运营看板（KPI/趋势/好事/KOC/标杆/问答/运营清单）。
- 支持教练/志愿者答疑榜、学员发言榜，点击进个人 CRM。
- 支持多产品线、多期数；移动端友好；可审核、可隐私降级。
- 范围内：数据导入、解析、展示、榜单、CRM、标签、审核、搜索、合并成员。
- 范围外：支付、认证、外部营销自动化（仅预留魔法链接认领档案）。

---

## 2. 页面与交互（ASCII 原型）

### 2.1 总览页
```
┌───────────────────────────────────────────────┐
│ KPI 卡片：消息 | 提问 | 均响 | 解决率 | 好事   │
├───────────────────────────────────────────────┤
│ 筛选：产品线 [AI出海/YouTube/B站] 期数 [全部/1/2] │
├───────────────────────────────────────────────┤
│ 趋势图：消息/提问/解决率/好事 (可切线/面积)       │
├───────────────────────┬───────────────────────┤
│ KOC/标杆云 (去重计数)  │ 好事流 (时间顺序 + 审核态)│
├───────────────────────┴───────────────────────┤
│ 未解决问题列表 + 运营清单 (LLM/规则产出)          │
├───────────────────────┬───────────────────────┤
│ 教练/志愿者答疑榜 (Score)| 学员发言榜 (Score)      │
└───────────────────────┴───────────────────────┘
```

### 2.2 CRM（教练/学员）
```
┌─────────────────────────┐
│ 头像 昵称 角色 产品线 期数 活跃度 最近活跃 │
├─────────────────────────┤
│ 标签分组：身份与权益 / 学习进度 / 成果与价值 / 细分赛道 │
├─────────────────────────┤
│ 指标卡：消息总数 | 答疑数(教练) | 未解决 | 好事贡献 | 活跃天数 │
├─────────────────────────┤
│ 时间线 (默认 Highlights：问答/好事/分享；全部消息折叠/仅管理员) │
│  - 虚拟滚动，仅渲染可见 10-20 条                      │
├─────────────────────────┤
│ 关联：好事 / KOC / 标杆列表                           │
├─────────────────────────┤
│ 行动话术：未闭环提问@、里程碑祝贺词（可一键复制）          │
└─────────────────────────┘
```

---

## 3. 角色与标签体系

### 3.1 角色
| 角色 | 描述 | 典型行为 |
| --- | --- | --- |
| 教练/志愿者 | 回答/带新人 | 回答问题、分享资料 |
| 学员 | 学习/实践 | 提问、发言、报喜 |
| 运营/管理员 | 审核/合并/跟进 | 审核好事/问答、合并成员、生成话术 |

### 3.2 标签映射（落地字段/表）
| 类别 | 标签示例 | 存储字段/表 |
| --- | --- | --- |
| 身份与权益 | 产品归属(AI/YouTube/B站)、期数(AI-1期)、圈层身份(生财会员/航海家/非会员)、城市、活跃状态(高频/默默/失联) | member.productLine / period / circleIdentity / location / activityLevel 或 member_tag(identity:*) |
| 学习进度 | AI出海：环境搭建→MVP→支付→上线；YouTube：选赛道→起号→冲YPP→稳定；B站：选品/脚本→制作→首单→持续 | member.progressAiProduct / progressYoutube / progressBilibili 或 member_tag(progress:*) |
| 成果与价值 | 里程碑(上线/YPP/首单)、变现量级(0-100/回本/百刀/千刀/万刀)、细分赛道(SaaS/套壳/故事号…) | member.milestones / revenueLevel / niche 或 member_tag(achievement/niche:*) |

---

## 4. 指标与榜单口径

### 4.1 KPI/趋势
| 指标 | 口径 | 来源 |
| --- | --- | --- |
| 消息数 | daily_stats.messageCount | daily_stats |
| 提问数 | daily_stats.questionCount | daily_stats |
| 平均响应 | daily_stats.avgResponseMinutes | daily_stats |
| 解决率 | daily_stats.resolutionRate | daily_stats |
| 好事数 | daily_stats.goodNewsCount | daily_stats |

### 4.2 榜单 Score
- Score = MsgCount*1 + Question*3 + Answer*5 + GoodNews*20（可配置）。
- 教练榜：主要看 Answer + Msg；学员榜：主要看 Msg，可加 Question 权重。
- 筛选：产品线、期数、角色、活跃度；搜索昵称（FTS）。

### 4.3 问答/未解决/运营清单
| 项 | 口径/规则 |
| --- | --- |
| 问答 | qa_record，或 LLM questions( answeredBy/resolved/waitMins ) |
| 未解决 | resolved=false 或缺 answeredBy |
| 运营清单 | actionItems(category/description/relatedTo)，LLM 产出可审核 |

---

## 5. 数据流与容灾

### 5.1 导入流程（ASCII）
```
[上传群聊txt]
     |
     v
 [L1 规则层] --过滤垃圾/识别疑似问答/好事--> (高价值片段)
     |
     v
 [L2 LLM层] --解析 questions/good_news/koc/star/metrics + confidence-->
     |
     v
 [落库 V2]
   - raw_chat_log (hash)
   - member_message (过滤后)
   - qa_record / good_news / koc_record / star_student
   - daily_stats / member_stats
   - confidence < 阈值 -> 待审核池
```

### 5.2 容灾与重试
| 情况 | 处理 |
| --- | --- |
| LLM 挂/额度不足 | 仍写 raw_chat_log + member_message(type=normal)，写 retry_queue；脚本 `pnpm run retry-analysis` 只补分析层 |
| 解析失败片段 | 记录错误日志，片段入待审核池 |

---

## 6. 存储与索引（V2）
| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| raw_chat_log | id, productLine, period, groupNumber, chatDate, fileHash, rawContent, status | 原始全文，冷热分层 |
| daily_stats | productLine, period, groupNumber, statsDate, messageCount, questionCount, resolutionRate, avgResponseMinutes, goodNewsCount, hourly_distribution | 日聚合 |
| member | id, primary_identifier_type/value, role, productLine, period, circleIdentity, location, activityLevel, progress*, milestones, revenueLevel, niche | 主实体 |
| member_alias | id, memberId, alias | 历史昵称 |
| member_message | id, memberId?, authorName, messageType, messageContent, messageTime, productLine, period, groupNumber, contextBefore/After | 过滤后消息 |
| qa_record | id, sourceLogId, asker/answerer Id/Name, question/answer, responseMinutes, isResolved, confidence | 问答 |
| good_news | id, sourceLogId, memberId?, authorName, content, category, revenueLevel, milestones, eventDate, confidence, isVerified | 好事 |
| koc_record | id, sourceLogId, memberId?, kocName, contribution, type, recordDate, isVerified | KOC |
| star_student | id, sourceLogId, memberId?, studentName, type, achievement, recordDate, isVerified | 标杆 |
| member_stats | memberId, totalMessages, questionCount, answerCount, goodNewsCount, activeDays, lastActiveDate, kocContributions | 累计 |
| member_tag | memberId, tag_category(identity/progress/achievement/niche), tag_name, tag_value, source, confidence | 标签 |
| retry_queue | rawLogId, status | LLM 失败重试 |

索引/性能：
- FTS：member.nickname, member_message.content 建 GIN（中文分词：pg_jieba 或二元分词）。
- 高频查询：qa_record (answerer/time)、good_news/koc/star (date/source)、member_message (memberId/time/type)。
- 归档：member_message 只保留近 6 个月热数据，其余归档或 summary。
- 垃圾过滤：长度<=3、纯表情/口水不入库。

---

## 7. 身份对齐与合并
- 匹配顺序：member_id > member_alias > 归一昵称+群号弱指纹。
- 归一昵称：去括号/后缀/符号，小写 slug；原始昵称保留。
- 合并成员（Admin Action）：输入 Target, Source；更新 Source 所有引用到 Target，Source 昵称入 alias，Source 软删。

---

## 8. 搜索与虚拟滚动
- 搜索：Postgres FTS + GIN，避免 LIKE 全表扫；CRM/榜单昵称与消息搜索共用。
- 虚拟滚动：时间线使用 TanStack Virtual/react-window，视口渲染 10-20 条；分页或无限加载兼容。

---

## 9. 隐私与移动端
| 项 | 设计 |
| --- | --- |
| 时间线默认 | 仅 Highlights（问答/好事/分享），全部消息折叠或仅管理员可见 |
| 隐私开关 | 预留“仅公开群/隐藏个人页” |
| 移动端 | 榜单卡片化、图表可折叠/简化、筛选抽屉式，虚拟滚动保流畅 |

---

## 10. API 设计（概要）
| API | 功能 |
| --- | --- |
| POST /api/community/import (现有) | 上传 txt，走 L1+L2，落 V2（兼容旧表可选） |
| GET /api/community/coach-student | DB 榜单，筛选/搜索/分页，返回榜单+汇总 |
| GET /api/community/member/:slug | CRM 数据（画像/标签/指标/时间线/关联好事KOC） |
| POST /api/community/retry-analysis | 处理 retry_queue |
| POST /api/community/merge-member | 合并成员（Admin） |
| 审核接口 | 好事/问答/清单审核，写 *_verified；低置信度不上墙 |
| 魔法链接 Claim | 生成 signed link，种本地 Token，允许编辑自身标签（MVP 可选后置） |

---

## 11. 工程微操与降本
- L1/L2 漏斗：先规则再 LLM；LLM 输出 confidence_score，低分待审核。
- Fail-over：LLM 挂不丢数据，raw_chat_log + retry_queue；补分析脚本。
- Score 防刷：榜单按 Score 排序，抑制灌水；过滤垃圾消息。
- 搜索：FTS + GIN，中文分词；避免 LIKE。
- 前端虚拟滚动：时间线大列表不卡顿。
- 归档：member_message 热 6 个月，冷归档或 summary。

---

## 12. 落地步骤（建议）
1) 数据链路：扩展导入写全 V2；规则过滤+高价值 LLM；retry_queue；alias/弱指纹匹配；member_tag 初始化（身份/进度/成果）。
2) API：榜单 DB 化；CRM API；审核/待审核池；Merge API；FTS 接入。
3) 前端：榜单筛选+Score 排序+跳 CRM；CRM 标签/指标/时间线（虚拟滚动）/行动话术；未解决/清单挂载；移动端适配。
4) 隐私与自助：隐私开关；魔法链接 Claim Profile（可后置）。

---

## 13. 风险与对策
| 风险 | 对策 |
| --- | --- |
| 身份误判 | alias + 弱指纹 + 合并工具；人工纠偏入口 |
| 成本/性能 | L1/L2 漏斗、FTS+GIN、垃圾过滤、虚拟滚动、冷热分层 |
| 数据质量 | 置信度阈值 + 待审核池；审核保护已确认数据 |
| 移动端体验 | 卡片化/折叠/简化图表/虚拟滚动 |

---

## 14. 验收要点（示例）
- 导入：LLM 挂起时 raw_chat_log 正常入库，retry_queue 生成；重试后 QA/好事补齐。
- 榜单：Score 排序正确，灌水用户不超越高质量答疑；筛选/搜索（FTS）毫秒级响应。
- CRM：标签分组展示，时间线虚拟滚动不卡；全部消息默认折叠；行动话术可复制。
- 审核：低置信度不上墙；审核后字段不被覆盖。
- 移动端：榜单可滑，趋势可折叠，时间线流畅。
