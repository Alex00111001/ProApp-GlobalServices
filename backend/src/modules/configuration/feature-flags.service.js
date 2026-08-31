const { createHash } = require('node:crypto');
const { z } = require('zod');

const boundedValues = z.array(z.string().trim().min(1).max(128)).max(100);
const featureFlagRulesSchema = z.object({
  environments: boundedValues.optional(),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(100).optional(),
  cities: boundedValues.optional(),
  cohorts: boundedValues.optional(),
  percentage: z.number().int().min(0).max(100).optional(),
}).strict();

const inPercentage = (flagKey, subjectId, percentage) => {
  if (percentage >= 100) return true;
  if (percentage <= 0 || !subjectId) return false;
  const digest = createHash('sha256').update(`${flagKey}:${subjectId}`).digest();
  return digest.readUInt32BE(0) % 100 < percentage;
};

const matchesRules = (key, rules = {}, context = {}) => {
  const parsed = featureFlagRulesSchema.safeParse(rules || {});
  if (!parsed.success) return false;
  const validated = parsed.data;
  if (validated.environments?.length && !validated.environments.includes(context.environment)) return false;
  if (validated.countries?.length && !validated.countries.includes(context.country)) return false;
  if (validated.cities?.length && !validated.cities.includes(context.city)) return false;
  if (validated.cohorts?.length && !validated.cohorts.includes(context.cohort)) return false;
  return inPercentage(key, context.subjectId, validated.percentage ?? 100);
};

const isFeatureEnabled = async (key, context = {}, client) => {
  const database = client || require('../../config/prisma');
  const flag = await database.featureFlag.findUnique({ where: { key } });
  return Boolean(flag && flag.status === 'ENABLED' && matchesRules(key, flag.rules || {}, context));
};

module.exports = { featureFlagRulesSchema, inPercentage, isFeatureEnabled, matchesRules };
