import { useMemo, useState } from 'react';
import { Area, AreaChart, Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig, ChartLegend, ChartLegendContent } from '@/shared/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Button } from '@/shared/components/ui/button';
import { X } from 'lucide-react';

// Generates a consistent color for a given string (product line or group name)
function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// Predefined palette for Product Lines for consistency
const PRODUCT_COLORS: Record<string, string> = {
    'AI产品出海': '#3b82f6', // Bright Blue
    'B站好物交流': '#f97316', // Orange
    'YouTube AI视频': '#10b981', // Emerald
};

// Fallback palette for groups
const FALLBACK_COLORS = [
    '#3b82f6', // Blue
    '#f97316', // Orange
    '#10b981', // Emerald
    '#8b5cf6', // Violet
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#eab308', // Yellow
    '#ec4899', // Pink
];

// Custom sort function for group names: 1期1群 < 1期2群 < 2期1群 < 2期2群
function sortGroupNames(a: string, b: string) {
  // Extract period and group numbers using regex
  const matchA = a.match(/(\d+)期(\d+)群/);
  const matchB = b.match(/(\d+)期(\d+)群/);
  
  if (matchA && matchB) {
    const periodA = parseInt(matchA[1]);
    const periodB = parseInt(matchB[1]);
    if (periodA !== periodB) return periodA - periodB;
    
    const groupA = parseInt(matchA[2]);
    const groupB = parseInt(matchB[2]);
    return groupA - groupB;
  }
  
  // Fallback to string comparison
  return a.localeCompare(b);
}

// CSS-safe key for chart variables
function toSafeKey(str: string) {
  return str.replace(/\s+/g, '_').replace(/[^\w-]/g, '');
}

