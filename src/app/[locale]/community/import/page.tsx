'use client';

import { useState } from 'react';
import { importRawChatLogWithLLM, clearCommunityData, retryFailedImports } from '@/actions/community-actions';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Input } from '@/shared/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { toast } from 'sonner';

export default function DailyReportImportPage() {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleSubmit = async () => {
    if (!filename || !content) {
      toast.error('请提供文件名和原始群聊内容');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await importRawChatLogWithLLM(filename, content);
      if (result.success) {
        toast.success(result.message === 'Report imported successfully' ? '导入成功！' : result.message);
        setFilename('');
        setContent('');
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('导入失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearData = async () => {
    if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) return;
    
    setIsSubmitting(true);
    try {
      const result = await clearCommunityData();
      if (result.success) {
        toast.success('数据已清空');
      } else {
        toast.error('清空失败');
      }
    } catch (e) {
      toast.error('清空失败');
    } finally {
      setIsSubmitting(false);
    }
  };

   const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const res = await retryFailedImports();
      const success = res.filter(r => r.status === 'success').length;
      if (success > 0) {
        toast.success(`重试成功: ${success} 个任务`);
      } else {
        toast.info('没有待处理的失败任务');
      }
    } catch (e) {
      toast.error('重试失败');
      console.error(e);
    } finally {
      setIsRetrying(false);
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
            上传原始群聊记录（.txt），系统将自动解析日期、产品线、群号并生成日报。
            文件名格式示例：&quot;深海圈丨产品线_YYYY-MM-DD.txt&quot;
          </CardDescription>
          <div className="absolute top-6 right-6 flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? '重试中...' : '重试失败任务'}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearData} disabled={isSubmitting}>
              清空所有数据
            </Button>
          </div>
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
