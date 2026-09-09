const {
  adminDivisionQuery,
  adminIdentityDocumentQuery,
  adminListQuery,
  geographyImportBody,
  identityPolicyListQuery,
  identityPolicyReviewBody,
  identityPolicyStatusBody,
  marketCode,
  marketStatusBody,
  uuid,
} = require('../validators/markets.validators');
const { importGeography, listGeographyImports } = require('../modules/markets/geography-import.service');
const {
  listAdminDivisions,
  listAdminIdentityDocuments,
  listAdminMarkets,
  listIdentityPolicies,
  reviewIdentityPolicy,
  setIdentityPolicyStatus,
  setMarketStatus,
} = require('../modules/markets/market.service');

const handler = (work) => async (req, res, next) => {
  try { return await work(req, res); } catch (error) { return next(error); }
};

exports.markets = handler(async (req, res) => res.json(await listAdminMarkets(adminListQuery.parse(req.query))));
exports.setStatus = handler(async (req, res) => res.json({ market: await setMarketStatus({ marketCode: marketCode.parse(req.params.marketCode), req, ...marketStatusBody.parse(req.body) }) }));
exports.imports = handler(async (req, res) => res.json(await listGeographyImports(adminListQuery.pick({ page: true, limit: true }).parse(req.query))));
exports.importGeography = handler(async (req, res) => res.status(201).json({ import: await importGeography({ input: geographyImportBody.parse(req.body), req }) }));
exports.divisions = handler(async (req, res) => res.json(await listAdminDivisions(adminDivisionQuery.parse(req.query))));
exports.identityPolicies = handler(async (req, res) => res.json(await listIdentityPolicies(identityPolicyListQuery.parse(req.query))));
exports.reviewIdentityPolicy = handler(async (req, res) => res.json({ policy: await reviewIdentityPolicy({ policyId: uuid.parse(req.params.id), actorId: req.user.id, req, ...identityPolicyReviewBody.parse(req.body) }) }));
exports.setIdentityPolicyStatus = handler(async (req, res) => res.json({ policy: await setIdentityPolicyStatus({ policyId: uuid.parse(req.params.id), actorId: req.user.id, req, ...identityPolicyStatusBody.parse(req.body) }) }));
exports.identityDocuments = handler(async (req, res) => res.json(await listAdminIdentityDocuments({ ...adminIdentityDocumentQuery.parse(req.query), req })));

module.exports = exports;
