---
name: legal-compliance
description: Translate reviewed legal and privacy requirements for Spain, Brazil, Chile, and future HomeServices markets into versioned product, consent, retention, audit, and data-control requirements. Use for privacy, terms, consent, deletion, portability, retention, or market rollout.
---

# Legal Compliance Engineering

This skill governs engineering evidence; it does not provide legal advice or invent current legal requirements. Regulations, regulator guidance, thresholds, and policy text are time-sensitive. Obtain qualified review and authoritative current sources before treating them as requirements.

## Required engineering model

- Parameterize requirements by country/market, purpose, channel, language, document/policy version, effective time, and legal-review status.
- Record exactly what a person accepted: subject, text/version identifier, locale, market, timestamp, method, and evidence integrity.
- Separate transactional communications from marketing consent and track consent history rather than overwriting it.
- Define data inventory, controller/processor roles, providers, cross-border transfers, retention, deletion/anonymization, access, correction, portability, and objection workflows.
- Preserve immutable financial/audit evidence while minimizing or anonymizing personal data where the approved policy permits.
- Apply privacy by default: minimization, purpose limitation, access controls, redaction, encryption, retention enforcement, and auditable privileged access.
- Keep child/sensitive-data and automated-decision features disabled until their explicit policy and review gates exist.

## Delivery gate

For Spain/EU, Brazil, Chile, or a new market, produce a requirement-to-control matrix with owner, source URL/version/date, legal approval, code/data control, test, evidence, retention, and rollout flag. Label unresolved legal questions as blockers; never fill them with model assumptions.
