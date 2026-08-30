ALTER TABLE "User"
  ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'ES',
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsVersion" TEXT,
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyVersion" TEXT,
  ADD COLUMN "marketingConsentAt" TIMESTAMP(3),
  ADD COLUMN "registrationLocale" TEXT;
