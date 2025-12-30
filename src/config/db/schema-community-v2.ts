/**
 * 社群数据架构 V2
 *
 * 设计原则：
 * 1. 原始数据层：存储完整的群聊记录和成员信息
 * 2. 分析数据层：从原始数据提取的各类分析结果
 * 3. 可追溯：所有分析数据都能追溯到原始记录
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================
// 原始数据层 (Source Layer)
// ============================================

/**
 * 原始群聊记录表
 * 存储每日上传的完整群聊内容
 */
export const rawChatLog = pgTable(
  'raw_chat_log',
  {
    id: text('id').primaryKey(),

    // 群组标识
    productLine: text('product_line').notNull(),      // AI产品出海
    period: text('period').notNull(),                  // 1期/2期
    groupNumber: integer('group_number').notNull(),    // 1/2 (群号)

    // 时间
    chatDate: timestamp('chat_date').notNull(),        // 聊天日期

    // 文件信息
    fileName: text('file_name').notNull(),             // 原始文件名
    fileHash: text('file_hash'),                       // MD5 哈希 (防重复)

    // 原始内容
    rawContent: text('raw_content').notNull(),         // 完整聊天内容

    // 预统计 (导入时计算)
    messageCount: integer('message_count').default(0), // 消息数

    // 处理状态
    status: text('status').notNull().default('pending'), // pending/processed/failed
    processedAt: timestamp('processed_at'),            // 处理时间
    statusReason: text('status_reason'),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // 唯一索引：同一天同一群只有一条记录
    uniqueIndex('idx_raw_chat_unique').on(
      table.productLine,
      table.period,
      table.groupNumber,
      table.chatDate
    ),
    // 按日期查询
    index('idx_raw_chat_date').on(table.chatDate),
    // 按状态查询待处理
    index('idx_raw_chat_status').on(table.status),
  ]
);

/**
 * 成员表
 * 存储教练、志愿者、学员信息
 */
export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),

    // 唯一标识
    planetId: text('planet_id'),                       // 星球编号 (可选)
    nickname: text('nickname').notNull(),              // 微信昵称
    nicknameNormalized: text('nickname_normalized'),   // 标准化昵称 (用于匹配)
    wechatId: text('wechat_id'),                       // 微信号 (可选)

    // ============================================
    // 类型1: 身份与权益标签
    // ============================================
    role: text('role').notNull(),                      // coach/volunteer/student
    productLine: text('product_line').notNull(),       // 产品线 (AI产品出海/YouTube AI视频/B站好物)
    period: text('period'),                            // 入学期数
    circleIdentity: text('circle_identity'),           // 圈层身份 (老板/自由职业/在职副业/全职创业)
    location: text('location'),                        // 圈友地址
    activityLevel: text('activity_level'),             // 活跃状态 (高活/中活/低活/沉默)

    // 时间
    joinDate: timestamp('join_date'),                  // 加入时间
    expireDate: timestamp('expire_date'),              // 到期时间

    // 状态
    status: text('status').notNull().default('active'), // active/expired

    // ============================================
    // 类型2: 学习进度与状态标签
    // ============================================
    // AI产品出海 学习进度
    progressAiProduct: text('progress_ai_product'),    // 未知/选题/开发/上架/验证期/增长期
    // YouTube AI视频 学习进度
    progressYoutube: text('progress_youtube'),         // 未知/选题/试水/持续更/有收益
    // B站好物 学习进度
    progressBilibili: text('progress_bilibili'),       // 未知/选题/试水/持续更/有收益

    // ============================================
    // 类型3: 成果与价值标签
    // ============================================
    // 关键里程碑 (JSON数组: ["首次变现", "首单", "破百", "破千"])
    milestones: text('milestones'),
    // 变现量级
    revenueLevel: text('revenue_level'),               // 未变现/小额(<100)/百元级/千元级/万元级
    // 细分赛道
    niche: text('niche'),                              // 如: AI工具/效率提升/内容创作

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // 按星球编号查询
    index('idx_member_planet_id').on(table.planetId),
    // 按角色查询
    index('idx_member_role').on(table.role, table.productLine),
    // 按昵称匹配
    index('idx_member_nickname').on(table.nicknameNormalized),
    // 按活跃度查询
    index('idx_member_activity').on(table.activityLevel),
    // 按变现量级查询
    index('idx_member_revenue').on(table.revenueLevel),
  ]
);

