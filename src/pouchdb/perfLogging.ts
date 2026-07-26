const now = (): number => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance
  return perf?.now ? perf.now() : Date.now()
}

const marks = new Map<string, number>()
let seq = 0

const totals: Record<string, { ms: number; n: number }> = {}

const categoryOf = (label: string): string => {
  if (label.startsWith('dbMethod')) return 'ingest'
  if (label.startsWith('setData')) return 'setData'
  if (label.startsWith('warmup/read')) return 'warmupRead'
  if (label.startsWith('query')) return 'readUI'
  return label.split(' ')[0]
}

const bump = (cat: string, ms: number): void => {
  const t = totals[cat] ?? (totals[cat] = { ms: 0, n: 0 })
  t.ms += ms
  t.n += 1
}

const queryChurn = new Map<string, { n: number; ms: number }>()

const bumpChurn = (sig: string, ms: number): void => {
  const c = queryChurn.get(sig) ?? { n: 0, ms: 0 }
  c.n += 1
  c.ms += ms
  queryChurn.set(sig, c)
}

export const resetPerfCounters = (): void => {
  for (const k of Object.keys(totals)) delete totals[k]
  queryChurn.clear()
  stackGetByIdTraceCount = 0
  clientQueryTraceCount = 0
  console.log('[pouch-perf] --- counters reset ---')
}

const printQueryChurn = (topN = 20): void => {
  const rows = [...queryChurn.entries()].sort((a, b) => b[1].n - a[1].n)
  const refired = rows.filter(([, c]) => c.n > 1).length
  const distinct = rows.length
  console.warn(`[pouch-perf] CHURN ${distinct} distinct reads, ${refired} refired (>1x)`)
  for (const [sig, c] of rows.slice(0, topN)) {
    console.warn(`[pouch-perf] CHURN  x${c.n}  ${c.ms.toFixed(0)}ms  ${sig}`)
  }
}

export const printPerfSummary = (tag = 'sync'): void => {
  const parts = Object.entries(totals)
    .map(([cat, t]) => `${cat}=${t.ms.toFixed(0)}ms/${t.n}`)
    .join(' ')
  console.warn(`[pouch-perf] SUMMARY ${tag} ${parts || '(nothing recorded)'}`)
  printQueryChurn()
}

let stallMonitorStarted = false

export const startJsStallMonitor = (intervalMs = 500, thresholdMs = 150): void => {
  if (stallMonitorStarted) return
  stallMonitorStarted = true
  let expected = now() + intervalMs
  setInterval(() => {
    const drift = now() - expected
    expected = now() + intervalMs
    if (drift > thresholdMs) {
      bump('stall', drift)
      console.warn(`[js-stall] JS thread blocked ~${drift.toFixed(0)}ms — taps starved`)
    }
  }, intervalMs)
}

const log = (label: string, ms: number, extra?: string): void => {
  bump(categoryOf(label), ms)
  const line = `[pouch-perf] ${label} ${ms.toFixed(1)}ms${extra ? ' ' + extra : ''}`
  if (ms >= 100) console.warn(line)
  else console.log(line)
}

interface MeasureOptions {
  measureName?: string
  markName: string
  category?: string
  color?: string
}

export const metroPerformanceApi = {
  mark: (markName: string): string => {
    const id = `${++seq} ${markName}`
    marks.set(id, now())
    return id
  },
  measure: ({ measureName, markName }: MeasureOptions): void => {
    const start = marks.get(markName)
    if (start === undefined) return
    marks.delete(markName)
    log(measureName ?? markName.replace(/^\d+ /, ''), now() - start)
  }
}

interface QueryOperation {
  doctype?: string
  id?: string
  ids?: string[]
  indexedFields?: string[]
  selector?: Record<string, unknown>
  sort?: unknown
  limit?: number
}

const describeQuery = (op: QueryOperation): string => {
  const doctype = op.doctype ?? '?'
  if (op.id) return `${doctype} getById(${op.id})`
  if (op.ids) return `${doctype} getByIds(${op.ids.length})`
  if (op.indexedFields?.length) return `${doctype} find [${op.indexedFields.join(',')}]`
  const sel = op.selector ? Object.keys(op.selector).join(',') : 'none'
  return `${doctype} find allDocs sel={${sel}} limit=${op.limit ?? '-'}`
}

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map(k => `${k}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
}

const querySig = (source: string, op: QueryOperation): string => {
  const parts: string[] = [source, op.doctype ?? '?']
  if (op.id) parts.push(`id=${op.id}`)
  if (op.ids) parts.push(`ids#${op.ids.length}`)
  if (op.indexedFields?.length) parts.push(`idx=[${op.indexedFields.join(',')}]`)
  if (op.selector) parts.push(`sel=${stableStringify(op.selector)}`)
  if (op.sort) parts.push(`sort=${stableStringify(op.sort)}`)
  if (op.limit !== undefined) parts.push(`lim=${op.limit}`)
  return parts.join(' ')
}

