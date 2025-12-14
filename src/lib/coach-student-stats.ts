import fs from 'fs';
import path from 'path';
import { parseFilenameMeta, questionRegex } from './community-raw-parser';

type PeriodKey = '一期' | '二期' | '全部';


function normalizeName(name: string) {
  const noQuote = name.replace(/^"+|"+$/g, '');
  const stripped = noQuote.replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, ''); // remove bracketed parts
  const parts = stripped
    .split(/[-_—–·•‧·]/)
    .map((p) => p.replace(/\s+/g, '').trim())
    .filter(Boolean);
  if (parts.length === 0) return stripped.replace(/\s+/g, '').trim();
  // choose the longest segment as the core nickname
  return parts.sort((a, b) => b.length - a.length)[0];
}

function extractAlias(name: string) {
  const m = name.match(/（([^）]+)）/);
  if (m) return m[1].trim();
  const m2 = name.match(/\(([^)]+)\)/);
  if (m2) return m2[1].trim();
  return null;
}

function loadNameMap(csvPath: string, roleColIndex: number = 2): Map<string, string> {
  if (!fs.existsSync(csvPath)) return new Map();
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const map = new Map<string, string>();
  
  raw.split(/\r?\n/)
    .slice(1) // skip header
    .forEach((line) => {
        const parts = line.split(',');
        const name = parts[1]?.trim();
        if (!name) return;
        
        // Extract Role
        const role = parts[roleColIndex]?.trim();
        
        if (name) map.set(name, role || '');
        
        // Also map normalized name for loose matching
        const norm = normalizeName(name);
        if (norm && norm !== name) {
             if (!map.has(norm)) map.set(norm, role || '');
        }

        // Map alias if exists
        const alias = extractAlias(name);
        if (alias) {
            map.set(alias, role || '');
            const startStr = normalizeName(alias);
            if(startStr && !map.has(startStr)) map.set(startStr, role || '');
        }
    });
    
  return map;
}

const COACH_CSV = path.join(process.cwd(), 'private/import/AI产品出海/AI 产品出海 -教练&志愿者名单.csv');
const STUDENT_CSV = path.join(process.cwd(), 'private/import/AI产品出海/AI 产品出海 -学员名单.csv');

// Load Maps
const coachMap = loadNameMap(COACH_CSV, 2); 
const studentMap = loadNameMap(STUDENT_CSV, -1);

function buildNormalizedSet(map: Map<string, string>) {
  const set = new Set<string>();
  for (const name of map.keys()) {
      set.add(name);
      set.add(normalizeName(name));
  }
  return set;
}

const coachSet = buildNormalizedSet(coachMap);
const studentSet = buildNormalizedSet(studentMap);

const BLOCKED = new Set(['桑桑']); // 可扩展黑名单

function speakerFromLine(line: string): string | null {
  // Chat format: 姓名(wxid_xxx) time ...
  const idx = line.indexOf('(');
  if (idx <= 0) return null;
  const name = line.slice(0, idx).trim();
  if (!name) return null;
  return name;
}

function cleanSpeaker(name: string) {
  return name.replace(/^"+|"+$/g, '').trim();
}

function shouldCount(name: string) {
  if (!name) return false;
  if (BLOCKED.has(name)) return false;
  return true;
}

export type RoleStats = {
  name: string;
  count: number;
  tags?: string[];
};

export type CoachStudentStats = {
  period: PeriodKey;
  coachTotal: number;
  coachAnswerTotal: number;
  coachActive: number;
  coachTop: RoleStats[]; // by message volume
  coachAnswerTop: RoleStats[]; // by answered questions
  studentTotal: number;
  studentActive: number;
  studentTop: RoleStats[];
};

const CACHE: Record<PeriodKey, CoachStudentStats> = {} as any;

export function getCoachStudentStats(period: PeriodKey = '全部'): CoachStudentStats {
  if (CACHE[period]) return CACHE[period];

  const base = path.join(process.cwd(), 'private/import');
  const allFiles = walkTxt(base);

  const coachCounts = new Map<string, number>();
  const coachAnswerCounts = new Map<string, number>();
  const studentCounts = new Map<string, number>();

  for (const file of allFiles) {
    const meta = parseFilenameMeta(path.basename(file));
    if (!meta.productLine || !meta.productLine.includes('AI产品出海')) continue;
    const p = meta.period === '1' ? '一期' : meta.period === '2' ? '二期' : undefined;
    if (period !== '全部' && p !== period) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    const speakerCache: (string | null)[] = [];
    for (const line of lines) {
      const speakerRaw = speakerFromLine(line);
      const speaker = speakerRaw ? cleanSpeaker(speakerRaw) : null;
      speakerCache.push(speaker);
      if (!speaker || !shouldCount(speaker)) continue;

      const normalized = normalizeName(speaker);
      // Check Coach
      if (coachSet.has(speaker) || coachSet.has(normalized)) {
        coachCounts.set(speaker, (coachCounts.get(speaker) || 0) + 1);
      }
      // Check Student
      if (studentSet.has(speaker) || studentSet.has(normalized)) {
        studentCounts.set(speaker, (studentCounts.get(speaker) || 0) + 1);
      }
    }

    // 粗粒度答疑统计：找到含疑问关键词的行，第一条不同说话人的回复视为答疑
    lines.forEach((line, idx) => {
      const asker = speakerCache[idx];
       // Fixed: Use strict regex to avoid high FP
      if (!asker || !questionRegex.test(line)) return;

      for (let j = idx + 1; j < lines.length; j++) {
        const responder = speakerCache[j];
        if (!responder || responder === asker) continue;
        if (!shouldCount(responder)) break;
        const responderNorm = normalizeName(responder);
        if (coachSet.has(responder) || coachSet.has(responderNorm)) {
          coachAnswerCounts.set(responder, (coachAnswerCounts.get(responder) || 0) + 1);
        }
        break; // 只记第一条回复
      }
    });
  }

  // Helper to get tags
  const getTags = (name: string, isCoach: boolean) => {
      const tags: string[] = [];
      const norm = normalizeName(name);
      
      if (isCoach) {
          // Priority 1: Exact Match
          let role = coachMap.get(name);
          // Priority 2: Norm Match
          if (!role) role = coachMap.get(norm);
          
          if (role) tags.push(role);
      } else {
          // For students, maybe add '学员'? Or just leave empty to reduce noise
          // User request implies "Tags in Coach/Volunteer Q&A". 
          // Volunteers ARE in the Coach list. 
      }
      return tags;
  };

  const coachTop = Array.from(coachCounts.entries())
    .map(([name, count]) => ({ name, count, tags: getTags(name, true) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
    
  const coachAnswerTop = Array.from(coachAnswerCounts.entries())
    .map(([name, count]) => ({ name, count, tags: getTags(name, true) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
    
  const studentTop = Array.from(studentCounts.entries())
    .map(([name, count]) => ({ name, count, tags: getTags(name, false) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const result: CoachStudentStats = {
    period,
    coachTotal: Array.from(coachCounts.values()).reduce((a, b) => a + b, 0),
    coachAnswerTotal: Array.from(coachAnswerCounts.values()).reduce((a, b) => a + b, 0),
    coachActive: coachCounts.size,
    coachTop,
    coachAnswerTop,
    studentTotal: Array.from(studentCounts.values()).reduce((a, b) => a + b, 0),
    studentActive: studentCounts.size,
    studentTop,
  };

  CACHE[period] = result;
  return result;
}

function walkTxt(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const res: string[] = [];
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      res.push(...walkTxt(full));
    } else if (entry.endsWith('.txt')) {
      res.push(full);
    }
  }
  return res;
}
