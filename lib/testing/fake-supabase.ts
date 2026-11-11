// In-memory stand-in for the parts of the Supabase query builder the server
// actions use, for unit tests that call actions as different users. It does
// NOT emulate RLS — the database rules have their own tests
// (supabase/tests/*.mjs); these tests check the server-side lock.

type Row = Record<string, unknown>
type RpcHandler = (args: Row, ctx: { db: FakeDb; client: string; userId: string | null }) => { data: unknown; error: { message: string; code?: string } | null }
export type FakeDb = {
  tables: Record<string, Row[]>
  writes: { client: string; table: string; op: string; values: Row; filters: [string, string, unknown][] }[]
  /** Stand-ins for database functions called with .rpc(). */
  rpcs: Record<string, RpcHandler>
  /** Make writes to a table fail, as a database rule (trigger, constraint) would. */
  writeErrors: Record<string, { message: string; code?: string }>
  /** The session's MFA assurance level (Review Finding 8). Default: verified (aal2). */
  aal?: 'aal1' | 'aal2'
}

export function createFakeDb(tables: Record<string, Row[]> = {}, rpcs: Record<string, RpcHandler> = {}): FakeDb {
  return { tables, writes: [], rpcs, writeErrors: {} }
}

export function fakeClient(db: FakeDb, client: string, userId: string | null = null) {
  function from(table: string) {
    const filters: [string, string, unknown][] = []
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select'
    let values: Row = {}
    let returning = false
    let wantCount = false
    let limit = Infinity
    const rows = () => (db.tables[table] ??= [])
    const matches = (r: Row) => filters.every(([kind, c, v]) =>
      kind === 'eq' ? r[c] === v
        : kind === 'neq' ? r[c] !== v
          : kind === 'is' ? (r[c] ?? null) === v
            : kind === 'in' ? (v as unknown[]).includes(r[c])
              : kind === 'lt' ? r[c] != null && String(r[c]) < String(v) : true)

    const run = () => {
      const refused = op !== 'select' ? db.writeErrors[table] : undefined
      if (refused) return { data: null, error: refused }
      if (op === 'insert') {
        rows().push({ ...values })
        db.writes.push({ client, table, op, values, filters })
        return { data: returning ? [values] : null, error: null }
      }
      const hit = rows().filter(matches).slice(0, limit)
      if (op === 'update') {
        hit.forEach(r => Object.assign(r, values))
        db.writes.push({ client, table, op, values, filters: [...filters] })
        return { data: returning ? hit.map(r => ({ ...r })) : null, error: null, count: wantCount ? hit.length : null }
      }
      if (op === 'delete') {
        db.tables[table] = rows().filter(r => !hit.includes(r))
        db.writes.push({ client, table, op, values: {}, filters: [...filters] })
        return { data: null, error: null }
      }
      return { data: hit.map(r => ({ ...r })), error: null }
    }

    const b = {
      select: () => { if (op !== 'select') returning = true; return b },
      update: (v: Row, o?: { count?: string }) => { op = 'update'; values = v; wantCount = !!o?.count; return b },
      insert: (v: Row) => { op = 'insert'; values = v; return b },
      delete: () => { op = 'delete'; return b },
      eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return b },
      neq: (c: string, v: unknown) => { filters.push(['neq', c, v]); return b },
      is: (c: string, v: unknown) => { filters.push(['is', c, v]); return b },
      in: (c: string, v: unknown[]) => { filters.push(['in', c, v]); return b },
      lt: (c: string, v: unknown) => { filters.push(['lt', c, v]); return b },
      order: () => b,
      limit: (n: number) => { limit = n; return b },
      maybeSingle: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error ?? null } },
      single: async () => { const r = run(); const d = (r.data as Row[] | null)?.[0] ?? null; return { data: d, error: r.error ?? (d ? null : { message: 'not found' }) } },
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
    }
    return b
  }
  return {
    from,
    rpc: async (name: string, args: Row = {}) => {
      db.writes.push({ client, table: `rpc:${name}`, op: 'call', values: args, filters: [] })
      const handler = db.rpcs[name]
      return handler ? handler(args, { db, client, userId }) : { data: null, error: { message: `no fake for ${name}` } }
    },
    // Storage stub: every removal is recorded so tests can see which files were deleted.
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => { db.writes.push({ client, table: `storage:${bucket}`, op: 'delete', values: { paths }, filters: [] }); return { data: [], error: null } },
        info: async () => ({ data: { size: 10 }, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://signed' }, error: null }),
        createSignedUploadUrl: async (path: string) => ({ data: { path, token: 't' }, error: null }),
      }),
    },
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: db.aal ?? 'aal2', nextLevel: 'aal2' }, error: null }) },
      admin: {
        updateUserById: async (id: string, attrs: Row) => { db.writes.push({ client, table: 'auth.users', op: 'update', values: { id, ...attrs }, filters: [] }); return { error: null } },
        deleteUser: async () => ({ error: null }),
        getUserById: async (id: string) => ({ data: { user: (db.tables['auth.users'] ?? []).find(u => u.id === id) ?? null }, error: null }),
      },
    },
  }
}
