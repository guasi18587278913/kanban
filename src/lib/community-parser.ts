/**
 * Community Daily Report Parser
 * Parses the standard text format into structured data
 */

export interface ParsedReport {
  productLine: string;
  period?: string;
  groupNumber: string;
  reportDate: Date;
  
  // Metrics
  messageCount: number;
  activeUserCount?: number;
  questionCount: number;
  questions?: {
    content: string;
    author?: string;
    reply?: string;
    answeredBy?: string;
    status?: string; // resolved | unresolved
    waitMins?: number;
    resolved?: boolean;
  }[];
  avgResponseTime?: number; // minutes
  resolutionRate?: number; // percentage 0-100
  goodNewsCount: number;

  goodNews?: {
      content: string;
      author?: string;
  }[];

  // Lists
  starStudents: {
    name: string;
    type: string;
    achievement: string;
    highlight?: string;
    suggestion?: string;
  }[];

  kocs: {
    name: string;
    type?: string;
    contribution: string;
    highlight?: string;
    suggestion?: string;
  }[];

  actionItems?: {
    category: string; // unresolved, risk, todo, followup
    description: string;
    relatedTo?: string; // question or user
  }[];

  fullText: string;

  // New Rich Insight Fields
  activitySummary?: {
    total: number;
    tags: string[];
    narrative?: string;
    timeline: { time: string; event: string }[];
  };
  questionAnalysis?: {
    validCount: number;
    categories?: { name: string; percentage: string; examples: string[] }[];
    items: { q: string; a: string; asker: string; answerer: string; time: string }[];
  };
  unresolvedQuestions?: {
    asker: string;
    question: string;
    time: string;
    waitDuration: string;
  }[];
  responseSpeed?: {
    avg: string;
    example: string;
  };
  resolution?: {
    rate: string;
    details: string[];
  };
  // Override simple list with rich structure if available
  richActionItems?: {
    type: string;
    title: string;
    bg: string;
    action: string;
  }[];
}

