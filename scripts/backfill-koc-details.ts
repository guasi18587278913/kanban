/**
 * Backfill structured KOC fields from legacy contribution text.
 *
 * Usage:
 *   npx tsx scripts/backfill-koc-details.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db } from '@/core/db';
import { kocRecord } from '@/config/db/schema-community-v2';
import { eq } from 'drizzle-orm';

type ParsedScore = {
  reproducibility?: number;
  scarcity?: number;
  validation?: number;
  total?: number;
};

type ParsedDetail = {
  model?: string;
  coreAchievement?: string;
  highlightQuote?: string;
  suggestedTitle?: string;
  tags?: string[];
  reason?: string;
  score?: ParsedScore;
};

function parseScore(line: string): ParsedScore | undefined {
  const extract = (regex: RegExp) => {
    const match = line.match(regex);
    if (!match) return undefined;
    const value = Number(match[1]);
    return Number.isNaN(value) ? undefined : value;
  };

  const reproducibility = extract(/复现\s*(\d+)/);
  const scarcity = extract(/稀缺\s*(\d+)/);
  const validation = extract(/验证\s*(\d+)/);
  const total = extract(/总分\s*(\d+)/);

  if (
    reproducibility == null &&
    scarcity == null &&
    validation == null &&
    total == null
  ) {
    return undefined;
  }

  return { reproducibility, scarcity, validation, total };
}

function parseContribution(raw: string): ParsedDetail {
  const detail: ParsedDetail = {};
  if (!raw) return detail;

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/[:：]/);
    if (parts.length < 2) continue;
    const key = parts.shift()?.trim();
    const value = parts.join(':').trim();
    if (!key || !value) continue;

    if (key === '模型') detail.model = value;
    else if (key === '核心事迹') detail.coreAchievement = value;
    else if (key === '高光语录') detail.highlightQuote = value;
    else if (key === '推荐选题') detail.suggestedTitle = value;
    else if (key === '标题') detail.suggestedTitle = value;
    else if (key === '标签') {
      const tags = value
        .split(/[，,\/、|｜]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (tags.length > 0) detail.tags = tags;
    }
    else if (key === '入选理由') detail.reason = value;
    else if (key === '评分') detail.score = parseScore(value);
  }

  return detail;
}

function isEmpty(value: unknown) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return value === null || value === undefined || value === '';
}

async function main() {
  const dbInstance = db();
  const records = await dbInstance
    .select({
      id: kocRecord.id,
      contribution: kocRecord.contribution,
      contributionType: kocRecord.contributionType,
      model: kocRecord.model,
      coreAchievement: kocRecord.coreAchievement,
      highlightQuote: kocRecord.highlightQuote,
      suggestedTitle: kocRecord.suggestedTitle,
      tags: kocRecord.tags,
      reason: kocRecord.reason,
      scoreReproducibility: kocRecord.scoreReproducibility,
      scoreScarcity: kocRecord.scoreScarcity,
      scoreValidation: kocRecord.scoreValidation,
      scoreTotal: kocRecord.scoreTotal,
    })
    .from(kocRecord);

  let updated = 0;
  let skipped = 0;

  for (const record of records) {
    const parsed = parseContribution(record.contribution || '');
    const update: Record<string, unknown> = {};

    if (isEmpty(record.model)) {
      const fallbackModel = parsed.model || record.contributionType || null;
      if (fallbackModel) update.model = fallbackModel;
    }
    if (isEmpty(record.coreAchievement) && parsed.coreAchievement) {
      update.coreAchievement = parsed.coreAchievement;
    }
    if (isEmpty(record.highlightQuote) && parsed.highlightQuote) {
      update.highlightQuote = parsed.highlightQuote;
    }
    if (isEmpty(record.suggestedTitle) && parsed.suggestedTitle) {
      update.suggestedTitle = parsed.suggestedTitle;
    }
    if (isEmpty(record.tags) && parsed.tags && parsed.tags.length > 0) {
      update.tags = parsed.tags;
    }
    if (isEmpty(record.reason) && parsed.reason) {
      update.reason = parsed.reason;
    }

    const score = parsed.score;
    if (score) {
      if (record.scoreReproducibility == null && score.reproducibility != null) {
        update.scoreReproducibility = score.reproducibility;
      }
      if (record.scoreScarcity == null && score.scarcity != null) {
        update.scoreScarcity = score.scarcity;
      }
      if (record.scoreValidation == null && score.validation != null) {
        update.scoreValidation = score.validation;
      }
      if (record.scoreTotal == null && score.total != null) {
        update.scoreTotal = score.total;
      }
    }

    if (Object.keys(update).length === 0) {
      skipped += 1;
      continue;
    }

    await dbInstance.update(kocRecord).set(update).where(eq(kocRecord.id, record.id));
    updated += 1;
  }

  console.log(`Backfill complete. Updated ${updated}, skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
