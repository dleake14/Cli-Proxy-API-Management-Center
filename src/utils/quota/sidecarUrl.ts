/**
 * Resolve a Usage sidecar address without turning a remote browser's localhost
 * into the quota source. The Usage server is intentionally an HTTP LAN service.
 */

export type SidecarLocation = {
  hostname?: string;
  port?: string;
};

const fallbackHost = '127.0.0.1';
const usagePort = '47193';

const bracketIpv6 = (hostname: string) =>
  hostname.includes(':') && !(hostname.startsWith('[') && hostname.endsWith(']'))
    ? `[${hostname}]`
    : hostname;

export function resolveUsageSidecarUrl(
  path: string,
  override?: string,
  locationLike: SidecarLocation | undefined = globalThis.location
): string {
  const configured = override?.trim();
  if (configured) return configured;

  const hostname = locationLike?.hostname?.trim() || fallbackHost;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `http://${bracketIpv6(hostname)}:${usagePort}${normalizedPath}`;
}
