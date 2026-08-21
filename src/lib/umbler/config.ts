/**
 * Umbler Talk API — validada contra a doc oficial real
 * (app-utalk.umbler.com/api/docs) e contra uma conta real antes de implementar.
 */
export const UMBLER_API_BASE = "https://app-utalk.umbler.com/api";

export const UMBLER_RATE_LIMIT = {
  // A própria doc anuncia até 100 req/5s por rota; ficamos com margem.
  // Precisa ser generoso o bastante pro sync diário (concorrência de
  // vários chats ao mesmo tempo) não se auto-estrangular.
  max: 80,
  windowSeconds: 5,
};
