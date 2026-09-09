const prisma = require('../../config/prisma');
const { writeAuditLog } = require('../audit/audit.service');
const { observeMarketOperation } = require('../observability/metrics');
const { SOURCES, validateManifest } = require('./geography-manifest');

const fail = (message, code, statusCode) => { throw Object.assign(new Error(message), { code, statusCode }); };

const importGeography = async ({ input, req, client = prisma }) => {
  const records = validateManifest(input);
  const country = await client.country.findUnique({ where: { isoAlpha2: input.countryCode } });
  if (!country) fail('Country is unavailable.', 'COUNTRY_UNAVAILABLE', 404);
  const existingImport = await client.geographyDatasetImport.findUnique({
    where: { countryId_sourceKey_sourceVersion_checksumSha256: { countryId: country.id, sourceKey: input.sourceKey, sourceVersion: input.sourceVersion, checksumSha256: input.checksumSha256 } },
  });
  if (existingImport?.status === 'COMPLETED') return existingImport;

  const importRow = existingImport || await client.geographyDatasetImport.create({
    data: {
      countryId: country.id, sourceKey: input.sourceKey, sourceUrl: input.sourceUrl,
      sourceVersion: input.sourceVersion, referenceDate: input.referenceDate, retrievedAt: input.retrievedAt,
      checksumSha256: input.checksumSha256, parserVersion: input.parserVersion, status: 'PENDING',
      requestId: req.context?.requestId, correlationId: req.context?.correlationId, traceId: req.context?.traceId,
    },
  });
  try {
    const completed = await client.$transaction(async (tx) => {
      await tx.geographyDatasetImport.update({ where: { id: importRow.id }, data: { status: 'PROCESSING', errorCategory: null } });
      const byCode = new Map();
      let insertedCount = 0;
      let updatedCount = 0;
      for (const record of records) {
        const existing = await tx.administrativeDivision.findUnique({ where: { countryId_sourceKey_canonicalCode: { countryId: country.id, sourceKey: input.sourceKey, canonicalCode: record.code } } });
        const parentId = record.parentCode ? byCode.get(record.parentCode)?.id : null;
        const data = {
          countryId: country.id, parentId, level: record.level, typeKey: record.type,
          canonicalCode: record.code, canonicalName: record.name, displayNames: record.displayNames,
          lifecycle: 'ACTIVE', sourceKey: input.sourceKey, sourceVersion: input.sourceVersion,
          lastImportId: importRow.id, deprecatedAt: null,
        };
        const division = existing
          ? await tx.administrativeDivision.update({ where: { id: existing.id }, data })
          : await tx.administrativeDivision.create({ data });
        const changed = existing && (existing.parentId !== parentId || existing.level !== record.level || existing.typeKey !== record.type || existing.canonicalName !== record.name || existing.lifecycle !== 'ACTIVE');
        if (!existing) insertedCount += 1;
        if (changed) updatedCount += 1;
        if (!existing || changed) await tx.administrativeDivisionChange.create({
          data: { importId: importRow.id, divisionId: division.id, changeType: !existing ? 'CREATED' : existing.parentId !== parentId ? 'REPARENTED' : existing.canonicalName !== record.name ? 'RENAMED' : existing.lifecycle !== 'ACTIVE' ? 'REACTIVATED' : 'CODE_CHANGED', before: existing ? JSON.parse(JSON.stringify(existing)) : undefined, after: JSON.parse(JSON.stringify(data)) },
        });
        byCode.set(record.code, division);
      }
      let deprecatedCount = 0;
      if (input.completeSnapshot) {
        const missing = await tx.administrativeDivision.findMany({ where: { countryId: country.id, sourceKey: input.sourceKey, lifecycle: 'ACTIVE', canonicalCode: { notIn: records.map((record) => record.code) } } });
        for (const division of missing) {
          await tx.administrativeDivision.update({ where: { id: division.id }, data: { lifecycle: 'DEPRECATED', deprecatedAt: new Date(), sourceVersion: input.sourceVersion, lastImportId: importRow.id } });
          await tx.administrativeDivisionChange.create({ data: { importId: importRow.id, divisionId: division.id, changeType: 'DEPRECATED', before: { lifecycle: division.lifecycle }, after: { lifecycle: 'DEPRECATED' } } });
        }
        deprecatedCount = missing.length;
      }
      return tx.geographyDatasetImport.update({ where: { id: importRow.id }, data: { status: 'COMPLETED', rowCount: records.length, insertedCount, updatedCount, deprecatedCount, completedAt: new Date(), evidence: { completeSnapshot: input.completeSnapshot, parserVersion: input.parserVersion, sourceArtifacts: input.sourceArtifacts } } });
    });
    await writeAuditLog({ req, action: 'GEOGRAPHY_DATASET_IMPORTED', resourceType: 'GEOGRAPHY_DATASET_IMPORT', resourceId: completed.id, metadata: { countryCode: input.countryCode, sourceKey: input.sourceKey, sourceVersion: input.sourceVersion, rowCount: completed.rowCount, checksumSha256: completed.checksumSha256 } });
    observeMarketOperation({ operation: 'geography_import', market: input.countryCode, outcome: 'completed', reason: input.sourceKey });
    return completed;
  } catch (error) {
    await client.geographyDatasetImport.update({ where: { id: importRow.id }, data: { status: 'FAILED', errorCategory: error.code || 'IMPORT_FAILED', completedAt: new Date() } }).catch(() => {});
    observeMarketOperation({ operation: 'geography_import', market: input.countryCode, outcome: 'failed', reason: error.code || 'import_failed' });
    throw error;
  }
};

const listGeographyImports = async ({ page, limit, client = prisma }) => {
  const [items, total] = await Promise.all([
    client.geographyDatasetImport.findMany({ include: { country: { select: { isoAlpha2: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    client.geographyDatasetImport.count(),
  ]);
  return { items, pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { SOURCES, importGeography, listGeographyImports, validateManifest };