/**
 * 成员别名表
 * 记录历史昵称/弱指纹映射
 */
export const memberAlias = pgTable(
  'member_alias',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id').notNull(),
    alias: text('alias').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_member_alias_member').on(table.memberId),
    uniqueIndex('idx_member_alias_unique').on(table.alias),
  ]
);

// ============================================
// 分析数据层 (Derived Layer)
// ============================================

/**
 * 每日统计表
 * 每个群每天的统计数据
 */
export const dailyStats = pgTable(
  'daily_stats',
  {
    id: text('id').primaryKey(),

    // 群组信息
    productLine: text('product_line').notNull(),
    period: text('period').notNull(),
    groupNumber: integer('group_number').notNull(),
    statsDate: timestamp('stats_date').notNull(),

    // 统计数据
    messageCount: integer('message_count').notNull().default(0),
    activeUsers: integer('active_users').notNull().default(0),
    questionCount: integer('question_count').notNull().default(0),
    resolvedCount: integer('resolved_count').notNull().default(0),
    resolutionRate: integer('resolution_rate'),        // 百分比 0-100
    avgResponseMinutes: integer('avg_response_minutes'),

    // 好事/KOC 计数
    goodNewsCount: integer('good_news_count').notNull().default(0),
    kocCount: integer('koc_count').notNull().default(0),

    // 时段分布 (JSON)
    hourlyDistribution: text('hourly_distribution'),

    // 运营清单 (JSON)
    actionList: text('action_list'),
    actionListVerified: text('action_list_verified'),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // 唯一索引
    uniqueIndex('idx_daily_stats_unique').on(
      table.productLine,
      table.period,
      table.groupNumber,
      table.statsDate
    ),
    // 按日期范围查询
    index('idx_daily_stats_date').on(table.statsDate),
    // 按产品线查询
    index('idx_daily_stats_product').on(table.productLine, table.period),
  ]
);

/**
 * 好事记录表
 */
export const goodNews = pgTable(
  'good_news',
  {
    id: text('id').primaryKey(),

    // 关联
    sourceLogId: text('source_log_id').notNull(),      // 来源记录ID
    memberId: text('member_id'),                       // 成员ID

    // 维度
    productLine: text('product_line'),                 // 产品线
    period: text('period'),                            // 期数
    groupNumber: integer('group_number'),              // 群号

    // 内容
    authorName: text('author_name').notNull(),         // 作者昵称
    content: text('content').notNull(),                // 好事内容

    // 分类
    category: text('category'),                        // revenue/milestone/platform/growth/other
    revenueLevel: text('revenue_level'),               // 变现量级
    milestones: text('milestones'),                    // 里程碑 (JSON)

    // 时间
    eventDate: timestamp('event_date').notNull(),      // 发生日期

    // 置信度和审核
    confidence: text('confidence'),                    // high/medium/low
    isVerified: boolean('is_verified').default(false),
    status: text('status').default('active'),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_good_news_source').on(table.sourceLogId),
    index('idx_good_news_date').on(table.eventDate),
    index('idx_good_news_member').on(table.memberId),
    index('idx_good_news_product_period').on(table.productLine, table.period),
  ]
);

/**
 * KOC 贡献记录表
 */
