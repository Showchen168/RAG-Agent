export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { NodeSDK } = await import('@opentelemetry/sdk-node')
    const { LangfuseSpanProcessor } = await import('@langfuse/otel')

    // 只導出 AI SDK spans，過濾掉 Next.js HTTP/RSC infra spans
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shouldExportSpan = (span: any) => {
      return span.otelSpan.instrumentationScope.name !== 'next.js'
    }

    const sdk = new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor({ shouldExportSpan })],
    })
    sdk.start()
  }
}
