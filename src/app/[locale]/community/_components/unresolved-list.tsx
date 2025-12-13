import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shared/components/ui/accordion";
import { Link } from '@/core/i18n/navigation';

interface UnresolvedListProps {
  stats: any[];
}

export function UnresolvedList({ stats }: UnresolvedListProps) {
  // 1. Flatten all questions from all reports
  const allQuestions = stats.flatMap(report => {
      // Use parsed questions if available
      const questions = report.questions || [];
      return questions.map((q: any, idx: number) => ({
          ...q,
          id: `${report.id}-${idx}`,
          reportId: report.id,
          reportDate: report.reportDate,
          groupName: report.groupName,
          isUnresolved: !q.a || q.a.length < 5 // Heuristic for unanswered
      }));
  });

  // 2. Filter for Unresolved
  const unresolved = allQuestions.filter((q: any) => q.isUnresolved);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
            <CardTitle>未解决问题 ({unresolved.length})</CardTitle>
            {unresolved.length > 0 && <Badge variant="destructive">需跟进</Badge>}
        </div>
        <CardDescription>
          这里汇总了所有尚未闭环或未检测到回答的提问。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden min-h-[400px]">
        {unresolved.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                🎉 太棒了！所有问题都已解决。
            </div>
        ) : (
            <ScrollArea className="h-full pr-4">
                 <Accordion type="single" collapsible className="w-full">
                    {unresolved.map((item: any) => (
                        <AccordionItem key={item.id} value={item.id}>
                            <AccordionTrigger className="text-left hover:no-underline py-2">
                                <div className="flex flex-col gap-1 items-start">
                                    <span className="text-sm font-medium leading-normal">{item.q}</span>
                                    <div className="flex gap-2 text-xs text-muted-foreground font-normal">
                                        <span>{new Date(item.reportDate).toLocaleDateString()}</span>
                                        <span>•</span>
                                        <span>{item.groupName}</span>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="p-2 bg-muted/50 rounded-md text-sm text-muted-foreground">
                                    <p className="mb-2">⚠️ 尚未检测到有效回答。</p>
                                    <Link href={`/community/report/${item.reportId}`} className="text-primary hover:underline">
                                        查看原始日报 &rarr;
                                    </Link>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                 </Accordion>
            </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
