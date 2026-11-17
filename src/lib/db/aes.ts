/**
 * Cifra dos segredos de integração com WebCrypto (AES-256-GCM), no lugar do
 * pgcrypto. Chave = SHA-256 do ENCRYPTION_KEY (que vive só no env).
 * Formato gravado: "v2:" + base64( iv(12 bytes) || ciphertext+tag ).
 * Os segredos antigos (pgp_sym_encrypt) são recifrados na importação dos dados.
 */
const PREFIX = "v2:";
const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(secret))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
    keyCache.set(secret, k);
  }
  return k;
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function aesEncrypt(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey(secret);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return PREFIX + toB64(out);
}

export async function aesDecrypt(ciphertext: string, secret: string): Promise<string> {
  if (!ciphertext.startsWith(PREFIX)) {
    throw new Error("segredo em formato antigo (pgcrypto): salve de novo pela tela de Integrações");
  }
  const raw = fromB64(ciphertext.slice(PREFIX.length));
  const key = await getKey(secret);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return new TextDecoder().decode(pt);
}
