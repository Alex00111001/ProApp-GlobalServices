const {
  auditListQuerySchema,
  bookingListQuerySchema,
  dashboardQuerySchema,
  professionalListQuerySchema,
  professionalStatusSchema,
  roleChangeSchema,
  roleDecisionSchema,
  userListQuerySchema,
  userStatusSchema,
} = require('../validators/admin.validators');
const {
  getBooking,
  getDashboard,
  getProfessional,
  getUser,
  listAuditLogs,
  listBookings,
  listProfessionals,
  listUsers,
  setProfessionalStatus,
  setUserActive,
} = require('../modules/admin/admin-read.service');
const {
  decideRoleChange,
  listRoleChangeRequests,
  listRoles,
  requestRoleChange,
} = require('../modules/identity/admin-role-change.service');
const { writeAuditLog } = require('../modules/audit/audit.service');

const handler = (work) => async (req, res, next) => {
  try {
    return await work(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.dashboard = handler(async (req, res) => res.json(await getDashboard(dashboardQuerySchema.parse(req.query))));

exports.users = handler(async (req, res) => res.json(await listUsers(userListQuerySchema.parse(req.query))));
exports.user = handler(async (req, res) => res.json({ user: await getUser(req.params.id, req) }));
exports.setUserStatus = handler(async (req, res) => {
  const input = userStatusSchema.parse(req.body);
  return res.json({ user: await setUserActive({ id: req.params.id, req, ...input }) });
});

exports.professionals = handler(async (req, res) => res.json(await listProfessionals(professionalListQuerySchema.parse(req.query))));
exports.professional = handler(async (req, res) => res.json({ professional: await getProfessional(req.params.id, req) }));
exports.setProfessionalStatus = handler(async (req, res) => {
  const input = professionalStatusSchema.parse(req.body);
  return res.json({ professional: await setProfessionalStatus({ id: req.params.id, req, ...input }) });
});

exports.bookings = handler(async (req, res) => res.json(await listBookings(bookingListQuerySchema.parse(req.query))));
exports.booking = handler(async (req, res) => res.json({ booking: await getBooking(req.params.id, req) }));

exports.auditLogs = handler(async (req, res) => {
  const result = await listAuditLogs(auditListQuerySchema.parse(req.query));
  await writeAuditLog({
    req,
    action: 'ADMIN_AUDIT_LOG_READ',
    resourceType: 'AUDIT_LOG',
    metadata: { returnedItems: result.items.length, filtersApplied: Object.keys(req.query).sort() },
  });
  return res.json(result);
});

exports.roles = handler(async (req, res) => res.json({ roles: await listRoles() }));
exports.roleChangeRequests = handler(async (req, res) => res.json({ requests: await listRoleChangeRequests() }));
exports.requestRoleChange = handler(async (req, res) => {
  const input = roleChangeSchema.parse(req.body);
  return res.status(201).json({ request: await requestRoleChange({ ...input, req }) });
});
exports.approveRoleChange = handler(async (req, res) => {
  const { reason } = roleDecisionSchema.parse(req.body);
  return res.json({ request: await decideRoleChange({ id: req.params.id, decision: 'APPROVE', reason, req }) });
});
exports.rejectRoleChange = handler(async (req, res) => {
  const { reason } = roleDecisionSchema.parse(req.body);
  return res.json({ request: await decideRoleChange({ id: req.params.id, decision: 'REJECT', reason, req }) });
});

module.exports = exports;
