const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/admin-v1.controller');
const authController = require('../controllers/admin-auth.controller');
const operationsController = require('../controllers/admin-operations.controller');
const growthController = require('../controllers/admin-growth.controller');
const privacyController = require('../controllers/admin-privacy.controller');
const referralsController = require('../controllers/admin-referrals.controller');
const automationController = require('../controllers/admin-automation.controller');
const marketsController = require('../controllers/admin-markets.controller');
const f9Controller = require('../controllers/admin-f9.controller');
const { authenticateAdmin } = require('../middleware/authenticate-admin');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');
const { metricsHandler } = require('../modules/observability/metrics');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many administrative authentication attempts.',
    code: 'ADMIN_AUTH_RATE_LIMITED',
    correlationId: req.context?.correlationId,
  }),
});

router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/refresh', authLimiter, authController.refresh);

router.use(authenticateAdmin);
router.get('/auth/me', authController.me);
router.post('/auth/logout', authController.logout);
router.get('/auth/sessions', authController.listSessions);
router.post('/auth/sessions/:id/revoke', requirePermission(PERMISSIONS.SESSIONS_MANAGE), authController.revokeSession);

router.get('/dashboard', requirePermission(PERMISSIONS.DASHBOARD_READ), controller.dashboard);

router.get('/users', requirePermission(PERMISSIONS.USERS_READ), controller.users);
router.get('/users/:id', requirePermission(PERMISSIONS.USERS_PII_READ), controller.user);
router.patch('/users/:id/status', requirePermission(PERMISSIONS.USERS_MANAGE), controller.setUserStatus);

router.get('/professionals', requirePermission(PERMISSIONS.PROFESSIONALS_READ), controller.professionals);
router.get(
  '/professionals/:id',
  requirePermission(PERMISSIONS.PROFESSIONALS_READ),
  requirePermission(PERMISSIONS.USERS_PII_READ),
  controller.professional
);
router.patch('/professionals/:id/status', requirePermission(PERMISSIONS.PROFESSIONALS_MANAGE), controller.setProfessionalStatus);

router.get('/bookings', requirePermission(PERMISSIONS.BOOKINGS_READ), controller.bookings);
router.get(
  '/bookings/:id',
  requirePermission(PERMISSIONS.BOOKINGS_READ),
  requirePermission(PERMISSIONS.USERS_PII_READ),
  controller.booking
);

router.get('/growth/overview', requirePermission(PERMISSIONS.MARKETING_READ), growthController.overview);
router.get('/growth/funnel', requirePermission(PERMISSIONS.MARKETING_READ), growthController.funnel);
router.get('/growth/campaigns', requirePermission(PERMISSIONS.MARKETING_READ), growthController.campaigns);
router.post('/growth/campaigns', requirePermission(PERMISSIONS.MARKETING_MANAGE), growthController.createCampaign);
router.patch('/growth/campaigns/:id', requirePermission(PERMISSIONS.MARKETING_MANAGE), growthController.updateCampaign);
router.patch('/growth/campaigns/:id/status', requirePermission(PERMISSIONS.MARKETING_MANAGE), growthController.setCampaignStatus);
router.get('/growth/leads', requirePermission(PERMISSIONS.MARKETING_READ), growthController.leads);
router.get('/growth/conversions', requirePermission(PERMISSIONS.MARKETING_READ), growthController.conversions);

router.get('/privacy/policies', requirePermission(PERMISSIONS.PRIVACY_POLICY_READ), privacyController.policies);
router.post('/privacy/policies', requirePermission(PERMISSIONS.PRIVACY_POLICY_MANAGE), privacyController.createPolicy);
router.patch('/privacy/policies/:id', requirePermission(PERMISSIONS.PRIVACY_POLICY_MANAGE), privacyController.updatePolicy);
router.post('/privacy/policies/:id/review', requirePermission(PERMISSIONS.PRIVACY_POLICY_MANAGE), privacyController.reviewPolicy);
router.patch('/privacy/policies/:id/status', requirePermission(PERMISSIONS.PRIVACY_POLICY_MANAGE), privacyController.setPolicyStatus);
router.get('/privacy/consents', requirePermission(PERMISSIONS.PRIVACY_CONSENT_READ), privacyController.consentHistory);
router.get('/privacy/withdrawals', requirePermission(PERMISSIONS.PRIVACY_CONSENT_READ), privacyController.withdrawals);
router.get('/privacy/touchpoints', requirePermission(PERMISSIONS.TOUCHPOINTS_READ), privacyController.touchpoints);
router.get('/attribution/models', requirePermission(PERMISSIONS.ATTRIBUTION_READ), privacyController.models);
router.post('/attribution/models', requirePermission(PERMISSIONS.ATTRIBUTION_MANAGE), privacyController.createModel);
router.patch('/attribution/models/:id', requirePermission(PERMISSIONS.ATTRIBUTION_MANAGE), privacyController.updateModel);
router.patch('/attribution/models/:id/status', requirePermission(PERMISSIONS.ATTRIBUTION_MANAGE), privacyController.setModelStatus);
router.get('/attribution/results', requirePermission(PERMISSIONS.ATTRIBUTION_READ), privacyController.attributions);
router.post('/attribution/conversions/:id/calculate', requirePermission(PERMISSIONS.ATTRIBUTION_MANAGE), privacyController.calculate);

