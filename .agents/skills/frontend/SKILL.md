---
name: frontend
description: Build and review HomeServices customer mobile, professional mobile, and admin web experiences. Use for React Native/Expo, React/Vite, navigation, state, forms, API integration, i18n, accessibility, and frontend contracts.
---

# Frontend

Work within the product that owns the journey:

- `mobile-client`: Expo 52, React Native 0.76, React 18, Expo Router 4.
- `mobile-professional`: Expo 57, React Native 0.86, React 19, Expo Router 57.
- `admin-web`: React 19, TypeScript, Vite 8, React Router 7.

Do not align these versions opportunistically. Dependency upgrades need their own compatibility plan.

## Workflow

1. Trace the current route, state store, API client, types, loading/error/empty states, and translations.
2. Confirm the backend contract and authorization behavior before changing UI assumptions.
3. Reuse existing design tokens and components; keep platform-specific behavior isolated.
4. Validate untrusted API/form data at boundaries and avoid duplicating server policy in the client.
5. Preserve Spanish, Portuguese, and English behavior where the customer app exposes localized content.
6. Include accessibility labels, focus/order, touch targets, contrast, keyboard behavior, and resilient layouts.
7. Instrument meaningful journey events without personal or payment data.

## Security and contracts

- Store credentials only through the established secure mechanism.
- Hiding admin navigation is usability, never authorization; the backend enforces permissions.
- Never connect a frontend directly to PostgreSQL or embed server secrets.
- Add fields compatibly and handle older server/client combinations during rollout.

Verify with the product's build/typecheck/tests plus focused journey checks. Report any existing lack of test coverage rather than claiming unverified behavior.
