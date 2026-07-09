const API_PATH = '/api/v1'
const ROUTER_BASE_URL = normalizeRouterBaseURL(import.meta.env.BASE_URL)
const DEFAULT_API_BASE_URL = `${ROUTER_BASE_URL}${API_PATH}`
const API_BASE_URL = normalizeAPIBaseURL(import.meta.env.VITE_API_BASE_URL)

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

function normalizeRouterBaseURL(value: unknown): string {
  const normalized = normalizePath(String(value || '/').trim() || '/').replace(/\/+$/, '')
  return normalized === '/' ? '' : normalized
}

function normalizeAPIBaseURL(value: unknown): string {
  const raw = String(value || DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL
  const withoutTrailingSlash = raw.replace(/\/+$/, '')
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(withoutTrailingSlash) || withoutTrailingSlash.startsWith('//')) {
    return withoutTrailingSlash
  }
  return normalizePath(withoutTrailingSlash)
}

export function getAPIBaseURL(): string {
  return API_BASE_URL
}

export function buildApiUrl(path: string): string {
  const base = getAPIBaseURL().replace(/\/+$/, '')
  let suffix = normalizePath(path)
  if (suffix === API_PATH) {
    suffix = ''
  } else if (suffix.startsWith(`${API_PATH}/`)) {
    suffix = suffix.slice(API_PATH.length)
  }
  return `${base}${suffix}`
}

export function buildGatewayUrl(path: string): string {
  const suffix = normalizePath(path)
  try {
    const apiURL =
      typeof window === 'undefined'
        ? new URL(getAPIBaseURL())
        : new URL(getAPIBaseURL(), window.location.origin)
    const gatewayPath = /\/api\/v1\/?$/.test(apiURL.pathname)
      ? apiURL.pathname.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '')
      : ''
    return `${apiURL.origin}${gatewayPath}${suffix}`
  } catch {
    return `${ROUTER_BASE_URL}${suffix}`
  }
}
