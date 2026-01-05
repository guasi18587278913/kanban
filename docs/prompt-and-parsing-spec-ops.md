# 提示词与解析规则规范（运营版）

面向运营团队整理的提示词与规则说明，覆盖：分析入口、触发条件、LLM 提示词、规则引擎口径、旧版兼容逻辑及可操作建议。本文以“可落地、可解释、可维护”为目标。

---

## 1. 适用范围与入口

### 1.1 适用范围
- **主要分析路径（新版）**：规则引擎 +（可选）LLM 语义分析。
- **LLM 全量管道**：用于高精度问答、好事、KOC、成员标签。
- **旧版解析/兼容**：用于历史脚本与旧日报结构的处理。

### 1.2 入口脚本与对应模块
- 规则引擎批量分析：`scripts/run-analysis.ts` → `src/lib/analysis/*`
- LLM 分析管道：`scripts/run-llm-analysis.ts` → `src/lib/llm-analysis-pipeline.ts` + `src/lib/llm-chat-analyzer.ts`
- 旧版 LLM 抽取：`src/lib/community-llm-extractor.ts`（用于部分导入脚本）

> 注：当前规则引擎内的 “LLM 增强” 逻辑仍是 TODO，主要依赖 LLM 管道完成语义深度抽取。

---

## 2. 输入数据规范（运营可控）

### 2.1 文件命名规范
推荐格式：`深海圈丨AI产品出海1期1群_2025-12-01.txt`
- 规则识别期数/群号/日期依赖文件名
- 旧版兼容支持 `深海圈丨产品线_YYYY-MM-DD.txt`

### 2.2 行格式规范
推荐格式（用于预处理与统计）：
```
昵称(wxid) MM-DD HH:MM:SS
消息正文（可多行，直到下一条头部）
```
系统会按 “消息头部” 断句，后续多行拼接为同一条消息。

### 2.3 运营侧可优化的输入
- 建议统一使用 `#生财好事` / `#举手` 等模板，能显著提升好事识别准确率。
- 鼓励显式写出**金额**与**量级**（如“出单 120 美元”）。
- 鼓励“问题闭环回复”，例如：“谢谢，已解决/已搞定”。

---

## 3. 分析路径概览（业务口径）

### 3.1 规则引擎（快速、低成本）
流程：预处理 → 问答/好事/KOC 检测 → 写入派生表  
适用：日常批量、成本敏感、规则可解释的场景。

### 3.2 LLM 分析管道（高精度）
流程：消息切片 → LLM 提取结构化数据 → 合并去重 → 写库  
适用：需要语义理解、成员标签、可写稿候选等场景。

### 3.3 旧版 LLM 抽取（兼容历史）
适用：老脚本导入与旧日报解析，输出结构较旧，精度中等。

---

## 4. LLM 提示词规范（运营理解版）

### 4.1 新版主分析提示词（完整）
**系统提示词（SYSTEM_PROMPT，来源：`src/lib/llm-chat-analyzer.ts`）**

````text
你是一位资深的社群运营分析专家，拥有 10 年互联网社群运营经验。
你的任务是分析微信群聊记录，提取结构化数据。

【核心能力】
1. 精准识别问题和回答的配对关系
2. 区分真正的"好事"（如出单、里程碑）与普通的正面表达
3. 识别可写稿候选（直接可写稿的人）
4. 理解上下文语境，避免误判
5. 为成员打上标签（赛道/阶段/意图/活跃度）并标注情绪与风险信号

【判断标准】

■ 问题识别：
- 含问号且是真实疑问（排除反问、设问）
- 求助性表达：请问、求助、怎么、如何、能不能
- 最小长度：5个字符

■ 回答识别：
- 紧跟问题的非提问者回复
- 内容具有解答性质
- 排除：表情、无意义回复

■ 好事判断（严格标准）：
✓ 真正的好事：
  - 明确的收入/变现（出单、成交、提现、赚了 XX 元）
  - 里程碑成就（首单、破百、YPP 通过、上架成功）
  - 可量化的增长（涨粉 1000、播放量 10 万）

✗ 不是好事：
  - 泛泛的正面表达（太棒了、加油、厉害）
  - 学习体验分享（学到了、干货满满）
  - 计划或意向（准备做、打算试试）
  - 转发他人的成果

■ 可写稿候选识别：
- 目标是筛出“可直接写成文章”的人，而非单纯水群活跃者
- 必须至少满足以下价值判断中的 2 项：人设反差、清晰方法论、结果验证、高频痛点
- 仅在证据充分时入选，不要为了凑数
- 人设反差：年龄/背景/零基础/跨界等反差感强
- 清晰方法论：可复现的步骤/工作流/SOP
- 结果验证：上线、出单、过审、增长等明确结果
- 高频痛点：多数人会踩坑或常见问题的解法