router.get('/referrals/programs', requirePermission(PERMISSIONS.REFERRALS_READ), referralsController.programs);
router.post('/referrals/programs', requirePermission(PERMISSIONS.REFERRALS_MANAGE), referralsController.createProgram);
router.post('/referrals/programs/:id/versions', requirePermission(PERMISSIONS.REFERRALS_MANAGE), referralsController.createVersion);
router.patch('/referrals/programs/:id/status', requirePermission(PERMISSIONS.REFERRALS_MANAGE), referralsController.setStatus);
router.get('/referrals/codes', requirePermission(PERMISSIONS.REFERRALS_READ), referralsController.codes);
router.get('/referrals/referrals', requirePermission(PERMISSIONS.REFERRALS_READ), referralsController.referrals);
router.get('/referrals/conversions', requirePermission(PERMISSIONS.REFERRALS_READ), referralsController.conversions);
router.get('/referrals/rewards', requirePermission(PERMISSIONS.REFERRAL_REWARDS_READ), referralsController.rewards);
router.patch('/referrals/rewards/:id/status', requirePermission(PERMISSIONS.REFERRAL_REWARDS_MANAGE), referralsController.setRewardStatus);

router.get('/automation/definitions', requirePermission(PERMISSIONS.AUTOMATION_READ), automationController.definitions);
router.post('/automation/definitions', requirePermission(PERMISSIONS.AUTOMATION_MANAGE), automationController.createDefinition);
router.post('/automation/definitions/:id/versions', requirePermission(PERMISSIONS.AUTOMATION_MANAGE), automationController.createVersion);
router.patch('/automation/definitions/:id/status', requirePermission(PERMISSIONS.AUTOMATION_ACTIVATE), automationController.setStatus);
router.get('/automation/executions', requirePermission(PERMISSIONS.AUTOMATION_EXECUTION_READ), automationController.executions);
router.get('/automation/dead-letter', requirePermission(PERMISSIONS.AUTOMATION_EXECUTION_READ), automationController.deadLetter);

router.get('/markets', requirePermission(PERMISSIONS.MARKETS_READ), marketsController.markets);
router.patch('/markets/:marketCode/status', requirePermission(PERMISSIONS.MARKETS_MANAGE), marketsController.setStatus);
router.get('/geography/imports', requirePermission(PERMISSIONS.GEOGRAPHY_READ), marketsController.imports);
router.post('/geography/imports', requirePermission(PERMISSIONS.GEOGRAPHY_MANAGE), marketsController.importGeography);
router.get('/geography/divisions', requirePermission(PERMISSIONS.GEOGRAPHY_READ), marketsController.divisions);
router.get('/identity/policies', requirePermission(PERMISSIONS.IDENTITY_POLICY_READ), marketsController.identityPolicies);
router.post('/identity/policies/:id/review', requirePermission(PERMISSIONS.IDENTITY_POLICY_MANAGE), marketsController.reviewIdentityPolicy);
router.patch('/identity/policies/:id/status', requirePermission(PERMISSIONS.IDENTITY_POLICY_MANAGE), marketsController.setIdentityPolicyStatus);
router.get('/identity/documents', requirePermission(PERMISSIONS.IDENTITY_DOCUMENTS_READ_MASKED), marketsController.identityDocuments);

