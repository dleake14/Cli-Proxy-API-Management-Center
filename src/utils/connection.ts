import { DEFAULT_API_PORT, MANAGEMENT_API_PREFIX } from './constants';

export type ApiBaseLocation = {
  protocol: string;
  hostname: string;
  port: string;
};

const LOCAL_FRONTEND_PORTS = new Set(['5173', '47193']);

export const normalizeApiBase = (input: string): string => {
  let base = (input || '').trim();
  if (!base) return '';
  base = base.replace(/\/?v0\/management\/?$/i, '');
  base = base.replace(/\/+$/i, '');
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }
  return base;
};

export const computeApiUrl = (base: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) return '';
  return `${normalized}${MANAGEMENT_API_PREFIX}`;
};

export const apiBaseFromLocation = (location: ApiBaseLocation): string => {
  const { protocol, hostname, port } = location;
  // The maintained fork is served by Vite on 5173 and through the Usage
  // monitor on 47193, while CLIProxyAPI owns the management API on 8317.
  // Reusing the page port makes the login form call /v0/management on the
  // frontend server and presents a misleading network error.
  const resolvedPort = LOCAL_FRONTEND_PORTS.has(port) ? String(DEFAULT_API_PORT) : port;
  const normalizedPort = resolvedPort ? `:${resolvedPort}` : '';
  return normalizeApiBase(`${protocol}//${hostname}${normalizedPort}`);
};

export const detectApiBaseFromLocation = (): string => {
  try {
    return apiBaseFromLocation(window.location);
  } catch (error) {
    console.warn('Failed to detect api base from location, fallback to default', error);
    return normalizeApiBase(`http://localhost:${DEFAULT_API_PORT}`);
  }
};
