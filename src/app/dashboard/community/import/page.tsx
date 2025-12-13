'use client';

import { useState } from 'react';
import { submitDailyReport } from '@/actions/community-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';

export default function DailyReportImportPage() {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!filename || !content) {
      toast.error('Please fill in both filename and content');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitDailyReport(filename, content);
      if (result.success) {
        toast.success(result.message);
        setFilename('');
        setContent('');
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Import Daily Report</CardTitle>
          <CardDescription>
            Paste the daily report text content and provide the filename to import data.
            Filename format: "深海圈丨ProductLine_YYYY-MM-DD.txt"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Filename (e.g., 深海圈丨AI产品出海1期1群_2025-12-03.txt)</label>
            <Input 
              placeholder="Enter filename..." 
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Report Content</label>
            <Textarea 
              placeholder="Paste the full report text here..." 
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
            {isSubmitting ? 'Importing...' : 'Import Report'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