router.get('/experiments', requirePermission(PERMISSIONS.EXPERIMENTS_READ), f9Controller.experiments);
router.post('/experiments', requirePermission(PERMISSIONS.EXPERIMENTS_MANAGE), f9Controller.createExperiment);
router.post('/experiments/:id/versions', requirePermission(PERMISSIONS.EXPERIMENTS_MANAGE), f9Controller.createExperimentVersion);
router.patch('/experiments/:id/status', requirePermission(PERMISSIONS.EXPERIMENTS_ACTIVATE), f9Controller.setExperimentStatus);
router.post('/experiments/:id/results', requirePermission(PERMISSIONS.EXPERIMENTS_RESULTS_READ), f9Controller.results);
router.get('/content', requirePermission(PERMISSIONS.CONTENT_READ), f9Controller.content);
router.post('/content', requirePermission(PERMISSIONS.CONTENT_MANAGE), f9Controller.createContent);
router.post('/content/:id/versions', requirePermission(PERMISSIONS.CONTENT_MANAGE), f9Controller.createContentVersion);
router.post('/content/versions/:id/submit', requirePermission(PERMISSIONS.CONTENT_MANAGE), f9Controller.submitContent);
router.post('/content/versions/:id/review', requirePermission(PERMISSIONS.CONTENT_REVIEW), f9Controller.reviewContent);
router.post('/content/versions/:id/publish', requirePermission(PERMISSIONS.CONTENT_PUBLISH), f9Controller.publishContent);
router.post('/content/publications/:id/retire', requirePermission(PERMISSIONS.CONTENT_PUBLISH), f9Controller.retireContent);
router.get('/seo/redirects', requirePermission(PERMISSIONS.SEO_READ), f9Controller.redirects);
router.post('/seo/redirects', requirePermission(PERMISSIONS.SEO_MANAGE), f9Controller.createRedirect);

router.get('/audit', requirePermission(PERMISSIONS.AUDIT_READ), controller.auditLogs);
router.get('/roles', requirePermission(PERMISSIONS.ROLES_READ), controller.roles);
router.get('/role-change-requests', requirePermission(PERMISSIONS.ROLES_MANAGE), controller.roleChangeRequests);
router.post('/role-change-requests', requirePermission(PERMISSIONS.ROLES_MANAGE), controller.requestRoleChange);
router.post('/role-change-requests/:id/approve', requirePermission(PERMISSIONS.ROLES_MANAGE), controller.approveRoleChange);
router.post('/role-change-requests/:id/reject', requirePermission(PERMISSIONS.ROLES_MANAGE), controller.rejectRoleChange);

router.get('/operations/overview', requirePermission(PERMISSIONS.OPERATIONS_READ), operationsController.overview);
router.get('/operations/metrics', requirePermission(PERMISSIONS.OPERATIONS_READ), metricsHandler);
router.get('/operations/health', requirePermission(PERMISSIONS.HEALTH_READ), operationsController.health);
router.get('/operations/health/snapshots', requirePermission(PERMISSIONS.HEALTH_READ), operationsController.healthSnapshots);
router.get('/operations/errors', requirePermission(PERMISSIONS.ERRORS_READ), operationsController.errors);
router.get('/operations/errors/:id', requirePermission(PERMISSIONS.ERRORS_READ), operationsController.error);
router.patch('/operations/errors/:id/status', requirePermission(PERMISSIONS.ERRORS_MANAGE), operationsController.setErrorStatus);
router.get('/operations/incidents', requirePermission(PERMISSIONS.INCIDENTS_READ), operationsController.incidents);
router.get('/operations/incidents/:id', requirePermission(PERMISSIONS.INCIDENTS_READ), operationsController.incident);
router.patch('/operations/incidents/:id/status', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), operationsController.setIncidentStatus);
router.post('/operations/incidents/:id/comments', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), operationsController.addIncidentComment);
router.get('/operations/jobs', requirePermission(PERMISSIONS.JOBS_READ), operationsController.jobs);
router.get('/operations/integrations', requirePermission(PERMISSIONS.INTEGRATIONS_READ), operationsController.integrations);
router.get('/operations/alerts', requirePermission(PERMISSIONS.ALERTS_READ), operationsController.alerts);
router.get('/operations/financial-monitoring', requirePermission(PERMISSIONS.FINANCIAL_MONITORING_READ), operationsController.financialMonitoring);
router.get('/operations/support/operators', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.supportOperators);
router.get('/operations/support/cases', requirePermission(PERMISSIONS.SUPPORT_READ), operationsController.supportCases);
router.post('/operations/support/cases', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.createSupportCase);
router.get('/operations/support/cases/:id', requirePermission(PERMISSIONS.SUPPORT_READ), operationsController.supportCase);
router.patch('/operations/support/cases/:id/status', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.setSupportCaseStatus);
router.patch('/operations/support/cases/:id/assignment', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.assignSupportCase);
router.post('/operations/support/cases/:id/comments', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.addSupportComment);

module.exports = router;