export const kocRecord = pgTable(
  'koc_record',
  {
    id: text('id').primaryKey(),

    // 关联
    sourceLogId: text('source_log_id').notNull(),      // 来源记录ID
    memberId: text('member_id'),                       // 成员ID

    // 维度
    productLine: text('product_line'),
    period: text('period'),
    groupNumber: integer('group_number'),

    // 内容
    kocName: text('koc_name').notNull(),
    contribution: text('contribution').notNull(),      // 贡献内容
    contributionType: text('contribution_type'),       // share/help/resource/atmosphere
    model: text('model'),
    coreAchievement: text('core_achievement'),
    highlightQuote: text('highlight_quote'),
    suggestedTitle: text('suggested_title'),
    tags: text('tags').array(),                       // 选题标签
    reason: text('reason'),
    scoreReproducibility: integer('score_reproducibility'),
    scoreScarcity: integer('score_scarcity'),
    scoreValidation: integer('score_validation'),
    scoreTotal: integer('score_total'),
    helpedCount: integer('helped_count'),              // 帮助人数

    // 时间
    recordDate: timestamp('record_date').notNull(),

    // 审核
    isVerified: boolean('is_verified').default(false),
    confidence: text('confidence'),
    status: text('status').default('active'),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_koc_record_source').on(table.sourceLogId),
    index('idx_koc_record_date').on(table.recordDate),
    index('idx_koc_record_member').on(table.memberId),
    index('idx_koc_product_period').on(table.productLine, table.period),
  ]
);

/**
 * 问答记录表
 */
export const qaRecord = pgTable(
  'qa_record',
  {
    id: text('id').primaryKey(),

    // 关联
    sourceLogId: text('source_log_id').notNull(),      // 来源记录ID

    // 维度
    productLine: text('product_line'),
    period: text('period'),
    groupNumber: integer('group_number'),

    // 提问者
    askerId: text('asker_id'),
    askerName: text('asker_name').notNull(),
    questionContent: text('question_content').notNull(),
    questionTime: timestamp('question_time').notNull(),

    // 回答者
    answererId: text('answerer_id'),
    answererName: text('answerer_name'),
    answererRole: text('answerer_role'),               // coach/volunteer
    answerContent: text('answer_content'),
    answerTime: timestamp('answer_time'),

    // 统计
    responseMinutes: integer('response_minutes'),      // 响应时间(分钟)
    isResolved: boolean('is_resolved').default(false),
    confidence: text('confidence'),
    isVerified: boolean('is_verified').default(false),
    status: text('status').default('active'),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_qa_record_source').on(table.sourceLogId),
    index('idx_qa_record_date').on(table.questionTime),
    index('idx_qa_record_asker').on(table.askerId),
    index('idx_qa_product_period').on(table.productLine, table.period),
  ]
);

/**
 * 标杆学员记录表
 */
export const starStudent = pgTable(
  'star_student',
  {
    id: text('id').primaryKey(),

    // 关联
    sourceLogId: text('source_log_id').notNull(),      // 来源记录ID
    memberId: text('member_id'),                       // 成员ID

    // 维度
    productLine: text('product_line'),
    period: text('period'),
    groupNumber: integer('group_number'),

    // 内容
    studentName: text('student_name').notNull(),
    type: text('type').notNull(),                      // 里程碑/变现
    achievement: text('achievement').notNull(),        // 成就描述
    revenueLevel: text('revenue_level'),               // 变现量级

    // 时间
    recordDate: timestamp('record_date').notNull(),

    // 审核
    isVerified: boolean('is_verified').default(false),
    confidence: text('confidence'),
    status: text('status').default('active'),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_star_student_source').on(table.sourceLogId),
    index('idx_star_student_date').on(table.recordDate),
    index('idx_star_student_member').on(table.memberId),
    index('idx_star_product_period').on(table.productLine, table.period),
  ]
);

// ============================================
// CRM 数据层 (Personal Dashboard)
// ============================================

/**
 * 成员消息记录表
 * 存储每个成员的所有消息及其上下文
 * 用于个人 CRM 看板展示
 */
