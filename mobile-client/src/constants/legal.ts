export const LEGAL_DOCUMENT_VERSION = process.env.EXPO_PUBLIC_LEGAL_DOCUMENT_VERSION || (__DEV__ ? '2026-08-30' : '');
if (!LEGAL_DOCUMENT_VERSION) throw new Error('EXPO_PUBLIC_LEGAL_DOCUMENT_VERSION must be configured for production builds');
