'use client';

import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Input } from '@/shared/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { toast } from 'sonner';

export default function DailyReportImportPage() {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!filename || !content) {
      toast.error('请提供文件名和原始群聊内容');
      return;
    }

    setIsSubmitting(true);
    try {
      const form = new FormData();
      const file = new File([content], filename, { type: 'text/plain' });
      form.append('files', file);
      const res = await fetch('/api/community/upload-chat', { method: 'POST', body: form });
      const result = await res.json();
      if (res.ok) {
        toast.success('导入成功！');
        setFilename('');
        setContent('');
      } else {
        toast.error(result.error || '导入失败');
      }
    } catch (error) {
      toast.error('导入失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (file?: File | null) => {
    if (!file) return;
    setFilename(file.name);
    const text = await file.text();
    setContent(text);
  };

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>上传原始群聊，一键生成日报</CardTitle>
          <CardDescription>
            上传原始群聊记录（.txt），系统将自动解析日期、产品线、期数、群号并写入 raw_chat_log。
            文件名格式示例：&quot;深海圈丨AI产品出海1期1群_2025-12-03.txt&quot;
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">文件名 (例如: 深海圈丨AI产品出海1期1群_2025-12-03.txt)</label>
            <Input 
              placeholder="请输入文件名..." 
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
            />
            <Input
              type="file"
              accept=".txt"
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              原始群聊内容（可上传文件或直接粘贴）
            </label>
            <Textarea 
              placeholder="上传 .txt 或粘贴原始群聊记录，系统将自动解析"
              className="min-h-[300px] font-mono text-sm"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? '导入中...' : '确认导入'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