export function ChartsSection({ 
    data, 
    fixedProductLine, 
    showTrends = true, 
    showValue = true,
    showFilters = true
}: { 
    data: any[], 
    fixedProductLine?: string,
    showTrends?: boolean,
    showValue?: boolean,
    showFilters?: boolean
}) {
  // If fixedProductLine is provided, default to it.
  const [selectedProductLine, setSelectedProductLine] = useState<string>(fixedProductLine || 'all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  // Normalize productLine / groupName to collapse accidental spaces
  const normalizedData = useMemo(() => {
    return (data || []).map((d) => ({
      ...d,
      productLine: typeof d.productLine === 'string' ? d.productLine.trim().replace(/\s+/g, ' ') : d.productLine,
      groupName: typeof d.groupName === 'string' ? d.groupName.trim().replace(/\s+/g, ' ') : d.groupName,
    }));
  }, [data]);

  // Extract Filter Options
  const { productLines, groups } = useMemo(() => {
    const pl = Array.from(new Set(normalizedData.map(d => d.productLine))).filter(Boolean);
    // Use fixedProductLine if available for group filtering context
    const currentPL = fixedProductLine || selectedProductLine;
    const gr = Array.from(new Set(normalizedData.filter(d => currentPL === 'all' || d.productLine === currentPL).map(d => d.groupName))).filter(Boolean);
    return { productLines: pl.sort(), groups: gr.sort(sortGroupNames) };
  }, [normalizedData, selectedProductLine, fixedProductLine]);

  // Transform Data for Charting
  const chartData = useMemo(() => {
    // 1. Filter Data First
    let filtered = normalizedData;
    const currentPL = fixedProductLine || selectedProductLine;
    
    if (currentPL !== 'all') {
        filtered = filtered.filter(d => d.productLine === currentPL);
    }
    if (selectedGroup !== 'all') {
        filtered = filtered.filter(d => d.groupName === selectedGroup);
    }

    // 2. Identify Series Keys (What are we comparing?)
    const iscomparingGroups = currentPL !== 'all';
    
    let rawKeys: string[] = [];
    if (iscomparingGroups) {
        // "Smart Selection": If showing groups, only show Top 5 most active to prevent clutter
        const groupActivity = new Map<string, number>();
        filtered.forEach(r => {
            groupActivity.set(r.groupName, (groupActivity.get(r.groupName) || 0) + r.messageCount);
        });
        
        rawKeys = Array.from(groupActivity.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by volume desc
            .slice(0, 5) // Take Top 5
            .map(e => e[0]);
    } else {
        // Comparing Product Lines
        rawKeys = Array.from(new Set(filtered.map(d => d.productLine)));
    }

    // Sort using custom function
    const keys = rawKeys.sort((a, b) => sortGroupNames(a, b));
    const keyEntries = keys.map((key) => ({
      raw: key,
      safe: toSafeKey(key),
    }));
    
    // 3. Group by Date
    const statsMap = new Map<string, any>();
    
    filtered.forEach(report => {
        const dateStr = new Date(report.reportDate).toLocaleDateString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).replace(/\//g, '-');

        if (!statsMap.has(dateStr)) {
            statsMap.set(dateStr, { date: dateStr });
        }
        const entry = statsMap.get(dateStr);
        const keyRaw = iscomparingGroups ? report.groupName : report.productLine;
        const keySafe = toSafeKey(keyRaw);

        // ... existing aggregation logic stays same
        // Message Count
        entry[`${keySafe}_message`] = (entry[`${keySafe}_message`] || 0) + report.messageCount;
        // Question Count
        entry[`${keySafe}_question`] = (entry[`${keySafe}_question`] || 0) + report.questionCount;
        
        // Resolution Rate & Response Time (Averages)
        entry[`${keySafe}_res_sum`] = (entry[`${keySafe}_res_sum`] || 0) + (report.resolutionRate || 0);
        entry[`${keySafe}_res_count`] = (entry[`${keySafe}_res_count`] || 0) + 1;
        
        entry[`${keySafe}_time_sum`] = (entry[`${keySafe}_time_sum`] || 0) + (report.avgResponseTime || 0);
        entry[`${keySafe}_time_count`] = (entry[`${keySafe}_time_count`] || 0) + 1;
        
        // Value Metrics (Sum)
        entry[`${keySafe}_goodnews`] = (entry[`${keySafe}_goodnews`] || 0) + report.goodNewsCount;
        entry[`${keySafe}_koc`] = (entry[`${keySafe}_koc`] || 0) + (report.kocCount || 0);
    });

    // 4. Finalize Averages
    const finalData = Array.from(statsMap.values()).map(entry => {
        keyEntries.forEach(({ safe }) => {
            if (entry[`${safe}_res_count`]) {
                entry[`${safe}_rate`] = Math.round(entry[`${safe}_res_sum`] / entry[`${safe}_res_count`]);
            } else {
                entry[`${safe}_rate`] = 0; 
            }
            
            if (entry[`${safe}_time_count`]) {
                entry[`${safe}_time`] = Math.round(entry[`${safe}_time_sum`] / entry[`${safe}_time_count`]);
            } else {
                entry[`${safe}_time`] = 0; 
            }
        });
        return entry;
        return entry;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30); // Enforce strictly last 30 days

    // 5. Generate Chart Config
    const config: ChartConfig = {};
    keyEntries.forEach(({ raw, safe }, index) => {
        // Use predefined color if product line, else generate or cycle
        const color = PRODUCT_COLORS[raw as string] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
        
        // If comparing groups and a specific product line is selected, shorten the label by removing the product line prefix
        let label = raw as string;
        // Use currentPL here
        if (iscomparingGroups && currentPL !== 'all' && label.startsWith(currentPL)) {
            label = label.replace(currentPL, '').trim();
        }

        config[`${safe}_message`] = { label, color };
        config[`${safe}_question`] = { label, color };
        config[`${safe}_rate`] = { label, color };
        config[`${safe}_time`] = { label, color };
        
        // ...
        config['goodNews'] = { label: '好事', color: '#f43f5e' }; // Rose
        config['koc'] = { label: 'KOC', color: '#10b981' }; // Emerald
    });
    
    // Add Value Metrics Aggregation to finalData (Summing up for the current scope)
    finalData.forEach(entry => {
        entry.goodNews = keyEntries.reduce((acc, { safe }) => acc + (entry[`${safe}_goodnews`] || 0), 0);
        entry.koc = keyEntries.reduce((acc, { safe }) => acc + (entry[`${safe}_koc`] || 0), 0);
    });

    // 6. Identify Last Date for Styling
    const lastDate = finalData[finalData.length - 1]?.date;
    
    // Custom Dot Renderer: Only show dot for the last data point (highlight)
    const renderActiveDot = (props: any) => {
        const { cx, cy, payload, stroke } = props;
        if (payload.date === lastDate) {
            return (
                <g>
                    <circle cx={cx} cy={cy} r={4} fill={stroke} stroke="#fff" strokeWidth={2} />
                    <circle cx={cx} cy={cy} r={8} stroke={stroke} strokeOpacity={0.3} strokeWidth={1} fill="none" />
                </g>
            );
        }
        return <></>;
    };

    return { 
        data: finalData, 
        config, 
        keys: keyEntries,
        iscomparingGroups,
        lastDate,
        renderActiveDot
    };

  }, [normalizedData, selectedProductLine, selectedGroup, fixedProductLine]);

  if (data.length === 0) return null;

  return (
    <div className="space-y-6">
        {/* Filter Bar */}
        {(showTrends || showValue) && showFilters && (
            <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-4 rounded-lg border">
                 <span className="text-sm font-medium text-muted-foreground">筛选维度:</span>
            
                {!fixedProductLine && (
                    <Select value={selectedProductLine} onValueChange={(v) => {
                        setSelectedProductLine(v);
                        setSelectedGroup('all'); 
                    }}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="全部产品线" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部产品线 (总览)</SelectItem>
                            {productLines.map(pl => (
                                <SelectItem key={pl as string} value={pl as string}>{pl as string}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {(fixedProductLine || selectedProductLine !== 'all') && (
                    <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="全部群组" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">该产品线下全部群</SelectItem>
                            {groups.map(g => (
                                <SelectItem key={g as string} value={g as string}>{g as string}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                
                {(!fixedProductLine && selectedProductLine !== 'all' || selectedGroup !== 'all') && (
                    <Button variant="ghost" size="icon" onClick={() => {
                        if (!fixedProductLine) setSelectedProductLine('all');
                        setSelectedGroup('all');
                    }}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
        )}

      {showTrends && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Metric 1: Message Volume */}
            <Card>
              <CardHeader>
                <CardTitle>消息活跃趋势</CardTitle>
                <CardDescription>
                    {chartData.iscomparingGroups ? '各群组' : '各产品线'} 每日消息总量对比
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartData.config} className="aspect-auto h-[250px] w-full">
                  <LineChart data={chartData.data} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickLine={false} 
                      axisLine={false} 
                      tickMargin={8}
                      tickFormatter={(value) => value.slice(5)}
                    />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip 
                        cursor={false} 
                        content={
                            <ChartTooltipContent 
                                indicator="line" 
                                formatter={(value) => (
                                    <div className="flex min-w-[130px] items-center text-xs text-muted-foreground">
                                        {value}条
                                    </div>
                                )}
                            />
                        }
                    />
                    <ChartLegend content={<ChartLegendContent className="text-[10px] whitespace-nowrap" />} />
                    
                    {chartData.keys.map(({ safe, raw }) => (
                        <Line 
                            key={safe}
                            dataKey={`${safe}_message`}
                            name={raw as string}
                            type="monotone" 
                            stroke={`var(--color-${safe}_message)`} 
                            strokeWidth={2}
                            dot={chartData.renderActiveDot}
                            activeDot={{ r: 6 }}
                        />
                    ))}
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Metric 2: Question Volume */}
            <Card>
              <CardHeader>
                <CardTitle>提问数量趋势</CardTitle>
                <CardDescription>
                     {chartData.iscomparingGroups ? '各群组' : '各产品线'} 每日提问数量对比
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartData.config} className="aspect-auto h-[250px] w-full">
                  <LineChart data={chartData.data} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickLine={false} 
                      axisLine={false} 
                      tickMargin={8}
                      tickFormatter={(value) => value.slice(5)}
                    />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip 
                        cursor={false} 
                        content={
                            <ChartTooltipContent 
                                indicator="line" 
                                formatter={(value) => (
                                    <div className="flex min-w-[130px] items-center text-xs text-muted-foreground">
                                        {value}个
                                    </div>
                                )}
                            />
                        }
                    />
                    <ChartLegend content={<ChartLegendContent className="text-[10px] whitespace-nowrap" />} />
                    
                    {chartData.keys.map(({ safe, raw }) => (
                         <Line 
                            key={safe}
                            dataKey={`${safe}_question`}
                            name={raw as string}
                            type="monotone" 
                            stroke={`var(--color-${safe}_question)`} 
                            strokeWidth={2}
                            dot={chartData.renderActiveDot}
                            activeDot={{ r: 6 }}
                        />
                    ))}
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Metric 3: Response Time */}
            <Card>
              <CardHeader>
                <CardTitle>平均响应时长</CardTitle>
                <CardDescription>
                     {chartData.iscomparingGroups ? '各群组' : '各产品线'} 平均响应时间（分钟）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartData.config} className="aspect-auto h-[250px] w-full">
                  <LineChart data={chartData.data} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickLine={false} 
                      axisLine={false} 
                      tickMargin={8}
                      tickFormatter={(value) => value.slice(5)}
                    />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} unit="m" />
                    <ChartTooltip 
                        cursor={false} 
                        content={
                            <ChartTooltipContent 
                                indicator="line" 
                                formatter={(value) => (
                                    <div className="flex min-w-[130px] items-center text-xs text-muted-foreground">
                                        {value}分钟
                                    </div>
                                )}
                            />
                        }
                    />
                    <ChartLegend content={<ChartLegendContent className="text-[10px] whitespace-nowrap" />} />
                    
                     {chartData.keys.map(({ safe, raw }) => (
                         <Line 
                            key={safe}
                            dataKey={`${safe}_time`}
                            name={raw as string}
                            type="monotone" 
                            stroke={`var(--color-${safe}_time)`} 
                            strokeWidth={2}
                            dot={chartData.renderActiveDot}
                            activeDot={{ r: 6 }}
                        />
                    ))}
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Metric 4: Resolution Rate */}
             <Card>
              <CardHeader>
                <CardTitle>问题解决率</CardTitle>
                <CardDescription>
                     {chartData.iscomparingGroups ? '各群组' : '各产品线'} 问题解决率 (%) 对比
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartData.config} className="aspect-auto h-[250px] w-full">
                  <LineChart data={chartData.data} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickLine={false} 
                      axisLine={false} 
                      tickMargin={8}
                      tickFormatter={(value) => value.slice(5)}
                    />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} unit="%" />
                    <ChartTooltip 
                        cursor={false} 
                        content={
                            <ChartTooltipContent 
                                indicator="line" 
                                formatter={(value) => (
                                    <div className="flex min-w-[130px] items-center text-xs text-muted-foreground">
                                        {value}%
                                    </div>
                                )}
                            />
                        }
                    />
                    <ChartLegend content={<ChartLegendContent className="text-[10px] whitespace-nowrap" />} />
                    
                     {chartData.keys.map(({ safe, raw }) => (
                         <Line 
                            key={safe}
                            dataKey={`${safe}_rate`}
                            name={raw as string}
                            type="monotone" 
                            stroke={`var(--color-${safe}_rate)`} 
                            strokeWidth={2}
                            dot={chartData.renderActiveDot}
                            activeDot={{ r: 6 }}
                        />
                    ))}
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
      )}
      
      {/* Value Trend Chart (Full Width) */}
      {showValue && (
          <Card>
            <CardHeader>
                <CardTitle>价值产出趋势</CardTitle>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartData.config} className="h-[300px] w-full aspect-auto">
                    <AreaChart data={chartData.data} margin={{ left: 12, right: 12 }}>
                        <defs>
                            <linearGradient id="fillGoodNews" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-goodNews)" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="var(--color-goodNews)" stopOpacity={0.1}/>
                            </linearGradient>
                            <linearGradient id="fillKoc" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-koc)" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="var(--color-koc)" stopOpacity={0.1}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3"/>
                        <XAxis 
                            dataKey="date" 
                            tickLine={false} 
                            axisLine={false} 
                            tickMargin={8}
                            tickFormatter={(value) => value.slice(5)}
                        />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                        <ChartTooltip 
                            cursor={false} 
                            content={
                                <ChartTooltipContent 
                                    indicator="dot" 
                                    formatter={(value, name) => (
                                        <div className="flex min-w-[130px] items-center text-xs text-muted-foreground">
                                            {// @ts-ignore
                                            name === 'goodNews' || name === '好事' ? `${value}件` : `${value}人`
                                            }
                                        </div>
                                    )}
                                />
                            }
                        />
                        <ChartLegend content={<ChartLegendContent className="text-[10px] whitespace-nowrap" />} />
                        
                        <Area 
                            dataKey="goodNews" 
                            name="好事" 
                            type="monotone" 
                            fill="url(#fillGoodNews)" 
                            fillOpacity={1} 
                            stroke="var(--color-goodNews)" 
                            strokeWidth={2}
                            stackId="1" 
                        />
                        <Area 
                            dataKey="koc" 
                            name="KOC"
                            type="monotone" 
                            fill="url(#fillKoc)" 
                            fillOpacity={1} 
                            stroke="var(--color-koc)" 
                            strokeWidth={2}
                            stackId="1"
                        />
                    </AreaChart>
                </ChartContainer>
            </CardContent>
          </Card>
      )}
    </div>
  );
}
