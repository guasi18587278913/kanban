import { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { LocaleDetector } from '@/shared/blocks/common';
import { DashboardLayout } from '@/shared/blocks/dashboard/layout';

export default async function CommunityLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Explicitly NO auth check here

  return (
    <DashboardLayout sidebar={null}>
      <LocaleDetector />
      {children}
    </DashboardLayout>
  );
}
