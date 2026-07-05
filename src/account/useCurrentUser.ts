import { Q, useQuery } from 'cozy-client'

/** Initials from a display name (first two words) or the email local part. */
export function deriveInitials(name?: string, email?: string): string {
  const n = (name ?? '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  const local = (email ?? '').split('@')[0]
  if (local) return local[0].toUpperCase()
  return 'U'
}

interface InstanceSettings {
  public_name?: string
  email?: string
  attributes?: { public_name?: string; email?: string }
}

// The cozy instance settings live in the `io.cozy.settings` doctype (the
// `io.cozy.settings.instance` singleton). We already hold the `io.cozy.settings:GET`
// scope. Read defensively (flat or nested under `attributes`) and always fall back
// so the account section renders even offline / on an unexpected shape.
const instanceQuery = Q('io.cozy.settings').getById('io.cozy.settings.instance')

export function useCurrentUser(): {
  name?: string
  email?: string
  initials: string
  loading: boolean
} {
  const { data, fetchStatus } = useQuery(instanceQuery, { as: 'io.cozy.settings/instance' })
  const doc = (Array.isArray(data) ? data[0] : data) as InstanceSettings | null | undefined
  const name = doc?.public_name ?? doc?.attributes?.public_name
  const email = doc?.email ?? doc?.attributes?.email
  return {
    name,
    email,
    initials: deriveInitials(name, email),
    loading: fetchStatus === 'loading'
  }
}
