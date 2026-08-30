import type { TFunction } from 'i18next';

type CategoryLike = {
  name?: string;
  slug?: string;
};

const normalizeKey = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const translateCategory = (t: TFunction, category?: CategoryLike | null) => {
  if (!category) return '';

  const fallback = category.name || category.slug || '';
  const key = normalizeKey(category.slug || category.name || '');

  return key ? t(`categories.${key}`, { defaultValue: fallback }) : fallback;
};
