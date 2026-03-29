const isDev = import.meta.env.DEV

function sanitize(args: unknown[]): unknown[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      return arg.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***')
    }
    if (arg && typeof arg === 'object') {
      const obj = arg as Record<string, unknown>
      const sanitized = { ...obj }
      for (const key of Object.keys(sanitized)) {
        if (/api.?key|password|secret|token/i.test(key)) {
          sanitized[key] = '***'
        }
      }
      return sanitized
    }
    return arg
  })
}

export const logger = {
  debug(...args: unknown[]) {
    if (isDev) console.log(...sanitize(args))
  },
  info(...args: unknown[]) {
    if (isDev) console.info(...sanitize(args))
  },
  warn(...args: unknown[]) {
    console.warn(...sanitize(args))
  },
  error(...args: unknown[]) {
    console.error(...sanitize(args))
  },
}
