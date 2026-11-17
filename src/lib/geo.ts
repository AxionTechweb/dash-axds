import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * IP real, user-agent e GEO da requisição — sem provedor externo.
 *
 * Na Cloudflare:
 *  - IP: `cf-connecting-ip` (posto pela própria Cloudflare). O primeiro item do
 *    `x-forwarded-for` NÃO serve: a Cloudflare só acrescenta o IP no fim, então
 *    o início vem de quem fez a requisição e burlaria todo rate limit por IP.
 *  - GEO: `request.cf` (país ISO alpha-2, código da região, cidade).
 * Os headers x-vercel-ip-* ficam só de reserva (rodar fora da Cloudflare).
 */
export type RequestContext = {
  ip: string | null;
  userAgent: string | null;
  geoCountry: string | null;
  geoRegion: string | null;
  geoCity: string | null;
};

type CfGeo = { country?: string; regionCode?: string; city?: string };

function cfGeo(): CfGeo {
  try {
    return (getCloudflareContext().cf ?? {}) as CfGeo;
  } catch {
    return {};
  }
}

function lastForwardedIp(value: string | null): string | null {
  if (!value) return null;
  // Só o último item foi posto por um proxy confiável; o resto vem do cliente.
  const last = value.split(",").pop()?.trim();
  return last || null;
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
  const cf = cfGeo();
  const country = cf.country ?? headers.get("cf-ipcountry") ?? headers.get("x-vercel-ip-country");
  return {
    ip:
      headers.get("cf-connecting-ip") ??
      headers.get("x-real-ip") ??
      lastForwardedIp(headers.get("x-forwarded-for")),
    userAgent: headers.get("user-agent"),
    // "XX" = país desconhecido / "T1" = Tor na Cloudflare.
    geoCountry: country && /^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "T1" ? country : null,
    geoRegion: cf.regionCode ?? headers.get("x-vercel-ip-country-region"),
    geoCity: cf.city ?? decode(headers.get("x-vercel-ip-city")),
  };
}
