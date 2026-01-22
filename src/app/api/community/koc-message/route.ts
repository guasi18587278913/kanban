import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type DebugInfo = {
  sourceLogId: string | null;
  messageIndex: number | null;
  steps: Array<{ step: string; ok: boolean; detail?: string }>;
};

const buildDebug = (sourceLogId: string | null, messageIndex: number | null): DebugInfo => ({
  sourceLogId,
  messageIndex,
  steps: [],
});

const addStep = (debug: DebugInfo, step: string, ok: boolean, detail?: string) => {
  debug.steps.push(detail ? { step, ok, detail } : { step, ok });
};

async function loadDbDeps() {
  const [{ db }, schema, drizzle] = await Promise.all([
    import('@/core/db'),
    import('@/config/db/schema-community-v2'),
    import('drizzle-orm'),
  ]);

  return {
    db,
    memberMessage: schema.memberMessage,
    rawChatLog: schema.rawChatLog,
    and: drizzle.and,
    eq: drizzle.eq,
  };
}

function parseContext(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchFromRawLog(
  sourceLogId: string,
  messageIndex: number,
  debug: DebugInfo,
  deps: Awaited<ReturnType<typeof loadDbDeps>>
) {
  try {
    const [log] = await deps
      .db()
      .select({
        rawContent: deps.rawChatLog.rawContent,
        chatDate: deps.rawChatLog.chatDate,
      })
      .from(deps.rawChatLog)
      .where(deps.eq(deps.rawChatLog.id, sourceLogId))
      .limit(1);

    if (!log?.rawContent || !log?.chatDate) {
      addStep(debug, 'raw_chat_log_found', false, 'raw_content/chat_date missing');
      return null;
    }
    addStep(debug, 'raw_chat_log_found', true);

    let target:
      | {
          author: string;
          text: string;
          time: string;
          index: number;
        }
      | undefined;
    let contextBefore: Array<{ author: string; content: string; time: string }> = [];
    let contextAfter: Array<{ author: string; content: string; time: string }> = [];

    try {
      const { parseMessages } = await import('@/lib/analysis/preprocessor');
      const preprocessed = parseMessages(log.rawContent, log.chatDate);
      target = preprocessed.messages.find((msg) => msg.index === messageIndex);

      if (target) {
        addStep(debug, 'parse_messages_hit', true);
        contextBefore = preprocessed.messages
          .slice(Math.max(0, target.index - 2), target.index)
          .map((m) => ({
            author: m.author,
            content: m.text.slice(0, 100),
            time: m.time,
          }));

        contextAfter = preprocessed.messages
          .slice(target.index + 1, target.index + 3)
          .map((m) => ({
            author: m.author,
            content: m.text.slice(0, 100),
            time: m.time,
          }));
      } else {
        addStep(debug, 'parse_messages_hit', false, 'index_not_found');
      }
    } catch (error) {
      addStep(
        debug,
        'parse_messages_failed',
        false,
        error instanceof Error ? error.message : String(error)
      );
    }

    if (!target) {
      const { parseMessages: parseLegacyMessages } = await import('@/lib/community-raw-parser');
      const legacyMessages = parseLegacyMessages(log.rawContent);
      const legacyTarget = legacyMessages[messageIndex];
      if (!legacyTarget) {
        addStep(debug, 'legacy_parse_hit', false, 'index_not_found');
        return null;
      }
      addStep(debug, 'legacy_parse_hit', true);
      target = {
        author: legacyTarget.author,
        text: legacyTarget.text,
        time: legacyTarget.time,
        index: messageIndex,
      } as any;
      contextBefore = legacyMessages
        .slice(Math.max(0, messageIndex - 2), messageIndex)
        .map((m) => ({
          author: m.author,
          content: m.text.slice(0, 100),
          time: m.time,
        }));
      contextAfter = legacyMessages
        .slice(messageIndex + 1, messageIndex + 3)
        .map((m) => ({
          author: m.author,
          content: m.text.slice(0, 100),
          time: m.time,
        }));
    }

    if (!target) {
      return null;
    }

    return {
      authorName: target.author,
      messageContent: target.text,
      messageTime: target.time,
      messageIndex: target.index,
      contextBefore,
      contextAfter,
    };
  } catch (error) {
    addStep(
      debug,
      'raw_log_fallback_failed',
      false,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

export async function GET(request: Request) {
  let debug: DebugInfo | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const sourceLogId = searchParams.get('sourceLogId');
    const messageIndexParam = searchParams.get('messageIndex');
    const messageIndex = messageIndexParam ? Number(messageIndexParam) : NaN;

    debug = buildDebug(sourceLogId, Number.isNaN(messageIndex) ? null : messageIndex);

    if (!sourceLogId || Number.isNaN(messageIndex)) {
      addStep(debug, 'params_valid', false, 'missing sourceLogId or messageIndex');
      return NextResponse.json({ error: 'missing params', debug }, { status: 400 });
    }
    addStep(debug, 'params_valid', true);

    let deps: Awaited<ReturnType<typeof loadDbDeps>> | null = null;
    try {
      deps = await loadDbDeps();
      addStep(debug, 'load_db_deps', true);
    } catch (error) {
      addStep(
        debug,
        'load_db_deps',
        false,
        error instanceof Error ? error.message : String(error)
      );
      return NextResponse.json(
        { error: '原文暂不可用（依赖加载失败）', debug },
        { status: 500 }
      );
    }

    let row: {
      id: string;
      authorName: string;
      messageContent: string;
      messageTime: unknown;
      messageIndex: number;
      contextBefore: string | null;
      contextAfter: string | null;
    } | undefined;
    try {
      [row] = await deps
        .db()
        .select({
          id: deps.memberMessage.id,
          authorName: deps.memberMessage.authorName,
          messageContent: deps.memberMessage.messageContent,
          messageTime: deps.memberMessage.messageTime,
          messageIndex: deps.memberMessage.messageIndex,
          contextBefore: deps.memberMessage.contextBefore,
          contextAfter: deps.memberMessage.contextAfter,
        })
        .from(deps.memberMessage)
        .where(
          deps.and(
            deps.eq(deps.memberMessage.sourceLogId, sourceLogId),
            deps.eq(deps.memberMessage.messageIndex, messageIndex)
          )
        )
        .limit(1);
      addStep(debug, 'member_message_query', true);
    } catch {
      row = undefined;
      addStep(debug, 'member_message_query', false, 'query_failed');
    }

    if (row) {
      return NextResponse.json({
        message: {
          id: row.id,
          authorName: row.authorName,
          messageContent: row.messageContent,
          messageTime: row.messageTime,
          messageIndex: row.messageIndex,
          contextBefore: parseContext(row.contextBefore),
          contextAfter: parseContext(row.contextAfter),
        },
        debug,
      });
    }
    addStep(debug, 'member_message_hit', false, 'not_found');
    const fallback = await fetchFromRawLog(sourceLogId, messageIndex, debug, deps);
    if (fallback) {
      return NextResponse.json({ message: fallback, fallback: true, debug });
    }

    return NextResponse.json(
      { error: '原文暂不可用（未回填或索引缺失）', debug },
      { status: 404 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: '原文暂不可用（服务异常）',
        debug,
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
