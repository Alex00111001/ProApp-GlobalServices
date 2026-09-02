const {
  errorListQuerySchema,
  alertListQuerySchema,
  errorStatusSchema,
  healthSnapshotQuerySchema,
  idSchema,
  incidentCommentSchema,
  incidentListQuerySchema,
  incidentStatusSchema,
  integrationListQuerySchema,
  jobListQuerySchema,
  supportCaseAssignmentSchema,
  supportCaseCommentSchema,
  supportCaseCreateSchema,
  supportCaseListQuerySchema,
  supportCaseStatusSchema,
} = require('../validators/admin-operations.validators');
const {
  getErrorGroup,
  getFinancialMonitoring,
  getIncident,
  getOperationsOverview,
  listAlertDeliveries,
  listErrorGroups,
  listHealthSnapshots,
  listIncidents,
  listIntegrations,
  listJobs,
} = require('../modules/admin/operations-read.service');
const { getReadiness } = require('../modules/observability/health.service');
const {
  addIncidentComment,
  transitionErrorGroup,
  transitionIncident,
} = require('../modules/observability/incident-lifecycle.service');
const { writeAuditLog } = require('../modules/audit/audit.service');
const prisma = require('../config/prisma');
const {
  addSupportComment,
  assignSupportCase,
  createSupportCase,
  getSupportCase,
  listSupportCases,
  listSupportOperators,
  transitionSupportCase,
} = require('../modules/admin/support-case.service');

const handler = (work) => async (req, res, next) => {
  try {
    return await work(req, res);
  } catch (error) {
    return next(error);
  }
};
const notFound = (code, message) => Object.assign(new Error(message), { statusCode: 404, code });
const auditRead = (req, action, resourceType, resourceId, metadata) => writeAuditLog({
  req,
  action,
  resourceType,
  resourceId,
  metadata,
});

exports.overview = handler(async (req, res) => res.json(await getOperationsOverview()));
exports.health = handler(async (req, res) => {
  const result = await getReadiness(prisma, { persist: true });
  return res.status(result.status === 'OUTAGE' ? 503 : 200).json(result);
});
exports.healthSnapshots = handler(async (req, res) => res.json(await listHealthSnapshots(healthSnapshotQuerySchema.parse(req.query))));

exports.errors = handler(async (req, res) => res.json(await listErrorGroups(errorListQuerySchema.parse(req.query))));
exports.error = handler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const errorGroup = await getErrorGroup(id);
  if (!errorGroup) throw notFound('ERROR_GROUP_NOT_FOUND', 'Error group was not found.');
  await auditRead(req, 'ADMIN_ERROR_GROUP_READ', 'ERROR_GROUP', id, { occurrencesReturned: errorGroup.events.length });
  return res.json({ errorGroup });
});
exports.setErrorStatus = handler(async (req, res) => {
  const input = errorStatusSchema.parse(req.body);
  return res.json(await transitionErrorGroup({
    errorGroupId: idSchema.parse(req.params.id),
    toStatus: input.status,
    actorId: req.user.id,
    reason: input.reason,
    context: req.context,
  }));
});

exports.incidents = handler(async (req, res) => res.json(await listIncidents(incidentListQuerySchema.parse(req.query))));
exports.incident = handler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const incident = await getIncident(id);
  if (!incident) throw notFound('INCIDENT_NOT_FOUND', 'Incident was not found.');
  await auditRead(req, 'ADMIN_INCIDENT_READ', 'INCIDENT', id, { eventsReturned: incident.events.length, commentsReturned: incident.comments.length });
  return res.json({ incident });
});
exports.setIncidentStatus = handler(async (req, res) => {
  const input = incidentStatusSchema.parse(req.body);
  return res.json(await transitionIncident({
    incidentId: idSchema.parse(req.params.id),
    toStatus: input.status,
    actorId: req.user.id,
    reason: input.reason,
    context: req.context,
  }));
});
exports.addIncidentComment = handler(async (req, res) => {
  const input = incidentCommentSchema.parse(req.body);
  const comment = await addIncidentComment({
    incidentId: idSchema.parse(req.params.id),
    actorId: req.user.id,
    body: input.body,
    context: req.context,
  });
  return res.status(201).json({ comment });
});

exports.jobs = handler(async (req, res) => res.json(await listJobs(jobListQuerySchema.parse(req.query))));
exports.integrations = handler(async (req, res) => res.json(await listIntegrations(integrationListQuerySchema.parse(req.query))));
exports.alerts = handler(async (req, res) => res.json(await listAlertDeliveries(alertListQuerySchema.parse(req.query))));
exports.financialMonitoring = handler(async (req, res) => {
  const result = await getFinancialMonitoring();
  await auditRead(req, 'ADMIN_FINANCIAL_MONITORING_READ', 'FINANCIAL_MONITORING', null, { readOnly: true });
  return res.json(result);
});

exports.supportCases = handler(async (req, res) => res.json(await listSupportCases(supportCaseListQuerySchema.parse(req.query))));
exports.supportCase = handler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const supportCase = await getSupportCase(id);
  if (!supportCase) throw notFound('SUPPORT_CASE_NOT_FOUND', 'Support case was not found.');
  await auditRead(req, 'ADMIN_SUPPORT_CASE_READ', 'SUPPORT_CASE', id, { commentsReturned: supportCase.comments.length, eventsReturned: supportCase.events.length });
  return res.json({ supportCase });
});
exports.createSupportCase = handler(async (req, res) => res.status(201).json({ supportCase: await createSupportCase({ ...supportCaseCreateSchema.parse(req.body), actorId: req.user.id, context: req.context }) }));
exports.setSupportCaseStatus = handler(async (req, res) => {
  const input = supportCaseStatusSchema.parse(req.body);
  return res.json(await transitionSupportCase({ id: idSchema.parse(req.params.id), toStatus: input.status, actorId: req.user.id, reason: input.reason, context: req.context }));
});
exports.assignSupportCase = handler(async (req, res) => {
  const input = supportCaseAssignmentSchema.parse(req.body);
  return res.json(await assignSupportCase({ id: idSchema.parse(req.params.id), actorId: req.user.id, context: req.context, ...input }));
});
exports.addSupportComment = handler(async (req, res) => {
  const input = supportCaseCommentSchema.parse(req.body);
  return res.status(201).json({ comment: await addSupportComment({ id: idSchema.parse(req.params.id), actorId: req.user.id, context: req.context, ...input }) });
});
exports.supportOperators = handler(async (req, res) => res.json({ operators: await listSupportOperators() }));

module.exports = exports;
