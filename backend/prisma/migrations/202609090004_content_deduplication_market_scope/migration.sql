-- Content similarity is a market/editorial concern. A digest-only partial unique
-- index incorrectly made equal approved copy mutually exclusive across markets.
ALTER TABLE "ContentVersion" ADD COLUMN IF NOT EXISTS "marketId" TEXT;
ALTER TABLE "ContentVersion"
  ALTER COLUMN "marketId" TYPE TEXT USING "marketId"::TEXT;

UPDATE "ContentVersion" AS version
SET "marketId" = entry."marketId"
FROM "ContentEntry" AS entry
WHERE version."entryId" = entry."id";

ALTER TABLE "ContentVersion" ALTER COLUMN "marketId" SET NOT NULL;
ALTER TABLE "ContentVersion"
  ADD CONSTRAINT "ContentVersion_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "ContentVersion_one_indexable_digest";
CREATE UNIQUE INDEX "ContentVersion_one_indexable_market_locale_digest"
  ON "ContentVersion" ("marketId", "locale", "contentDigest")
  WHERE "indexable" = true AND "status" IN ('APPROVED', 'SCHEDULED', 'PUBLISHED');

CREATE INDEX "ContentVersion_marketId_locale_contentDigest_idx"
  ON "ContentVersion" ("marketId", "locale", "contentDigest");
