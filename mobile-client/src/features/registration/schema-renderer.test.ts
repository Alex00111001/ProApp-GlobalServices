/// <reference types="jest" />

import { orderedDivisionIds, registrationSections } from './schema-renderer';
import type { RegistrationSchema } from '../../services/api';

const schema: RegistrationSchema = {
  market: { code: 'ZA-B2B', countryCode: 'ZA', status: 'ACTIVE', currencyCode: 'ZAR', defaultLocale: 'en-ZA', supportedLocales: ['en-ZA'], capabilities: { registration: true } },
  actorType: 'CLIENT', policyVersion: 7, schemaVersion: 'market-policy:ZA-B2B:7:abcdef123456', locale: 'en-ZA',
  identitySelection: 'ONE_OF', identityDocuments: [{ type: 'NATIONAL_ID', aliases: [], labelKey: 'identity.national', required: true, constraints: { maxLength: 32 } }],
  geography: { levels: [{ type: 'PROVINCE', level: 1, required: true }, { type: 'DISTRICT', level: 2, required: true }, { type: 'MUNICIPALITY', level: 3, required: true }] },
  address: { fields: [{ key: 'line1', required: true, maxLength: 200 }, { key: 'postalCode', required: false, maxLength: 16 }], coordinates: 'OPTIONAL' },
  capabilities: { registration: true },
};

describe('server-driven registration rendering', () => {
  it('derives arbitrary market sections and hierarchy order only from the server schema', () => {
    expect(registrationSections(schema)).toEqual([
      { key: 'identity', fields: [{ key: 'NATIONAL_ID', required: true }] },
      { key: 'address', fields: [{ key: 'line1', required: true }, { key: 'postalCode', required: false }] },
      { key: 'geography', fields: [{ key: 'PROVINCE', required: true }, { key: 'DISTRICT', required: true }, { key: 'MUNICIPALITY', required: true }] },
    ]);
    const selected = {
      3: { id: 'municipality', parentId: 'district', level: 3, typeKey: 'MUNICIPALITY', canonicalCode: '003', canonicalName: 'Municipality' },
      1: { id: 'province', parentId: null, level: 1, typeKey: 'PROVINCE', canonicalCode: '001', canonicalName: 'Province' },
      2: { id: 'district', parentId: 'province', level: 2, typeKey: 'DISTRICT', canonicalCode: '002', canonicalName: 'District' },
    };
    expect(orderedDivisionIds(schema, selected)).toEqual(['province', 'district', 'municipality']);
  });
});