【标签体系（固定 + 可补充）】
- 固定标签：新手逆袭 / 硬核实操 / 避坑指南 / 流量获取 / 变现闭环 / 认知输出
- tags 必须至少包含 1 个固定标签；允许额外补充 0-1 个自定义标签

【标题要求】
- 标题使用《》包裹，突出“人设/痛点/方法/结果”中的至少两个要素
- 标题要具体、有信息密度，不要空泛

【输出要求】
- 只输出 JSON，不要其他文字
- 所有文本内容保持原样，不要翻译或改写
- 时间格式：HH:MM:SS
- messageIndex 必须引用 [#数字] 的编号
- title 必须用《》包裹
- tags 必须是数组，至少 1 个固定标签，可额外补充 0-1 个自定义标签

【标签/情绪/风险规则】
【学员标签】
- 仅输出以下类别：stage/阶段、intent/需求、niche/方向、achievement/成果
- 至少 2 个、最多 4 个标签，必须具体可行动（避免“积极/乐于助人/不错”）
- 每个标签必须在 highlights 中给出证据原句（可摘录原话）

【教练/志愿者标签】
- 仅输出 expertise/擅长领域（2-4 个），必须非常具体且强业务关联
- 示例（仅供参考）：SEO推广、小程序开发、前端页面美化、需求挖掘、Creem 报错排查、Vercel 部署、支付接入、RAG/Agent、增长投放
- 每个标签必须在 highlights 中给出证据原句（可摘录原话）

【情绪/风险（可选）】
- sentiment：positive/neutral/negative；risk：churn_risk（流失风险）、escalation_needed（需升级处理）
- 情绪/风险按消息语气和上下文判断，谨慎输出
````

**用户提示词模板（buildAnalysisPrompt，来源：`src/lib/llm-chat-analyzer.ts`）**

````text
【分析任务】
请分析以下群聊记录，提取结构化数据。

【文件信息】
文件名：${meta.fileName}
日期：${meta.chatDate}

【项目背景】
生财有术深海圈：海外 AI 产品。高客单、强实战、结果导向。

【输出格式】
```json
{
  "qaPairs": [
    {
      "questionIndex": 问题消息序号,
      "questionAuthor": "提问者昵称",
      "questionContent": "问题内容（前 200 字）",
      "questionTime": "HH:MM:SS",
      "answerIndex": 回答消息序号（可选）,
      "answerAuthor": "回答者昵称",
      "answerContent": "回答内容（前 200 字）",
      "answerTime": "HH:MM:SS",
      "answerRole": "coach/volunteer/student",
      "waitMinutes": 等待分钟数,
      "isResolved": true/false,
      "resolutionSignal": "解决信号文本（如有）"
    }
  ],

  "goodNews": [
    {
      "messageIndex": 消息序号,
      "author": "作者昵称",
      "content": "完整内容",
      "time": "HH:MM:SS",
      "category": "revenue/milestone/platform/growth/other",
      "revenueAmount": 金额数值（可选）,
      "revenueCurrency": "CNY/USD",
      "revenueLevel": "小额(<100)/百元级/千元级/万元级",
      "milestones": ["首单", "破百"],
      "confidence": "high/medium/low"
    }
  ],

  "kocContributions": [
    {
      "messageIndex": 消息序号（必须来自 [#数字]）,
      "author": "候选人昵称",
      "title": "《标题》",
      "tags": ["固定标签1", "可选自定义标签"],
      "reason": "入选理由（分点描述）",
      "score": { "reproducibility": 0-3, "scarcity": 0-3, "validation": 0-3, "total": 0-9 }
    }
  ],

  "memberHighlights": [
    {
      "name": "成员昵称",
      "role": "coach/volunteer/student",
      "questionCount": 提问数,
      "answerCount": 回答数,
      "goodNewsCount": 好事数,
      "highlights": ["亮点1", "亮点2"],
      "tags": [
        { "category": "niche", "value": "SaaS出海", "confidence": "high" },
        { "category": "stage", "value": "MVP/上线", "confidence": "medium" },
        { "category": "intent", "value": "求反馈", "confidence": "medium" },
        { "category": "achievement", "value": "首单/上线/过审", "confidence": "high" },
        { "category": "expertise", "value": "SEO推广/Creem报错排查", "confidence": "high" },
        { "category": "sentiment", "value": "positive" },
        { "category": "risk", "value": "churn_risk" }
      ],
      "sentiment": "positive/neutral/negative",
      "riskFlags": ["churn_risk", "escalation_needed"]
    }
  ],

  "insights": "今日群聊洞察（100字内）"
}
```

【重要提示】
- 消息以 [#序号] 开头，序号即 messageIndex，必须引用该编号
- 如当天没有候选人，kocContributions 返回空数组，不要强行生成
- score 仅用于内部筛选与去重，仍需输出
- 学员与教练/志愿者标签规则不同，必须按角色输出

【群聊记录】
${rawContent}
````

> 实际调用中，系统提示词会被拼接到用户提示词前端（因为部分模型不支持 system role）。

### 4.2 旧版 LLM 抽取提示词（完整）
来源：`src/lib/community-llm-extractor.ts`

````text
【角色设定】你是一位拥有10年经验的高级社群运营总监。
【任务目标】从原始群聊记录中抽取结构化日报（精准版）。
【重要要求】
1. 这是一个长对话的分片，请仅分析当前分片内容，不要跨分片推测。
2. 重点提取：问题（Questions）、好事（Good News）、KOC、标杆学员。
3. **必须**提取字段：answeredBy (回答者), resolved (布尔值), waitMins (等待分钟数)。
   - 对于已回答/已解决的问题，answeredBy 不得为 null，填首个有效回答者昵称；若无法确定也要写 “未知回答者”。
   - 未回答的问题 answeredBy 可以为 null。
4. waitMins = 提问到首条有效回答之间的分钟数；若无回答则为 null。
【输出格式 - JSON Only】
请直接输出 valid JSON，包含字段：
- productLine, period, groupNumber, date
- messageCount, questionCount, avgResponseTime, resolutionRate, goodNewsCount
- starStudents: [{name,type,achievement,highlight,suggestion}]
- kocs: [{name,type,contribution,highlight,suggestion}]
- goodNews: [{content, author}]
- questions: [{content, author, answeredBy, reply, status, resolved, waitMins}]
- actionItems: [{category, description, relatedTo}]
- fullText: "本分片的业务洞察总结"
Meta: ${metaInfo}
Content:
${chunk}
````

---

## 5. 规则引擎口径（运营可解释）

### 5.1 预处理与基础统计
- **消息切分**：用 “昵称(wxid) MM-DD HH:MM:SS” 作为消息头。
- **多行合并**：非头部行会并入上一条消息。
- **昵称标准化**：去括号/分隔符/空白，小写化，用于成员匹配。
- **消息类型**：图片/链接/文件/合并转发/红包/表情会被标记并可能排除。
- **有效消息**：排除 emoji-only 与空内容。

### 5.2 提问识别
满足任意条件即判为问题（且长度 ≥ 5）：
- 包含问号（`?` / `？`）
- 含求助词：请问/求助/问下/问一下/咨询
- 含疑问词：怎么/如何/为什么/什么/哪里/哪个
- 含确认词：能不能/可不可以/是不是/有没有
- 含紧急词：求/跪求/急/在线等

### 5.3 回答与解决率判定
- **回答**：问题后的首条“非提问者”回复
- **解决信号（来自回答）**：解决了/搞定了/修复了/好了/OK 等
- **解决确认（来自提问者）**：谢谢/感谢/懂了/明白了 等
- **解决率**：已解决问题 / 问题总数

### 5.4 好事识别
- **最低字数**：消息长度 ≥ 10
- **关键词触发**：收入/里程碑/平台成就/增长/固定模板
- **分类优先级**：收入 > 里程碑 > 平台 > 增长 > 其他
- **置信度**：模板或明显收入/里程碑为高置信；增长类中等；其他为低
- **去重**：同作者 + 前 50 字摘要去重

### 5.5 KOC 贡献识别
满足任一即可：
- **高频回答**：回答 ≥ 2 个问题
- **分享型贡献**：长文本（≥ 50）且命中分享/工具/资源关键词

### 5.6 金额与里程碑推断
- **币种**：USD 会按固定汇率 7.2 转为人民币用于量级判断
- **量级**：`>=10000` 万元级，`>=1000` 千元级，`>=100` 百元级，`>0` 小额
- **里程碑**：首单/首次变现/破百/破千/YPP 通过

### 5.7 LLM 触发条件（规则引擎内部）
当出现以下情况才建议引入语义增强：
- 低置信度好事 ≥ 3 条
- 问题 ≥ 5 且解决率 < 30%

---

## 6. 旧版规则（兼容说明）

来源：`src/lib/community-raw-parser.ts`  
用途：旧日报解析与部分导入脚本。

### 6.1 关键词规则（旧）
- **提问**：`?` / `？` / 吗 / 嘛 / 么 / 如何 / 怎么 / 是否 / 哪里 / 哪 / 能否
- **好事**：出单/爆/喜报/榜一/榜单/成交/赚/变现/提现/首单/上岸/赢/冲/爆款/涨粉/好评
- **分享**：分享/教程/文档/指南/链接/prompt/提示词/方案/亲测/试了/好用/补充/笔记
- **解决**：解决/搞定/修复/好了/可以了/OK/没问题了/隐藏掉/处理了/已退款/已补/闭环/done/fixed/ok
- **感谢**：谢谢/感谢/辛苦了/赞/牛/可以了/好了/行了/搞定

### 6.2 旧规则局限
- 只做关键词匹配，容易误判反问/调侃。
- 无上下文理解，无法稳定识别回答关系。
- 好事分类与标签较粗。

---

## 7. 运营建议（提升识别质量）

- **统一模板**：推广 `#生财好事` / `#举手`，有助于好事集中提取。
- **闭环表达**：引导提问者说“已解决/感谢”，解决率更准。
- **显式指标**：用明确数字/币种表达成果（如“收入 200 USD”）。
- **减少转发噪声**：转发内容不要混入“自己成果”表述。

---

## 8. 附录：正则模式速查（新版）

来源：`src/lib/analysis/patterns.ts`

### 8.1 消息头与时间
- `MESSAGE_HEADER_PATTERN`：`^(.+?)\s*\(([^)]+)\)\s+(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})`
- `TIME_PATTERN`：`(\d{2}):(\d{2}):(\d{2})`

### 8.2 问答与感谢
- `QUESTION_PATTERNS`：
  - `/[?？]/`
  - `/请问|求助|问下|问一下|咨询/`
  - `/怎么|如何|为什么|什么|哪里|哪个/`
  - `/能不能|可不可以|是不是|有没有/`
  - `/求|跪求|急|在线等/`
- `RESOLUTION_PATTERNS`：
  - `/解决了?|搞定了?|修复了?|好了|可以了/`
  - `/OK了|ok了|Done|done|Fixed|fixed/`
  - `/没问题了|正常了|成功了/`
- `THANKS_PATTERNS`：
  - `/谢谢|感谢|多谢|辛苦了?/`
  - `/太棒了|牛|厉害|赞/`
  - `/明白了|懂了|知道了|学到了|受教了/`

### 8.3 好事与贡献
- `REVENUE_PATTERNS`：`/出单|成交|变现|提现|收入|收款|入账/`，`/赚了?|盈利|利润|营收/`，`/(\d+(?:\.\d+)?)\s*(美?[元刀]|USD|\$|rmb|RMB)/`
- `MILESTONE_PATTERNS`：`/首单|第一单|首次|第一次/`，`/破[百千万]|破\d+/`，`/上岸|起步|开张/`
- `PLATFORM_PATTERNS`：`/YPP|开通收益|过审|审核通过/`，`/上架|发布|上线/`，`/通过|批准|获批/`
- `GROWTH_PATTERNS`：`/涨粉|新增粉丝|粉丝.*[+＋]/`，`/爆款|爆了|火了/`，`/播放量|观看量|阅读量/`，`/订阅|关注/`
- `TEMPLATE_PATTERNS`：`/#生财好事|#举手|#喜报|#战报/`，`/\[喜报\]|\[战报\]|\[好消息\]/`
- `CONTRIBUTION_PATTERNS`：`/分享|教程|文档|指南|攻略/`，`/经验|心得|总结|复盘/`，`/prompt|提示词|模板|工具|资源/`，`/亲测|测试|试了|实测/`，`/推荐|安利|好用|神器/`

### 8.4 消息类型与金额
- `IMAGE_PATTERN`：`/\[图片\]|\[Image\]/i`
- `LINK_PATTERN`：`/https?:\/\/[^\s]+/`
- `FILE_PATTERN`：`/\[文件\]|\[File\]/i`
- `MERGED_PATTERN`：`/\[合并转发\]|--- 以下为合并转发 ---/`
- `EMOJI_ONLY_PATTERN`：`/^[\s\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Modifier_Base}\p{Emoji_Component}]+$/u`
- `RED_PACKET_PATTERN`：`/\[红包\]|收到红包|发出红包/`
- `STICKER_PATTERN`：`/\[表情\]|\[动画表情\]/`
- `AMOUNT_PATTERN`：`/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(美?[元刀]|USD|\$|rmb|RMB|CNY|人民币)?/g`

---

## 9. 源码锚点（维护入口）

建议运营或分析人员只参考，不直接修改：
- `src/lib/llm-chat-analyzer.ts`（提示词 + LLM 输出结构）
- `src/lib/analysis/patterns.ts`（规则正则）
- `src/lib/analysis/preprocessor.ts`（消息解析）
- `src/lib/analysis/rule-engine.ts`（问答/好事/KOC规则）
- `src/lib/community-raw-parser.ts`（旧规则）
