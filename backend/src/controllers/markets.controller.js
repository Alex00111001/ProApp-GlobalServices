const {
  addressBody,
  divisionQuery,
  identityDocumentBody,
  marketCode,
  registrationSchemaQuery,
  serviceAreaBody,
} = require('../validators/markets.validators');
const {
  addProfessionalServiceArea,
  createAddress,
  createIdentityDocument,
  getRegistrationSchema,
  listActiveCountries,
  listActiveMarkets,
  listAddresses,
  listDivisions,
  listIdentityDocuments,
  listProfessionalServiceAreas,
} = require('../modules/markets/market.service');

const handler = (work) => async (req, res, next) => {
  try { return await work(req, res); } catch (error) { return next(error); }
};

exports.markets = handler(async (req, res) => res.json(await listActiveMarkets()));
exports.countries = handler(async (req, res) => res.json(await listActiveCountries()));
exports.registrationSchema = handler(async (req, res) => res.json(await getRegistrationSchema({ marketCode: marketCode.parse(req.params.marketCode), ...registrationSchemaQuery.parse(req.query) })));
exports.divisions = handler(async (req, res) => res.json(await listDivisions({ marketCode: marketCode.parse(req.params.marketCode), ...divisionQuery.parse(req.query) })));
exports.identityDocuments = handler(async (req, res) => res.json({ items: await listIdentityDocuments({ userId: req.user.id }) }));
exports.createIdentityDocument = handler(async (req, res) => res.status(201).json({ document: await createIdentityDocument({ userId: req.user.id, userMarketId: req.user.marketId, req, ...identityDocumentBody.parse(req.body) }) }));
exports.addresses = handler(async (req, res) => res.json({ items: await listAddresses({ userId: req.user.id }) }));
exports.createAddress = handler(async (req, res) => res.status(201).json({ address: await createAddress({ userId: req.user.id, userMarketId: req.user.marketId, input: addressBody.parse(req.body), req }) }));
exports.serviceAreas = handler(async (req, res) => res.json({ items: await listProfessionalServiceAreas({ user: req.user }) }));
exports.addServiceArea = handler(async (req, res) => res.status(201).json({ serviceArea: await addProfessionalServiceArea({ user: req.user, input: serviceAreaBody.parse(req.body), req }) }));

module.exports = exports;
