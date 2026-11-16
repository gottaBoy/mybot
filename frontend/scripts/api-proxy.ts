import type { ProxyOptions } from 'vite'

// Vite changes Host but not Origin. Translate only the browser's own origin;
// arbitrary cross-origin requests must still reach the backend's rejection.
export function forwardedOrigin(origin: string | undefined, host: string | undefined, target: string) {
  if (!origin || !host) return origin
  try {
    const source = new URL(origin)
    if (source.origin !== origin || !['http:', 'https:'].includes(source.protocol) || source.host !== host) return origin
    return new URL(target).origin
  } catch { return origin }
}

export function apiProxy(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, request) => {
        const origin = forwardedOrigin(request.headers.origin, request.headers.host, target)
        if (origin) proxyReq.setHeader('Origin', origin)
      })
    },
  }
}