export function parseCommunityReport(filename: string, text: string): ParsedReport {
  // 1. Extract Metadata
  const filenameRegex = /深海圈丨(.+?)(\d+期)?(\d+群)?_(\d{4}-\d{2}-\d{2})/;
  const match = filename.match(filenameRegex);
  
  let productLine = "Unknown";
  let period = undefined;
  let groupNumber = "1";
  let dateStr = new Date().toISOString().split('T')[0];

  if (match) {
    productLine = match[1].replace(/(\d+期)?(\d+群)?$/, '').trim();
    period = match[2];
    groupNumber = match[3] ? match[3].replace('群', '') : "1";
    dateStr = match[4];
  } else {
    // Fallback: Try B站/YouTube naming
    // e.g. "深海圈丨B站好物交流_2025-12-03.txt"
    const simpleParts = filename.split('_');
    if (simpleParts.length >= 2) {
        const datePart = simpleParts[simpleParts.length - 1].replace('.txt', '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            dateStr = datePart;
        }
        productLine = simpleParts[0].replace('深海圈丨', '');
        // Extract group number if present in productLine (e.g. YouTube AI视频 1群)
        const groupMatch = productLine.match(/(\d+)群$/);
        if (groupMatch) {
            groupNumber = groupMatch[1];
            productLine = productLine.replace(/\s*\d+群$/, '');
        }
    }
  }

  // 2. Parse Metrics
  let questionCount = 0;
  let avgResponseTime = 0;
  let resolutionRate = 0;
  let goodNewsCount = 0;

  // 1. Message Count
  // Supports: "总消息数：** 43", "**消息总量：** **约 320+ 条**"
  const messageMatch = text.match(/(?:总消息数|消息总量)[：:][\s*约共]*(\d+)/);
  const messageCount = messageMatch ? parseInt(messageMatch[1]) : 0;

  // 2. Question Count
  // Strategy 1: Look for label + colon pattern (e.g. "**识别提问：** 共 **3** 个")
  const questionRegex1 = /(?:识别提问|有效提问|提问数量)[：:][\s*约共]*(\d+)/;
  // Strategy 2: Look for header pattern (e.g. "#### 2. 提问数量\n*   **共 3 个")
  const questionRegex2 = /提问数量[\s\S]*?[*•]\s*[^\d\n]*(\d+)\s*(?:个|条)/;

  const questionMatch1 = text.match(questionRegex1);
  if (questionMatch1) {
    questionCount = parseInt(questionMatch1[1]);
  } else {
    const questionMatch2 = text.match(questionRegex2);
    if (questionMatch2) questionCount = parseInt(questionMatch2[1]);
  }

  // *   **平均响应时间：** **约 2 分钟**
  const timeMatch = text.match(/平均响应时间：\*\*.*?(\d+)/);
  if (timeMatch) avgResponseTime = parseInt(timeMatch[1]);

  // Resolution Rate logic: Count ✅ cases under "问题的解决率" section
  // *   **案例 A：...（✅ 已解决）**
  const resolutionSectionMatch = text.match(/#### \d+\.\s*问题的解决率[\s\S]*?(?=####|$)/);
  if (resolutionSectionMatch) {
      const sectionText = resolutionSectionMatch[0];
      // Check for explicit rate first if available (future proof)
      const rateMatch = sectionText.match(/解决率[：:]\s*(\d+)%/);
      if (rateMatch) {
          resolutionRate = parseInt(rateMatch[1]);
      } else {
          // Calculate manually
          const solvedCount = (sectionText.match(/✅/g) || []).length;
          const caseCount = (sectionText.match(/案例 [A-Z]/g) || []).length;
          if (caseCount > 0) {
              resolutionRate = Math.round((solvedCount / caseCount) * 100);
          }
      }
  }

  // *   **识别数量：** 2 件。 (Under 好事数量 section)
  // Need to be careful not to match other "识别数量" if any.
  // Use section lookahead
  const goodNewsSectionMatch = text.match(/#### \d+\.\s*好事数量[\s\S]*?(?=####|$)/);
  if (goodNewsSectionMatch) {
      const gnMatch = goodNewsSectionMatch[0].match(/识别数量：\*\*\s*(\d+)/);
      if (gnMatch) goodNewsCount = parseInt(gnMatch[1]);
  }

  // 3. Extract Star Students
  const starStudents: ParsedReport['starStudents'] = [];
  // Section: #### 6. 标杆学员识别
  const studentSectionMatch = text.match(/#### \d+\.\s*标杆学员识别[\s\S]*?(?=####|$)/);
  if (studentSectionMatch) {
      const lines = studentSectionMatch[0].split('\n');
      let currentStudent: any = null;
      
      for (const line of lines) {
          // *   **🏅 标杆学员 A：`感恩学习相信-小陶`（变现标杆）**
          const nameMatch = line.match(/标杆学员.*?：`?(.+?)`?（(.+?)）/);
          if (nameMatch) {
              if (currentStudent) starStudents.push(currentStudent);
              currentStudent = {
                  name: nameMatch[1],
                  type: nameMatch[2],
                  achievement: '',
                  highlight: '', // logic to extract quote?
                  suggestion: ''
              };
          }
          // Capture achievement/content simply?
          // For MVP, maybe just leave details empty or try to capture Highlighs text block
      }
      if (currentStudent) starStudents.push(currentStudent);
  }

  // 4. Extract KOCs
  const kocs: ParsedReport['kocs'] = [];
  // Section: #### 7. 分享官识别
  const kocSectionMatch = text.match(/#### \d+\.\s*分享官识别[\s\S]*?(?=####|$)/);
  if (kocSectionMatch) {
       const lines = kocSectionMatch[0].split('\n');
      let currentKoc: any = null;
      
      for (const line of lines) {
          // *   **🌟 潜力 KOC：`Ash焚芯-临沂`**
          const nameMatch = line.match(/KOC：`?(.+?)`?(\*\*|$)/);
          if (nameMatch) {
              if (currentKoc) kocs.push(currentKoc);
              currentKoc = {
                  name: nameMatch[1],
                  contribution: '参见完整报告', // Difficult to parse multiline nicely without complex logic
                  highlight: '',
                  suggestion: ''
              };
          }
      }
      if (currentKoc) kocs.push(currentKoc);
  }

  return {
    productLine,
    period,
    groupNumber,
    reportDate: new Date(dateStr),
    messageCount,
    questionCount,
    avgResponseTime,
    resolutionRate,
    goodNewsCount,
    starStudents,
    kocs,
    fullText: text
  };
}
