'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';

export const dynamic = 'force-dynamic';

export default function ImportIssuesPage() {
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [unmatchedMembers, setUnmatchedMembers] = useState<any[]>([]);
  const [unanswered, setUnanswered] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const fetchIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/community/import-issues');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '加载失败');
      } else {
        setRawLogs(data.rawLogs || []);
        setUnmatchedMembers(data.unmatchedMembers || []);
        setUnanswered(data.unansweredQA || []);
      }
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
  }, []);

  const retryLog = async (logId: string) => {
    setRetryingId(logId);
    setError(null);
    try {
      const res = await fetch('/api/community/import-issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '重试失败');
      } else {
        await fetchIssues();
      }
    } catch (e: any) {
      setError(e?.message || '重试失败');
    } finally {
      setRetryingId(null);
    }
  };

  const runAction = async (key: string, body: Record<string, any>) => {
    setActionKey(key);
    setError(null);
    try {
      const res = await fetch('/api/community/import-issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '操作失败');
      } else {
        await fetchIssues();
      }
    } catch (e: any) {
      setError(e?.message || '操作失败');
    } finally {
      setActionKey(null);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">异常处理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            展示导入/解析过程中未自动处理的记录（pending/failed），便于人工补全。
            重新入队后，需要再次运行解析任务以回填数据。
          </p>
        </div>
        <Link href="/community" className="text-sm text-primary hover:underline">
          返回看板
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">异常说明与处理方式</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div>1) 原始文件待处理/失败：导入未跑完或解析失败，点击“重新入队”，再运行解析任务即可回填。</div>
          <div>2) 未匹配成员的消息：作者昵称不在名单里，可“创建成员并关联消息”，或忽略无效/重复昵称。</div>
          <div>3) 未配对/未解决问答：未配对=缺少回答者；未解决=未标记解决。可补充回答者或标记已解决。</div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              原始文件待处理/失败
              <Badge variant="outline" className="text-[11px]">
                {rawLogs.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {loading && <div className="text-muted-foreground">加载中...</div>}
            {error && <div className="text-red-500">{error}</div>}
            <ScrollArea className="h-[320px]">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-2 text-left">日期</th>
                    <th className="py-2 pr-2 text-left">期</th>
                    <th className="py-2 pr-2 text-left">群</th>
                    <th className="py-2 pr-2 text-left">消息数</th>
                    <th className="py-2 pr-2 text-left">状态</th>
                    <th className="py-2 pr-2 text-left">原因</th>
                    <th className="py-2 pr-2 text-left">文件</th>
                    <th className="py-2 pr-2 text-left">更新时间</th>
                    <th className="py-2 pr-2 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rawLogs.map((it) => (
                    <tr key={it.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-2">{it.chatDate?.slice(0, 10)}</td>
                      <td className="py-2 pr-2">{it.period}</td>
                      <td className="py-2 pr-2">{it.groupNumber}</td>
                      <td className="py-2 pr-2">{it.messageCount}</td>
                      <td className="py-2 pr-2">{it.status}</td>
                      <td className="py-2 pr-2 truncate max-w-[180px]">{it.statusReason || '-'}</td>
                      <td className="py-2 pr-2 truncate max-w-[180px]">{it.fileName}</td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">
                        {it.updatedAt ? new Date(it.updatedAt).toLocaleString() : '-'}
                      </td>
                      <td className="py-2 pr-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retryingId === it.id}
                          onClick={() => retryLog(it.id)}
                        >
                          {retryingId === it.id ? '处理中...' : '重新入队'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {rawLogs.length === 0 && !loading && (
                    <tr>
                      <td colSpan={9} className="py-4 text-center text-muted-foreground">
                        暂无记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              未匹配成员的消息
              <Badge variant="outline" className="text-[11px]">
                {unmatchedMembers.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ScrollArea className="h-[320px]">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-2 text-left">时间</th>
                    <th className="py-2 pr-2 text-left">作者</th>
                    <th className="py-2 pr-2 text-left">期/群</th>
                    <th className="py-2 pr-2 text-left">内容</th>
                    <th className="py-2 pr-2 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatchedMembers.map((it) => (
                    <tr key={it.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-2 text-xs text-muted-foreground">
                        {it.messageTime ? new Date(it.messageTime).toLocaleString() : '-'}
                      </td>
                      <td className="py-2 pr-2">{it.authorName}</td>
                      <td className="py-2 pr-2">{it.period}期 / {it.groupNumber}群</td>
                      <td className="py-2 pr-2 truncate max-w-[260px]" title={it.messageContent}>{it.messageContent}</td>
                      <td className="py-2 pr-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionKey === `member-student-${it.id}`}
                            onClick={() =>
                              runAction(`member-student-${it.id}`, {
                                action: 'createMemberAndLink',
                                nickname: it.authorName,
                                role: 'student',
                                productLine: it.productLine,
                                period: it.period,
                              })
                            }
                          >
                            {actionKey === `member-student-${it.id}` ? '处理中...' : '创建学员'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionKey === `member-coach-${it.id}`}
                            onClick={() =>
                              runAction(`member-coach-${it.id}`, {
                                action: 'createMemberAndLink',
                                nickname: it.authorName,
                                role: 'coach',
                                productLine: it.productLine,
                                period: it.period,
                              })
                            }
                          >
                            {actionKey === `member-coach-${it.id}` ? '处理中...' : '创建教练'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionKey === `member-ignore-${it.id}`}
                            onClick={() =>
                              runAction(`member-ignore-${it.id}`, {
                                action: 'ignoreUnmatched',
                                nickname: it.authorName,
                              })
                            }
                          >
                            {actionKey === `member-ignore-${it.id}` ? '处理中...' : '忽略'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {unmatchedMembers.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-muted-foreground">
                        暂无记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            未配对/未解决的问答
            <Badge variant="outline" className="text-[11px]">
              {unanswered.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ScrollArea className="h-[320px]">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-2 text-left">时间</th>
                  <th className="py-2 pr-2 text-left">提问者</th>
                  <th className="py-2 pr-2 text-left">类型</th>
                  <th className="py-2 pr-2 text-left">期/群</th>
                  <th className="py-2 pr-2 text-left">问题</th>
                  <th className="py-2 pr-2 text-left">回答者</th>
                  <th className="py-2 pr-2 text-left">解决</th>
                  <th className="py-2 pr-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {unanswered.map((it) => {
                  const isUnpaired = !it.answererId && !it.answererName;
                  const isUnresolved = !it.isResolved;
                  return (
                    <tr key={it.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {it.questionTime ? new Date(it.questionTime).toLocaleString() : '-'}
                    </td>
                    <td className="py-2 pr-2">{it.askerName}</td>
                    <td className="py-2 pr-2">
                      {isUnpaired ? '未配对' : isUnresolved ? '未解决' : '-'}
                    </td>
                    <td className="py-2 pr-2">{it.period}期 / {it.groupNumber}群</td>
                    <td className="py-2 pr-2 truncate max-w-[320px]" title={it.questionContent}>{it.questionContent}</td>
                    <td className="py-2 pr-2">{it.answererName || '-'}</td>
                    <td className="py-2 pr-2">{it.isResolved ? '是' : '否'}</td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-2">
                        {isUnpaired && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionKey === `qa-assign-${it.id}`}
                            onClick={async () => {
                              const answererName = window.prompt('请输入回答者昵称（用于匹配成员）：');
                              if (!answererName) return;
                              const markResolved = window.confirm('是否同时标记为已解决？');
                              await runAction(`qa-assign-${it.id}`, {
                                action: 'assignQaAnswerer',
                                qaId: it.id,
                                answererName,
                                markResolved,
                              });
                            }}
                          >
                            {actionKey === `qa-assign-${it.id}` ? '处理中...' : '补充回答者'}
                          </Button>
                        )}
                        {isUnresolved && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionKey === `qa-resolve-${it.id}`}
                            onClick={() =>
                              runAction(`qa-resolve-${it.id}`, { action: 'markQaResolved', qaId: it.id })
                            }
                          >
                            {actionKey === `qa-resolve-${it.id}` ? '处理中...' : '标记已解决'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionKey === `qa-ignore-${it.id}`}
                          onClick={() => runAction(`qa-ignore-${it.id}`, { action: 'ignoreQa', qaId: it.id })}
                        >
                          {actionKey === `qa-ignore-${it.id}` ? '处理中...' : '忽略'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {unanswered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-muted-foreground">
                      暂无记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
