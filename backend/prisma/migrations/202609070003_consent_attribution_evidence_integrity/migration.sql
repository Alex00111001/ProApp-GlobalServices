-- Defense in depth for privileged/direct database writes. Application services
-- already enforce these invariants; triggers prevent mismatched immutable
-- evidence from entering the system of record through another writer.
CREATE OR REPLACE FUNCTION homeservices_validate_consent_decision_policy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ConsentPolicy" policy
    WHERE policy."id" = NEW."policyId"
      AND policy."version" = NEW."policyVersion"
      AND policy."purpose" = NEW."purpose"
  ) THEN
    RAISE EXCEPTION 'Consent decision does not match its policy purpose/version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ConsentDecision_policy_integrity"
BEFORE INSERT ON "ConsentDecision"
FOR EACH ROW EXECUTE FUNCTION homeservices_validate_consent_decision_policy();

CREATE OR REPLACE FUNCTION homeservices_validate_touchpoint_consent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  policy_mode TEXT;
BEGIN
  SELECT policy."enforcementMode"::TEXT
    INTO policy_mode
    FROM "ConsentPolicy" policy
   WHERE policy."id" = NEW."policyId"
     AND policy."version" = NEW."policyVersion";

  IF policy_mode IS NULL THEN
    RAISE EXCEPTION 'Touchpoint policy does not exist' USING ERRCODE = '23514';
  END IF;

  IF policy_mode = 'EXPLICIT_GRANT' AND NEW."consentDecisionId" IS NULL THEN
    RAISE EXCEPTION 'Touchpoint requires explicit consent evidence' USING ERRCODE = '23514';
  END IF;

  IF NEW."consentDecisionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM "ConsentDecision" decision
      JOIN "ConsentPolicy" policy
        ON policy."id" = decision."policyId"
       AND policy."version" = decision."policyVersion"
     WHERE decision."id" = NEW."consentDecisionId"
       AND decision."policyId" = NEW."policyId"
       AND decision."policyVersion" = NEW."policyVersion"
       AND decision."subjectKey" = NEW."subjectKey"
       AND decision."decision" = 'GRANTED'
       AND decision."occurredAt" <= NEW."occurredAt"
       AND decision."purpose" = policy."purpose"
  ) THEN
    RAISE EXCEPTION 'Touchpoint consent evidence is mismatched, inactive, or retroactive'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Touchpoint_consent_integrity"
BEFORE INSERT ON "Touchpoint"
FOR EACH ROW EXECUTE FUNCTION homeservices_validate_touchpoint_consent();