export const memberMessage = pgTable(
  'member_message',
  {
    id: text('id').primaryKey(),

    // 关联
    memberId: text('member_id'),                       // 成员ID (如匹配到)
    sourceLogId: text('source_log_id').notNull(),      // 来源记录ID

    // 消息信息
    authorName: text('author_name').notNull(),         // 发言者昵称
    authorNormalized: text('author_normalized'),       // 标准化昵称
    messageContent: text('message_content').notNull(), // 消息内容
    messageTime: timestamp('message_time').notNull(),  // 发言时间
    messageIndex: integer('message_index').notNull(),  // 在当日聊天中的序号

    // 消息分类
    messageType: text('message_type').notNull(),       // question/answer/good_news/share/encouragement/normal

    // 关联信息
    relatedQaId: text('related_qa_id'),                // 关联的问答ID (如果是问题或回答)
    relatedGoodNewsId: text('related_good_news_id'),   // 关联的好事ID
    relatedKocId: text('related_koc_id'),              // 关联的KOC贡献ID

    // 上下文 (JSON 数组，存储前后各 2 条消息)
    contextBefore: text('context_before'),             // [{author, content, time}]
    contextAfter: text('context_after'),               // [{author, content, time}]

    // 元数据
    productLine: text('product_line').notNull(),
    period: text('period').notNull(),
    groupNumber: integer('group_number').notNull(),

    // 状态
    status: text('status').default('active'),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // 按成员查询 (CRM 看板主查询)
    index('idx_member_message_member').on(table.memberId),
    // 按成员+时间查询 (时间线展示)
    index('idx_member_message_timeline').on(table.memberId, table.messageTime),
    // 按来源查询 (用于重新处理)
    index('idx_member_message_source').on(table.sourceLogId),
    // 按消息类型查询 (筛选特定类型消息)
    index('idx_member_message_type').on(table.memberId, table.messageType),
    // 按昵称查询 (未匹配成员的查询)
    index('idx_member_message_author').on(table.authorNormalized),
  ]
);

/**
 * 成员统计汇总表
 * 缓存每个成员的统计数据，避免每次查询都重新计算
 */
export const memberStats = pgTable(
  'member_stats',
  {
    id: text('id').primaryKey(),

    // 成员信息
    memberId: text('member_id').notNull().unique(),    // 成员ID
    productLine: text('product_line').notNull(),
    period: text('period'),

    // 消息统计
    totalMessages: integer('total_messages').notNull().default(0),
    questionCount: integer('question_count').notNull().default(0),
    answerCount: integer('answer_count').notNull().default(0),
    goodNewsCount: integer('good_news_count').notNull().default(0),
    shareCount: integer('share_count').notNull().default(0),
    encouragementCount: integer('encouragement_count').notNull().default(0),

    // 教练/志愿者专属统计
    avgResponseMinutes: integer('avg_response_minutes'), // 平均响应时间
    resolvedCount: integer('resolved_count'),            // 解决问题数
    helpedStudents: integer('helped_students'),          // 帮助学员数

    // 活跃度
    activeDays: integer('active_days').notNull().default(0),
    lastActiveDate: timestamp('last_active_date'),
    firstActiveDate: timestamp('first_active_date'),

    // KOC 指标
    kocContributions: integer('koc_contributions').notNull().default(0),
    totalHelpedCount: integer('total_helped_count').notNull().default(0),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // 按产品线查询排行榜
    index('idx_member_stats_product').on(table.productLine, table.period),
    // 按消息数排序
    index('idx_member_stats_messages').on(table.totalMessages),
    // 按回答数排序 (教练排行)
    index('idx_member_stats_answers').on(table.answerCount),
    // 按活跃天数排序
    index('idx_member_stats_active').on(table.activeDays),
  ]
);

/**
 * 成员标签表
 * 存储成员的各类标签，支持动态扩展
 */
export const memberTag = pgTable(
  'member_tag',
  {
    id: text('id').primaryKey(),

    memberId: text('member_id').notNull(),             // 成员ID

    // 标签信息
    tagCategory: text('tag_category').notNull(),       // identity/progress/achievement/behavior
    tagName: text('tag_name').notNull(),               // 标签名称
    tagValue: text('tag_value'),                       // 标签值（可选）

    // 来源
    source: text('source').notNull(),                  // manual/auto/llm
    sourceLogId: text('source_log_id'),                // 自动生成时的来源记录

    // 置信度 (自动标签)
    confidence: text('confidence'),                    // high/medium/low

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // 按成员查询所有标签
    index('idx_member_tag_member').on(table.memberId),
    // 按类别查询
    index('idx_member_tag_category').on(table.memberId, table.tagCategory),
    // 按标签名查询 (查找所有拥有某标签的成员)
    index('idx_member_tag_name').on(table.tagName),
    // 唯一索引：同一成员同一标签只能有一个
    uniqueIndex('idx_member_tag_unique').on(table.memberId, table.tagCategory, table.tagName),
  ]
);
