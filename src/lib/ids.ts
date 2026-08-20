import { customAlphabet } from "nanoid";

/**
 * Geração do `user_id` ANÔNIMO do visitante.
 * Compacto e URL-safe (sem `-`/`_`) quando GERADO por nós (track.js). NÃO tem
 * relação com auth.users.
 */
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const nano = customAlphabet(ALPHABET, 16);

/** Gera um novo user_id de visitante (16 chars alfanuméricos). */
export function newVisitorId(): string {
  return nano();
}

/**
 * Valida o formato de um user_id de visitante — aceita tanto o alfabeto
 * compacto que NÓS geramos quanto um ID vindo de captura externa (GTM/outro
 * sistema), que costuma compor `timestamp_random` com `_`. `-` também é
 * aceito pelo mesmo motivo. Ainda assim limitado em tamanho/charset — nunca
 * aceita o payload bruto de um campo livre.
 */
export function isValidVisitorId(value: string): boolean {
  return /^[0-9A-Za-z_-]{6,64}$/.test(value);
}
