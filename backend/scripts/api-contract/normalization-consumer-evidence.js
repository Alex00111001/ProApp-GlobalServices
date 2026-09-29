const { createHash } = require('node:crypto');
const { walk } = require('./source-inventory');
const TRIM_REQUEST_EVIDENCE = Object.freeze([
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/ExperimentsContentSeoPage.tsx",
    "operation": "PATCH /api/v1/admin/experiments/{id}/status"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/MarketsPage.tsx",
    "operation": "PATCH /api/v1/admin/markets/{marketCode}/status"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/MarketsPage.tsx",
    "operation": "POST /api/v1/admin/identity/policies/{id}/review"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/MarketsPage.tsx",
    "operation": "PATCH /api/v1/admin/identity/policies/{id}/status"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/OperationsPage.tsx",
    "operation": "PATCH /api/v1/admin/operations/errors/{id}/status"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/OperationsPage.tsx",
    "operation": "PATCH /api/v1/admin/operations/incidents/{id}/status"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/OperationsPage.tsx",
    "operation": "POST /api/v1/admin/operations/incidents/{id}/comments"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/PrivacyAttributionPage.tsx",
    "operation": "POST /api/v1/admin/privacy/policies/{id}/review"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/PrivacyAttributionPage.tsx",
    "operation": "PATCH /api/v1/admin/privacy/policies/{id}/status"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/PrivacyAttributionPage.tsx",
    "operation": "PATCH /api/v1/admin/attribution/models/{id}/status"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/ProfessionalsPage.tsx",
    "operation": "PATCH /api/v1/admin/professionals/{id}/status"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/SettingsPage.tsx",
    "operation": "POST /api/v1/admin/role-change-requests/{id}/approve"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/SettingsPage.tsx",
    "operation": "POST /api/v1/admin/role-change-requests/{id}/reject"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/SupplyDemandAIPage.tsx",
    "operation": "POST /api/v1/admin/ai/executions/{id}/approvals"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/SupportPage.tsx",
    "operation": "PATCH /api/v1/admin/operations/support/cases/{id}/status"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/SupportPage.tsx",
    "operation": "PATCH /api/v1/admin/operations/support/cases/{id}/assignment"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/SupportPage.tsx",
    "operation": "POST /api/v1/admin/operations/support/cases/{id}/comments"
  },
  {
    "consumer": "Admin Web",
    "file": "admin-web/src/pages/UsersPage.tsx",
    "operation": "PATCH /api/v1/admin/users/{id}/status"
  },
  {
    "consumer": "Customer mobile",
    "file": "mobile-client/src/services/api.ts",
    "operation": "POST /api/v1/referrals/codes/{id}/revoke"
  }
]);
function normalizationConsumerSource(call, context) {
  if(call.consumer === 'Customer mobile') return require('./consumer-request-evidence').consumerMethod({method:'revokeReferralCode'}, context).source;
  const matches=[];
  walk(context.ast,node=>{if(node.type==='CallExpression' && node.callee.name==='api' && node.loc.start.line===call.line) matches.push(node);});
  if(matches.length!==1) throw new Error('Normalization consumer expression must be unique.');
  return context.text(matches[0]);
}
function normalizationRequestEvidence(call, context) {
  if(!TRIM_REQUEST_EVIDENCE.some(e=>e.file===call.file && e.operation===call.operation)) return null;
  const source=normalizationConsumerSource(call,context);
  return {status:'EXECUTABLE_REQUEST_CASES_DECLARED_NOT_GLOBAL_PARITY',sourceDigest:createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex'),scope:'REQUEST_ONLY',evidence:'backend/test/normalization-consumer.test.js'};
}
module.exports={TRIM_REQUEST_EVIDENCE,normalizationConsumerSource,normalizationRequestEvidence};
