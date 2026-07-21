import { customAlphabet } from "nanoid";

/**
 * Geração do `user_id` ANÔNIMO do visitante.
 * Compacto, URL-safe, só letras/números (sem `-`/`_`), compatível com os limites
 * do parâmetro `sck` da Hotmart. NÃO tem relação com auth.users.
 */
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const nano = customAlphabet(ALPHABET, 16);

/** Gera um novo user_id de visitante (16 chars alfanuméricos). */
export function newVisitorId(): string {
  return nano();
}

/** Valida o formato de um user_id de visitante. */
export function isValidVisitorId(value: string): boolean {
  return /^[0-9A-Za-z]{8,32}$/.test(value);
}
