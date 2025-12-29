'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ScrollArea } from '@/shared/components/ui/scroll-area';

type MemberItem = {
  id: string;
  planetId?: string | null;
  nickname: string;
  nicknameNormalized?: string | null;
  wechatId?: string | null;
  period?: string | null;
  status?: string | null;
  joinDate?: string | null;
  expireDate?: string | null;
  productLine?: string | null;
  role?: string | null;
};

const DEFAULT_PRODUCT_LINE = 'AI产品出海';

function formatDateInput(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function buildMemberSlug(item: { id?: string; planetId?: string | null; nickname?: string; nicknameNormalized?: string | null }) {
  return item.id || item.planetId || item.nicknameNormalized || normalizeName(item.nickname || '');
}

export default function MemberAdminPage() {
  const [items, setItems] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemberItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    planetId: '',
    nickname: '',
    wechatId: '',
    period: '',
    joinDate: '',
    expireDate: '',
    productLine: DEFAULT_PRODUCT_LINE,
  });
  const [editForm, setEditForm] = useState({
    planetId: '',
    nickname: '',
    wechatId: '',
    period: '',
    status: '',
    joinDate: '',
    expireDate: '',
    productLine: DEFAULT_PRODUCT_LINE,
  });

  const fetchList = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/community/member?role=student&pageSize=5000', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '加载失败');
      } else {
        setItems(data.items || []);
      }
    } catch (e: any) {
      setMessage(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return items;
    return items.filter((item) => {
      const name = (item.nickname || '').toLowerCase();
      const normalized = (item.nicknameNormalized || '').toLowerCase();
      const planetId = (item.planetId || '').toLowerCase();
      return name.includes(k) || normalized.includes(k) || planetId.includes(k);
    });
  }, [items, keyword]);

  const openEdit = (item: MemberItem) => {
    setEditing(item);
    setEditForm({
      planetId: item.planetId || '',
      nickname: item.nickname || '',
      wechatId: item.wechatId || '',
      period: item.period || '',
      status: item.status || '',
      joinDate: formatDateInput(item.joinDate),
      expireDate: formatDateInput(item.expireDate),
      productLine: item.productLine || DEFAULT_PRODUCT_LINE,
    });
    setEditOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/community/member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          role: 'student',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '新增失败');
      } else {
        setMessage('新增成功');
        setCreateForm({
          planetId: '',
          nickname: '',
          wechatId: '',
          period: '',
          joinDate: '',
          expireDate: '',
          productLine: DEFAULT_PRODUCT_LINE,
        });
        fetchList();
      }
    } catch (e: any) {
      setMessage(e?.message || '新增失败');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.id) return;
    setMessage(null);
    try {
      const res = await fetch('/api/community/member', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          ...editForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '更新失败');
      } else {
        setMessage('更新成功');
        setEditOpen(false);
        setEditing(null);
        fetchList();
      }
    } catch (e: any) {
      setMessage(e?.message || '更新失败');
    }
  };

  const handleDelete = async (item: MemberItem) => {
    if (!item?.id) return;
    const confirmText = `确认删除学员「${item.nickname || item.planetId}」吗？`;
    if (!window.confirm(confirmText)) return;
    setMessage(null);
    try {
      const res = await fetch('/api/community/member', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '删除失败');
      } else {
        setMessage('删除成功');
        fetchList();
      }
    } catch (e: any) {
      setMessage(e?.message || '删除失败');
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">学员管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            新增、编辑、删除学员，并补充微信号等信息。
          </p>
        </div>
        <Link href="/community" className="text-sm text-primary hover:underline">
          返回看板
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">新增学员</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={handleCreate}>
            <Input
              placeholder="星球编号"
              value={createForm.planetId}
              onChange={(e) => setCreateForm({ ...createForm, planetId: e.target.value })}
            />
            <Input
              placeholder="昵称"
              value={createForm.nickname}
              onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })}
            />
            <Input
              placeholder="微信号"
              value={createForm.wechatId}
              onChange={(e) => setCreateForm({ ...createForm, wechatId: e.target.value })}
            />
            <Input
              placeholder="期数 (如 2)"
              value={createForm.period}
              onChange={(e) => setCreateForm({ ...createForm, period: e.target.value })}
            />
            <Input
              type="date"
              value={createForm.joinDate}
              onChange={(e) => setCreateForm({ ...createForm, joinDate: e.target.value })}
            />
            <Input
              type="date"
              value={createForm.expireDate}
              onChange={(e) => setCreateForm({ ...createForm, expireDate: e.target.value })}
            />
            <Input
              placeholder="产品线"
              value={createForm.productLine}
              onChange={(e) => setCreateForm({ ...createForm, productLine: e.target.value })}
            />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={creating}>
                {creating ? '提交中...' : '新增'}
              </Button>
              {message && <span className="text-xs text-muted-foreground">{message}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">学员列表</CardTitle>
          <div className="flex items-center gap-3">
            <Input
              placeholder="搜索昵称/星球编号"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">{loading ? '加载中...' : `共 ${items.length} 人`}</span>
          </div>
        </CardHeader>
        <CardContent>
          {message && <div className="text-xs text-muted-foreground mb-2">{message}</div>}
          <ScrollArea className="h-[520px]">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-2 text-left">昵称</th>
                  <th className="py-2 pr-2 text-left">星球编号</th>
                  <th className="py-2 pr-2 text-left">微信号</th>
                  <th className="py-2 pr-2 text-left">期数</th>
                  <th className="py-2 pr-2 text-left">状态</th>
                  <th className="py-2 pr-2 text-left">加入</th>
                  <th className="py-2 pr-2 text-left">到期</th>
                  <th className="py-2 pr-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
                      加载中...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const slug = buildMemberSlug(item);
                    return (
                    <tr key={item.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-2">
                        <div className="font-medium">{item.nickname || '未命名'}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.productLine || DEFAULT_PRODUCT_LINE}
                        </div>
                      </td>
                      <td className="py-2 pr-2">{item.planetId || '-'}</td>
                      <td className="py-2 pr-2">{item.wechatId || '-'}</td>
                      <td className="py-2 pr-2">{item.period || '-'}</td>
                      <td className="py-2 pr-2">{item.status || '-'}</td>
                      <td className="py-2 pr-2">{formatDateInput(item.joinDate)}</td>
                      <td className="py-2 pr-2">{formatDateInput(item.expireDate)}</td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="secondary" asChild>
                            <Link href={`/community/student/${slug}`}>CRM</Link>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                            编辑
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(item)}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑学员</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={handleUpdate}>
            <Input
              placeholder="星球编号"
              value={editForm.planetId}
              onChange={(e) => setEditForm({ ...editForm, planetId: e.target.value })}
            />
            <Input
              placeholder="昵称"
              value={editForm.nickname}
              onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
            />
            <Input
              placeholder="微信号"
              value={editForm.wechatId}
              onChange={(e) => setEditForm({ ...editForm, wechatId: e.target.value })}
            />
            <Input
              placeholder="期数"
              value={editForm.period}
              onChange={(e) => setEditForm({ ...editForm, period: e.target.value })}
            />
            <Input
              placeholder="状态 (active/expired)"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            />
            <Input
              type="date"
              value={editForm.joinDate}
              onChange={(e) => setEditForm({ ...editForm, joinDate: e.target.value })}
            />
            <Input
              type="date"
              value={editForm.expireDate}
              onChange={(e) => setEditForm({ ...editForm, expireDate: e.target.value })}
            />
            <Input
              placeholder="产品线"
              value={editForm.productLine}
              onChange={(e) => setEditForm({ ...editForm, productLine: e.target.value })}
            />
            <DialogFooter>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
