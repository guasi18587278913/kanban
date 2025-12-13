'use client';

import { useEffect, useState } from 'react';
import { getReportById } from '@/actions/community-actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { SmartIcon } from '@/shared/blocks/common';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function CommunityReportDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      try {
        const result = await getReportById(id);
        setData(result);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-8">Report not found.</div>;
  }

  return (
    <div className="flex flex-col gap-8 p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">{data.productLine}</Badge>
            <span className="text-muted-foreground">{new Date(data.reportDate).toLocaleDateString()}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{data.groupName || '社群日报'}</h1>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="消息数" value={data.messageCount} icon="MessageSquare" />
        <StatCard title="提问数" value={data.questionCount} icon="HelpCircle" />
        <StatCard title="解决率" value={`${data.resolutionRate}%`} icon="CheckCircle2" />
        <StatCard title="好事" value={data.goodNewsCount} icon="Trophy" />
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Left Column: Lists */}
        <div className="md:col-span-2 flex flex-col gap-8">
            {/* Star Students */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <SmartIcon name="Star" className="h-5 w-5 text-yellow-500" />
                        标杆学员
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                    {data.starStudents?.length === 0 && <p className="text-muted-foreground">今日无标杆学员</p>}
                    {data.starStudents?.map((student: any) => (
                        <div key={student.id} className="border rounded-lg p-4 bg-muted/30">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-semibold text-lg">{student.studentName}</span>
                                <Badge>{student.type}</Badge>
                            </div>
                            {student.achievement && (
                                <p className="text-sm text-muted-foreground mb-2">{student.achievement}</p>
                            )}
                            {student.highlight && (
                                <blockquote className="border-l-2 pl-4 italic text-sm text-muted-foreground">
                                    &quot;{student.highlight}&quot;
                                </blockquote>
                            )}
                        </div>
                    ))}
                </CardContent>
            </Card>

             {/* KOCs */}
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <SmartIcon name="Users" className="h-5 w-5 text-blue-500" />
                        分享官 / KOC
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                    {data.kocs?.length === 0 && <p className="text-muted-foreground">今日无 KOC 分享</p>}
                    {data.kocs?.map((koc: any) => (
                        <div key={koc.id} className="border rounded-lg p-4 bg-muted/30">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-semibold text-lg">{koc.kocName}</span>
                            </div>
                            <p className="text-sm">{koc.contribution}</p>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>

        {/* Right Column: Full Text */}
        <div>
            <Card className="h-full">
                <CardHeader>
                    <CardTitle>原始报告</CardTitle>
                </CardHeader>
                <CardContent>
                   <div className="prose prose-sm dark:prose-invert max-w-none h-[600px] overflow-auto pr-2">
                        <ReactMarkdown>{data.fullReport}</ReactMarkdown>
                   </div>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <SmartIcon name={icon} className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
