'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ScrollArea } from '@/shared/components/ui/scroll-area';

export const dynamic = 'force-dynamic';

export default function UploadChatPage() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/community/upload-chat');
      const data = await res.json();
      if (res.ok) setLogs(data.items || []);
    } catch (e) {
      // ignore
    }
  };
  useEffect(() => {
    fetchLogs();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!files || files.length === 0) {
      setMessage('请先选择 TXT 文件');
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      const res = await fetch('/api/community/upload-chat', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '上传失败');
      } else {
        setMessage(`上传完成：${(data.uploaded || []).length} 个文件`);
        fetchLogs();
      }
    } catch (err: any) {
      setMessage(err?.message || '上传失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">上传聊天记录</h1>
          <p className="text-sm text-muted-foreground mt-1">
            选择多个群聊 TXT 文件（命名需包含产品线、期数、群号、日期），上传后写入 raw_chat_log（pending）。
          </p>
        </div>
        <Link href="/community" className="text-sm text-primary hover:underline">
          返回看板
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">上传入口</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              type="file"
              multiple
              accept=".txt"
              onChange={(e) => setFiles(e.target.files)}
            />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? '上传中...' : '上传'}
              </Button>
              {message && <span className="text-sm text-muted-foreground">{message}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              文件名示例：深海圈丨AI产品出海1期1群_2025-12-21.txt
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">已上传记录（最近 50 条）</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px]">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-2 text-left">日期</th>
                  <th className="py-2 pr-2 text-left">产品线</th>
                  <th className="py-2 pr-2 text-left">期</th>
                  <th className="py-2 pr-2 text-left">群</th>
                  <th className="py-2 pr-2 text-left">消息</th>
                  <th className="py-2 pr-2 text-left">状态</th>
                  <th className="py-2 pr-2 text-left">文件</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-2">{log.chatDate?.slice(0, 10)}</td>
                    <td className="py-2 pr-2">{log.productLine}</td>
                    <td className="py-2 pr-2">{log.period}</td>
                    <td className="py-2 pr-2">{log.groupNumber}</td>
                    <td className="py-2 pr-2">{log.messageCount}</td>
                    <td className="py-2 pr-2">{log.status}</td>
                    <td className="py-2 pr-2 truncate max-w-[200px]">{log.fileName}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-sm text-muted-foreground text-center">
                      暂无数据
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
