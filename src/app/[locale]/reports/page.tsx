'use client';

import { MonitoringView } from '../community/_components/monitoring-view';

export default function ReportsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MonitoringView title="数据看板" />
    </div>
  );
}
