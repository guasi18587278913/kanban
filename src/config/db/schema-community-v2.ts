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

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_good_news_source').on(table.sourceLogId),
    index('idx_good_news_date').on(table.eventDate),
    index('idx_good_news_member').on(table.memberId),
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

    // 内容
    kocName: text('koc_name').notNull(),
    contribution: text('contribution').notNull(),      // 贡献内容
    contributionType: text('contribution_type'),       // share/help/resource/atmosphere
    helpedCount: integer('helped_count'),              // 帮助人数

    // 时间
    recordDate: timestamp('record_date').notNull(),

    // 审核
    isVerified: boolean('is_verified').default(false),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_koc_record_source').on(table.sourceLogId),
    index('idx_koc_record_date').on(table.recordDate),
    index('idx_koc_record_member').on(table.memberId),
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

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_qa_record_source').on(table.sourceLogId),
    index('idx_qa_record_date').on(table.questionTime),
    index('idx_qa_record_asker').on(table.askerId),
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

    // 内容
    studentName: text('student_name').notNull(),
    type: text('type').notNull(),                      // 里程碑/变现
    achievement: text('achievement').notNull(),        // 成就描述
    revenueLevel: text('revenue_level'),               // 变现量级

    // 时间
    recordDate: timestamp('record_date').notNull(),

    // 审核
    isVerified: boolean('is_verified').default(false),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_star_student_source').on(table.sourceLogId),
    index('idx_star_student_date').on(table.recordDate),
    index('idx_star_student_member').on(table.memberId),
  ]
);
