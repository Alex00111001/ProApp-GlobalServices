const { operationalError } = require('../privacy/privacy-utils');

const PROVIDER_ENDPOINTS = Object.freeze({
  OPENAI_RESPONSES: 'https://api.openai.com/v1/responses',
  ANTHROPIC_MESSAGES: 'https://api.anthropic.com/v1/messages',
});

const resolveSecret = (name, source = process.env) => {
  if (!/^AI_PROVIDER_[A-Z0-9_]{3,80}$/.test(name || '')) throw operationalError('Provider secret reference is invalid.', 'AI_PROVIDER_SECRET_REFERENCE_INVALID', 500);
  const value = source[name];
  if (!value) throw operationalError('Provider credentials are unavailable.', 'AI_PROVIDER_CREDENTIALS_UNAVAILABLE', 503);
  return value;
};

const parseJsonText = (text) => {
  try { return JSON.parse(text); } catch { throw operationalError('Provider returned malformed structured output.', 'AI_PROVIDER_OUTPUT_INVALID', 422); }
};

const requestJson = async ({ endpoint, headers, body, timeoutMs, fetchImpl = fetch }) => {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref?.();
  try {
    const response = await fetchImpl(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw operationalError('AI provider request failed.', retryable ? 'AI_PROVIDER_RETRYABLE' : 'AI_PROVIDER_TERMINAL', retryable ? 503 : 422, { providerStatus: response.status });
    }
    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw operationalError('AI provider timed out.', 'AI_PROVIDER_TIMEOUT', 503);
    throw error;
  } finally { clearTimeout(timer); }
};

const openAIResponses = async ({ policy, provider, messages, outputSchema, fetchImpl, secretSource }) => {
  const result = await requestJson({
    endpoint: PROVIDER_ENDPOINTS.OPENAI_RESPONSES,
    headers: { authorization: `Bearer ${resolveSecret(provider.configuration.secretEnvName, secretSource)}` }, timeoutMs: Math.min(provider.timeoutMs, policy.timeoutMs), fetchImpl,
    body: { model: policy.modelIdentifier, input: messages, max_output_tokens: policy.maxOutputTokens, text: { format: { type: 'json_schema', name: 'operation_output', strict: true, schema: outputSchema } } },
  });
  const text = result.output_text || result.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
  return { output: parseJsonText(text), inputTokens: result.usage?.input_tokens || 0, outputTokens: result.usage?.output_tokens || 0, providerRequestIdSafeId: result.id || null };
};

const anthropicMessages = async ({ policy, provider, messages, outputSchema, fetchImpl, secretSource }) => {
  const system = messages.find((message) => message.role === 'system')?.content || '';
  const user = messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role, content: message.content }));
  const result = await requestJson({
    endpoint: PROVIDER_ENDPOINTS.ANTHROPIC_MESSAGES,
    headers: { 'x-api-key': resolveSecret(provider.configuration.secretEnvName, secretSource), 'anthropic-version': '2023-06-01' }, timeoutMs: Math.min(provider.timeoutMs, policy.timeoutMs), fetchImpl,
    body: { model: policy.modelIdentifier, system, messages: user, max_tokens: policy.maxOutputTokens, tools: [{ name: 'operation_output', description: 'Return the required validated output.', input_schema: outputSchema }], tool_choice: { type: 'tool', name: 'operation_output' } },
  });
  const block = result.content?.find((item) => item.type === 'tool_use' && item.name === 'operation_output');
  if (!block?.input) throw operationalError('Provider returned no structured output.', 'AI_PROVIDER_OUTPUT_INVALID', 422);
  return { output: block.input, inputTokens: result.usage?.input_tokens || 0, outputTokens: result.usage?.output_tokens || 0, providerRequestSafeId: result.id || null };
};

const ADAPTER_REGISTRY = Object.freeze({ OPENAI_RESPONSES: openAIResponses, ANTHROPIC_MESSAGES: anthropicMessages });

const executeProvider = async ({ policy, provider, messages, outputSchema, fetchImpl, secretSource }) => {
  const adapter = ADAPTER_REGISTRY[provider.adapterType];
  if (!adapter) throw operationalError('Provider adapter is not registered.', 'AI_PROVIDER_ADAPTER_NOT_REGISTERED', 422);
  if (provider.configuration?.endpoint && provider.configuration.endpoint !== PROVIDER_ENDPOINTS[provider.adapterType]) throw operationalError('Provider endpoint is not allowlisted.', 'AI_PROVIDER_ENDPOINT_NOT_ALLOWED', 422);
  return adapter({ policy, provider, messages, outputSchema, fetchImpl, secretSource });
};

module.exports = { ADAPTER_REGISTRY, PROVIDER_ENDPOINTS, executeProvider, parseJsonText, requestJson, resolveSecret };
