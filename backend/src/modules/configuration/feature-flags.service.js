const { createHash } = require('node:crypto');

const inPercentage = (flagKey, subjectId, percentage) => {
  if (percentage >= 100) return true;
  if (percentage <= 0 || !subjectId) return false;
  const digest = createHash('sha256').update(`${flagKey}:${subjectId}`).digest();
  return digest.readUInt32BE(0) % 100 < percentage;
};

const matchesRules = (key, rules = {}, context = {}) => {
  if (rules.environments?.length && !rules.environments.includes(context.environment)) return false;
  if (rules.countries?.length && !rules.countries.includes(context.country)) return false;
  if (rules.cities?.length && !rules.cities.includes(context.city)) return false;
  if (rules.cohorts?.length && !rules.cohorts.includes(context.cohort)) return false;
  return inPercentage(key, context.subjectId, rules.percentage ?? 100);
};

const isFeatureEnabled = async (key, context = {}, client) => {
  const database = client || require('../../config/prisma');
  const flag = await database.featureFlag.findUnique({ where: { key } });
  return Boolean(flag && flag.status === 'ENABLED' && matchesRules(key, flag.rules || {}, context));
};

module.exports = { inPercentage, isFeatureEnabled, matchesRules };