const wrapExecuteQuery = (
  target: { executeQuery?: unknown; __perfWrapped?: boolean },
  source: string
): void => {
  if (!target || target.__perfWrapped || typeof target.executeQuery !== 'function') return
  const original = target.executeQuery.bind(target) as (op: QueryOperation) => Promise<unknown>
  target.executeQuery = async (op: QueryOperation): Promise<unknown> => {
    const t0 = now()
    try {
      return await original(op)
    } finally {
      const ms = now() - t0
      log(`${source} ${describeQuery(op)}`, ms)
      bumpChurn(querySig(source, op), ms)
    }
  }
  target.__perfWrapped = true
}

interface InstrumentableClient {
  setData?: unknown
  __perfSetData?: boolean
}

const SETDATA_CHUNK = Number.MAX_SAFE_INTEGER

const describeCounts = (entries: [string, unknown[]][]): string =>
  entries.map(([dt, docs]) => `${dt}:${Array.isArray(docs) ? docs.length : '?'}`).join(' ')

const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

export const instrumentClientSetData = (client: InstrumentableClient): void => {
  if (!client || client.__perfSetData || typeof client.setData !== 'function') return
  const original = client.setData.bind(client) as (data: Record<string, unknown[]>) => unknown
  client.setData = (data: Record<string, unknown[]>): unknown => {
    const entries = Object.entries(data ?? {})
    const total = entries.reduce((n, [, docs]) => n + (Array.isArray(docs) ? docs.length : 0), 0)
    if (total <= SETDATA_CHUNK) {
      const t0 = now()
      try {
        return original(data)
      } finally {
        log(`setData ${describeCounts(entries)}`, now() - t0)
      }
    }
    const t0 = now()
    void (async () => {
      for (const [dt, docs] of entries) {
        if (!Array.isArray(docs) || docs.length <= SETDATA_CHUNK) {
          original({ [dt]: docs })
          await yieldToEventLoop()
          continue
        }
        for (let i = 0; i < docs.length; i += SETDATA_CHUNK) {
          original({ [dt]: docs.slice(i, i + SETDATA_CHUNK) })
          await yieldToEventLoop()
        }
      }
      log(`setData(chunked) ${describeCounts(entries)}`, now() - t0)
    })()
    return undefined
  }
  client.__perfSetData = true
}

let clientQueryTraceCount = 0

interface InstrumentableClientQuery {
  query?: unknown
  __perfQueryWrapped?: boolean
}

export const instrumentClientQuery = (client: InstrumentableClientQuery): void => {
  if (!client || client.__perfQueryWrapped || typeof client.query !== 'function') return
  const original = client.query.bind(client) as (def: unknown, opts?: unknown) => unknown
  client.query = (def: unknown, opts?: unknown): unknown => {
    const d = (def ?? {}) as QueryOperation
    if (d.id && d.doctype === 'io.cozy.files' && clientQueryTraceCount < 3) {
      clientQueryTraceCount += 1
      const as = (opts as { as?: string } | undefined)?.as
      const flatStack = (new Error().stack ?? '').replace(/\s*\n\s*/g, '  <<<  ')
      console.warn(
        `[pouch-perf] CLIENTQUERY-TRACE #${clientQueryTraceCount} id=${d.id} as=${as ?? '(none)'} STACK:: ${flatStack}`
      )
    }
    return original(def, opts)
  }
  client.__perfQueryWrapped = true
}

interface InstrumentableStackLink {
  request?: unknown
  __perfStackWrapped?: boolean
}

let stackGetByIdTraceCount = 0

export const instrumentStackLink = (stackLink: InstrumentableStackLink): void => {
  if (!stackLink || stackLink.__perfStackWrapped || typeof stackLink.request !== 'function') return
  const original = stackLink.request.bind(stackLink) as (...args: unknown[]) => Promise<unknown>
  stackLink.request = async (...args: unknown[]): Promise<unknown> => {
    const op = (args[0] ?? {}) as QueryOperation & { mutationType?: string }
    if (op.mutationType) return original(...args)
    if (op.id && op.doctype === 'io.cozy.files' && stackGetByIdTraceCount < 30) {
      stackGetByIdTraceCount += 1
      const opts = (args[1] ?? {}) as { as?: string; fetchPolicy?: unknown }
      console.warn(
        `[pouch-perf] STACK-GETBYID-AS #${stackGetByIdTraceCount} id=${op.id} as=${opts.as ?? '(none)'}`
      )
    }
    const t0 = now()
    try {
      return await original(...args)
    } finally {
      const ms = now() - t0
      log(`stack ${describeQuery(op)}`, ms)
      bumpChurn(querySig('stack', op), ms)
    }
  }
  stackLink.__perfStackWrapped = true
}

interface InstrumentablePouchLink {
  executeQuery?: unknown
  __perfWrapped?: boolean
  pouches?: { executeQuery?: unknown; __perfWrapped?: boolean } | null
}

export const instrumentPouchLink = (pouchLink: InstrumentablePouchLink): void => {
  wrapExecuteQuery(pouchLink, 'query')

  let pouches = pouchLink.pouches ?? null
  if (pouches) wrapExecuteQuery(pouches, 'warmup/read')
  Object.defineProperty(pouchLink, 'pouches', {
    configurable: true,
    get: () => pouches,
    set: (value: InstrumentablePouchLink['pouches']) => {
      pouches = value ?? null
      if (pouches) wrapExecuteQuery(pouches, 'warmup/read')
    }
  })
}
