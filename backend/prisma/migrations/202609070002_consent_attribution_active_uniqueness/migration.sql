-- Concurrency hardening is intentionally separate from the already rehearsed
-- F7 foundation migration. Service checks provide actionable errors; these
-- partial unique indexes close simultaneous-activation races at the database.
CREATE UNIQUE INDEX "ConsentPolicy_one_active_scope_key"
  ON "ConsentPolicy"("purpose", "countryCode", "locale")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "AttributionModel_one_active_key"
  ON "AttributionModel"("key")
  WHERE "status" = 'ACTIVE';
