'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { SmartIcon } from '@/shared/blocks/common';

export default function CoachCrmPage() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name');

  const title = useMemo(() => {
    if (!name) return '教练/志愿者 CRM';
    return `${name} 的 CRM`;
  }, [name]);

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <SmartIcon name="UserCheck2" className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>数据建设中</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>这里将展示该教练的消息总数、答疑总数，以及全部回答过的问题原文。</p>
          <p>当前仅支持从“AI 产品出海”群聊中统计，请稍后刷新或联系运营补充数据。</p>
        </CardContent>
      </Card>
    </div>
  );
}
