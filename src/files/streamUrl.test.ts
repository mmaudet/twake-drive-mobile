import {
  buildFileStreamSource,
  buildThumbnailUrl,
  canPreviewInApp,
  getPreviewKind
} from './streamUrl'

const buildClient = (uri: string | undefined, token: string | null): never =>
  ({
    getStackClient: () => ({ uri, getAccessToken: () => token })
  }) as never

describe('buildFileStreamSource', () => {
  it('builds /files/download URL with bearer header', () => {
    const src = buildFileStreamSource(buildClient('https://alice.cozy.test', 'TOK'), 'abc')
    expect(src).toEqual({
      uri: 'https://alice.cozy.test/files/download/abc',
      headers: { Authorization: 'Bearer TOK' }
    })
  })

  it('strips trailing slash from stack URI', () => {
    const src = buildFileStreamSource(buildClient('https://alice.cozy.test/', 'TOK'), 'abc')
    expect(src.uri).toBe('https://alice.cozy.test/files/download/abc')
  })

  it('URL-encodes the file id', () => {
    const src = buildFileStreamSource(buildClient('https://x', 'TOK'), 'a/b c')
    expect(src.uri).toBe('https://x/files/download/a%2Fb%20c')
  })

  it('throws when access token is missing', () => {
    expect(() => buildFileStreamSource(buildClient('https://x', null), 'abc')).toThrow(
      'No access token available'
    )
  })

  it('throws when stack URI is missing', () => {
    expect(() => buildFileStreamSource(buildClient(undefined, 'TOK'), 'abc')).toThrow(
      'Stack URI unavailable'
    )
  })
})

describe('getPreviewKind', () => {
  it.each([
    [{ class: 'pdf' }, 'pdf'],
    [{ mime: 'application/pdf' }, 'pdf'],
    [{ class: 'image' }, 'image'],
    [{ mime: 'image/png' }, 'image'],
    [{ mime: 'image/svg+xml' }, 'image'],
    [{ class: 'video' }, 'video'],
    [{ mime: 'video/mp4' }, 'video'],
    [{ class: 'audio' }, 'audio'],
    [{ mime: 'audio/mpeg' }, 'audio'],
    [{ class: 'text' }, 'text'],
    [{ class: 'code' }, 'text'],
    [{ mime: 'text/plain' }, 'text'],
    [{ mime: 'text/markdown' }, 'text'],
    [{ mime: 'application/json' }, 'text'],
    [{ mime: 'application/javascript' }, 'text'],
    [{ class: 'document' }, 'unsupported'],
    [{ mime: 'application/zip' }, 'unsupported'],
    [{}, 'unsupported']
  ] as const)('getPreviewKind(%j) → %s', (file, expected) => {
    expect(getPreviewKind(file)).toBe(expected)
  })

  it('returns unsupported for null/undefined', () => {
    expect(getPreviewKind(null)).toBe('unsupported')
    expect(getPreviewKind(undefined)).toBe('unsupported')
  })
})

describe('buildThumbnailUrl', () => {
  const client = (uri: string | undefined): never => ({ getStackClient: () => ({ uri }) }) as never

  it('prefers the requested size', () => {
    const url = buildThumbnailUrl(
      client('https://x.cozy.test'),
      { tiny: '/t', small: '/s', medium: '/m', large: '/l' },
      'medium'
    )
    expect(url).toBe('https://x.cozy.test/m')
  })

  it('falls back through sizes when preferred is missing', () => {
    const url = buildThumbnailUrl(
      client('https://x.cozy.test'),
      { small: '/s', tiny: '/t' },
      'medium'
    )
    // medium → large → medium → small
    expect(url).toBe('https://x.cozy.test/s')
  })

  it('strips trailing slash from stack URI and prefixes / when missing', () => {
    expect(buildThumbnailUrl(client('https://x.cozy.test/'), { medium: 'm' }, 'medium')).toBe(
      'https://x.cozy.test/m'
    )
  })

  it('returns null when links/uri are missing', () => {
    expect(buildThumbnailUrl(client('https://x'), null, 'medium')).toBeNull()
    expect(buildThumbnailUrl(client('https://x'), {}, 'medium')).toBeNull()
    expect(buildThumbnailUrl(client(undefined), { medium: '/m' }, 'medium')).toBeNull()
  })
})

describe('canPreviewInApp', () => {
  it('returns true for any supported kind', () => {
    expect(canPreviewInApp({ class: 'image' })).toBe(true)
    expect(canPreviewInApp({ class: 'video' })).toBe(true)
    expect(canPreviewInApp({ mime: 'text/plain' })).toBe(true)
  })

  it('returns false for unsupported types', () => {
    expect(canPreviewInApp({ class: 'document' })).toBe(false)
    expect(canPreviewInApp({})).toBe(false)
  })
})
