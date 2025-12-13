'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { SmartIcon } from '@/shared/blocks/common';

export default function StudentCrmPage() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name');

  const title = useMemo(() => {
    if (!name) return '学员 CRM';
    return `${name} 的 CRM`;
  }, [name]);

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <SmartIcon name="Users" className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>数据建设中</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>这里将展示该学员的标签、互动原文、提问/好事贡献等完整 CRM 视图。</p>
          <p>即将接入标签体系和聊天原文，请稍后刷新或联系运营补充数据。</p>
        </CardContent>
      </Card>
    </div>
  );
}
