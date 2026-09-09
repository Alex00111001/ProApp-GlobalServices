import type { DivisionOption, RegistrationSchema } from '../../services/api';

export type RegistrationSection = {
  key: 'identity' | 'address' | 'geography';
  fields: Array<{ key: string; required: boolean }>;
};

export const registrationSections = (schema: RegistrationSchema): RegistrationSection[] => [
  {
    key: 'identity',
    fields: schema.identityDocuments.map((document) => ({ key: document.type, required: document.required })),
  },
  {
    key: 'address',
    fields: schema.address.fields.map((field) => ({ key: field.key, required: field.required })),
  },
  {
    key: 'geography',
    fields: schema.geography.levels.map((level) => ({ key: level.type, required: level.required })),
  },
];

export const orderedDivisionIds = (schema: RegistrationSchema, selected: Record<number, DivisionOption>) =>
  schema.geography.levels.map((level) => selected[level.level]?.id).filter((id): id is string => Boolean(id));
