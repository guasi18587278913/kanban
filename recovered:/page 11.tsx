'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ScrollArea } from '@/shared/components/ui/scroll-area';

export const dynamic = 'force-dynamic';

export default function UploadMembersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<{ total?: number; latestUpdatedAt?: string | null; latestNickname?: string | null }>({});
  const [productLine, setProductLine] = useState('AI产品出海');

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/community/upload-members');
      const data = await res.json();
      if (res.ok) setOverview(data);
    } catch (e) {
      // ignore
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!file) {
      setMessage('请先选择 CSV 文件');
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append('productLine', productLine);
      form.append('file', file);
      const res = await fetch('/api/community/upload-members', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '上传失败');
      } else {
        setMessage(`上传成功，处理 ${data.processed || 0} 行`);
        fetchOverview();
      }
    } catch (err: any) {
      setMessage(err?.message || '上传失败');
    } finally {
      setLoading(false);
    }
  };

  // 单个学员手动录入
  const [single, setSingle] = useState({ planetId: '', nickname: '', wechatId: '', period: '', joinDate: '', expireDate: '' });
  const [singleLoading, setSingleLoading] = useState(false);

  const onSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!single.nickname && !single.planetId) {
      setMessage('至少填写昵称或星球编号');
      return;
    }
    setSingleLoading(true);
    try {
      const form = new FormData();
          form.append('mode', 'single');
          form.append('productLine', productLine);
          Object.entries(single).forEach(([k, v]) => form.append(k, v));
      const res = await fetch('/api/community/upload-members', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '上传失败');
      } else {
        setMessage('单个学员录入成功');
        fetchOverview();
      }
    } catch (err: any) {
      setMessage(err?.message || '上传失败');
    } finally {
      setSingleLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">上传学员名单</h1>
          <p className="text-sm text-muted-foreground mt-1">
            上传 CSV（星球编号、昵称、期数、加入/到期时间），用于校验/补全 member 表和 CRM 列表。
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
              placeholder="产品线（如 AI产品出海 / YouTube AI视频）"
              value={productLine}
              onChange={(e) => setProductLine(e.target.value)}
            />
            <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? '上传中...' : '上传 CSV'}
              </Button>
              {message && <span className="text-sm text-muted-foreground">{message}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              CSV 格式：星球编号, 昵称, 微信号（可选, wechat_id 或 微信号）, 加入时间, 到期时间, 期数, ...
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">手动新增单个学员</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmitSingle}>
            <Input placeholder="星球编号" value={single.planetId} onChange={(e) => setSingle({ ...single, planetId: e.target.value })} />
            <Input placeholder="昵称" value={single.nickname} onChange={(e) => setSingle({ ...single, nickname: e.target.value })} />
            <Input placeholder="微信号" value={single.wechatId} onChange={(e) => setSingle({ ...single, wechatId: e.target.value })} />
            <Input placeholder="期数 (如 1)" value={single.period} onChange={(e) => setSingle({ ...single, period: e.target.value })} />
            <Input placeholder="加入时间 YYYY-MM-DD" value={single.joinDate} onChange={(e) => setSingle({ ...single, joinDate: e.target.value })} />
            <Input placeholder="到期时间 YYYY-MM-DD" value={single.expireDate} onChange={(e) => setSingle({ ...single, expireDate: e.target.value })} />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={singleLoading}>
                {singleLoading ? '提交中...' : '提交'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">当前概览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>学员总数：{overview.total ?? '-'}</div>
          <div>最近更新：{overview.latestUpdatedAt ? new Date(overview.latestUpdatedAt).toLocaleString() : '-'}</div>
          <div>最近更新学员：{overview.latestNickname || '-'}</div>
        </CardContent>
      </Card>
    </div>
  );
}
