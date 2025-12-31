import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { TableCard } from '@/shared/blocks/table';
import { TAG_CATEGORY_LABELS, TAG_STATUS_LABELS } from '@/shared/lib/tag-catalog';
import {
  getTagCatalogCount,
  getTagCatalogs,
  TagCatalogStatus,
} from '@/shared/models/tag-catalog';
import { Button, Crumb } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';

export default async function TagCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: number; pageSize?: number; keyword?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission({
    code: PERMISSIONS.SETTINGS_READ,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const t = await getTranslations('admin.tag-catalog');

  const { page: pageNum, pageSize, keyword } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 50;

  const crumbs: Crumb[] = [
    { title: t('list.crumbs.admin'), url: '/admin' },
    { title: t('list.crumbs.tags'), is_active: true },
  ];

  const total = await getTagCatalogCount({
    keyword,
  });
  const data = await getTagCatalogs({
    page,
    limit,
    keyword,
  });

  const table: Table = {
    columns: [
      { name: 'categoryLabel', title: t('fields.category') },
      { name: 'name', title: t('fields.name') },
      { name: 'aliasesText', title: t('fields.aliases') },
      {
        name: 'statusLabel',
        title: t('fields.status'),
        type: 'label',
        metadata: { variant: 'outline' },
      },
      { name: 'createdAt', title: t('fields.created_at'), type: 'time' },
      { name: 'updatedAt', title: t('fields.updated_at'), type: 'time' },
      {
        name: 'action',
        title: '',
        type: 'dropdown',
        callback: (item: any) => [
          {
            id: 'edit',
            title: t('list.buttons.edit'),
            icon: 'RiEditLine',
            url: `/admin/tag-catalog/${item.id}/edit`,
          },
        ],
      },
    ],
    actions: [
      {
        id: 'edit',
        title: t('list.buttons.edit'),
        icon: 'RiEditLine',
        url: '/admin/tag-catalog/[id]/edit',
      },
    ],
    data: data.map((item) => ({
      ...item,
      categoryLabel: TAG_CATEGORY_LABELS[item.category] || item.category,
      aliasesText: (item.aliases || []).join(', '),
      statusLabel: TAG_STATUS_LABELS[item.status || TagCatalogStatus.ACTIVE] || item.status,
    })),
    pagination: {
      total,
      page,
      limit,
    },
  };

  const actions: Button[] = [
    {
      id: 'add',
      title: t('list.buttons.add'),
      icon: 'RiAddLine',
      url: '/admin/tag-catalog/add',
    },
  ];

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t('list.title')} actions={actions} />
        <TableCard table={table} />
      </Main>
    </>
  );
}
