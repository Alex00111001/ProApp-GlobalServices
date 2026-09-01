const env = require('../../config/env');
const { safeRequestPath } = require('./redaction');

let sdk;

const startTelemetry = () => {
  if (!env.otelEnabled || sdk) return sdk;
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { ParentBasedSampler, TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

  const baseEndpoint = env.otelExporterEndpoint;
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': 'homeservices-core-api',
      'service.version': process.env.APP_VERSION || 'development',
      'deployment.environment.name': env.environment,
    }),
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(env.otelTraceSampleRatio) }),
    spanLimits: { attributeCountLimit: 64, attributeValueLengthLimit: 2_000, eventCountLimit: 64 },
    traceExporter: new OTLPTraceExporter({ url: `${baseEndpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${baseEndpoint}/v1/metrics` }),
      exportIntervalMillis: 30_000,
    }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        requestHook: (span, request) => {
          const path = safeRequestPath(request?.originalUrl || request?.url || request?.path);
          span.setAttribute('url.full', path);
          span.setAttribute('http.url', path);
        },
      },
    })],
  });
  sdk.start();
  return sdk;
};

const shutdownTelemetry = async () => {
  if (!sdk) return;
  const active = sdk;
  sdk = undefined;
  await active.shutdown();
};

module.exports = { shutdownTelemetry, startTelemetry };
