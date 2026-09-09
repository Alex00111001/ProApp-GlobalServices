const crypto = require('node:crypto');

const SOURCES = Object.freeze({
  ES: Object.freeze({ key: 'INE_ES', hosts: new Set(['www.ine.es', 'ine.es']) }),
  BR: Object.freeze({ key: 'IBGE_DTB', hosts: new Set(['www.ibge.gov.br', 'ibge.gov.br', 'ftp.ibge.gov.br', 'geoftp.ibge.gov.br', 'servicodados.ibge.gov.br']) }),
  CL: Object.freeze({ key: 'INE_CL_SUBDERE', hosts: new Set(['www.ine.gob.cl', 'ine.gob.cl', 'www.subdere.gov.cl', 'subdere.gov.cl']) }),
});

const fail = (message, code, statusCode) => { throw Object.assign(new Error(message), { code, statusCode }); };

const digestGeographyRecords = (records) => {
  const canonical = [...records]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(({ code, name, type, level, parentCode, displayNames }) => ({
      code,
      name,
      type,
      level,
      parentCode: parentCode || null,
      displayNames: displayNames || null,
    }));
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
};

const validateManifest = (input) => {
  const expected = SOURCES[input.countryCode];
  const source = new URL(input.sourceUrl);
  if (!expected || input.sourceKey !== expected.key || source.protocol !== 'https:' || !expected.hosts.has(source.hostname)) {
    fail('Geography source is not allowlisted.', 'GEOGRAPHY_SOURCE_INVALID', 400);
  }
  for (const artifact of input.sourceArtifacts) {
    const artifactUrl = new URL(artifact.url);
    if (artifactUrl.protocol !== 'https:' || !expected.hosts.has(artifactUrl.hostname)) fail('Geography source artifact is not allowlisted.', 'GEOGRAPHY_SOURCE_INVALID', 400);
  }
  if (!input.sourceArtifacts.some((artifact) => artifact.url === input.sourceUrl)) fail('Primary geography source is absent from the artifact manifest.', 'GEOGRAPHY_MANIFEST_INVALID', 400);
  if (input.retrievedAt > new Date(Date.now() + 5 * 60_000)) fail('Geography retrieval timestamp is invalid.', 'GEOGRAPHY_MANIFEST_INVALID', 400);
  if (digestGeographyRecords(input.records) !== input.checksumSha256) fail('Geography checksum does not match normalized records.', 'GEOGRAPHY_CHECKSUM_MISMATCH', 400);
  const codes = new Set();
  const ordered = [...input.records].sort((a, b) => a.level - b.level || a.code.localeCompare(b.code));
  for (const record of ordered) {
    if (codes.has(record.code)) fail('Geography dataset contains duplicate codes.', 'GEOGRAPHY_DUPLICATE_CODE', 400);
    if (record.level === 1 && record.parentCode) fail('Root division cannot have a parent.', 'GEOGRAPHY_PARENT_INVALID', 400);
    if (record.level > 1 && (!record.parentCode || !codes.has(record.parentCode))) fail('Geography parent must precede its child.', 'GEOGRAPHY_PARENT_INVALID', 400);
    codes.add(record.code);
  }
  return ordered;
};

module.exports = { SOURCES, digestGeographyRecords, validateManifest };
