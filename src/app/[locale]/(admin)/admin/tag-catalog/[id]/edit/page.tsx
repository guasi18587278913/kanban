import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Empty } from '@/shared/blocks/common';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { FormCard } from '@/shared/blocks/form';
import {
  formatAliases,
  parseAliasInput,
  TAG_CATEGORY_OPTIONS,
  TAG_STATUS_OPTIONS,
} from '@/shared/lib/tag-catalog';
import {
  findTagCatalog,
  TagCatalogStatus,
  updateTagCatalog,
  UpdateTagCatalog,
} from '@/shared/models/tag-catalog';
import { Crumb } from '@/shared/types/blocks/common';
import { Form } from '@/shared/types/blocks/form';

export default async function TagCatalogEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  await requirePermission({
    code: PERMISSIONS.SETTINGS_WRITE,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const t = await getTranslations('admin.tag-catalog');

  const tag = await findTagCatalog({ id });
  if (!tag) {
    return <Empty message="Tag not found" />;
  }

  const crumbs: Crumb[] = [
    { title: t('edit.crumbs.admin'), url: '/admin' },
    { title: t('edit.crumbs.tags'), url: '/admin/tag-catalog' },
    { title: t('edit.crumbs.edit'), is_active: true },
  ];

  const form: Form = {
    fields: [
      {
        name: 'category',
        type: 'select',
        title: t('fields.category'),
        options: TAG_CATEGORY_OPTIONS,
        validation: { required: true },
      },
      {
        name: 'name',
        type: 'text',
        title: t('fields.name'),
        validation: { required: true },
      },
      {
        name: 'aliases',
        type: 'textarea',
        title: t('fields.aliases'),
        tip: '多个别名可用逗号或换行分隔',
      },
      {
        name: 'status',
        type: 'select',
        title: t('fields.status'),
        options: TAG_STATUS_OPTIONS,
      },
    ],
    data: {
      ...tag,
      aliases: formatAliases(tag.aliases),
      status: tag.status || TagCatalogStatus.ACTIVE,
    },
    submit: {
      button: {
        title: t('edit.buttons.submit'),
      },
      handler: async (data) => {
        'use server';
        const category = String(data.get('category') || '').trim();
        const name = String(data.get('name') || '').trim();
        const aliasesRaw = String(data.get('aliases') || '');
        const status = String(data.get('status') || TagCatalogStatus.ACTIVE);

        if (!category || !name) {
          throw new Error('category and name are required');
        }

        const update: UpdateTagCatalog = {
          category,
          name,
          aliases: parseAliasInput(aliasesRaw),
          status,
        };

        const result = await updateTagCatalog(tag.id, update);
        if (!result) {
          throw new Error('update tag failed');
        }

        return {
          status: 'success',
          message: 'tag updated',
          redirect_url: '/admin/tag-catalog',
        };
      },
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t('edit.title')} />
        <FormCard form={form} className="md:max-w-xl" />
      </Main>
    </>
  );
}
