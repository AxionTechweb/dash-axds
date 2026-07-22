import "server-only";

/**
 * IP real, user-agent e GEO derivados dos headers — sem provedor externo.
 * Na Vercel, o GEO vem em x-vercel-ip-* (país/estado/cidade).
 */
export type RequestContext = {
  ip: string | null;
  userAgent: string | null;
  geoCountry: string | null;
  geoRegion: string | null;
  geoCity: string | null;
};

function firstForwardedIp(value: string | null): string | null {
  if (!value) return null;
  // x-forwarded-for: "cliente, proxy1, proxy2" — o primeiro é o cliente.
  const first = value.split(",")[0]?.trim();
  return first || null;
}

/** A Vercel envia a cidade percent-encoded (ex.: "S%C3%A3o%20Paulo"). */
function decode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getRequestContext(headers: Headers): RequestContext {
  return {
    ip:
      firstForwardedIp(headers.get("x-forwarded-for")) ??
      headers.get("x-real-ip"),
    userAgent: headers.get("user-agent"),
    geoCountry: headers.get("x-vercel-ip-country"),
    geoRegion: headers.get("x-vercel-ip-country-region"),
    geoCity: decode(headers.get("x-vercel-ip-city")),
  };
}
