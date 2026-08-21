/**
 * Umbler Talk API — validada contra a doc oficial real
 * (app-utalk.umbler.com/api/docs) e contra uma conta real antes de implementar.
 */
export const UMBLER_API_BASE = "https://app-utalk.umbler.com/api";

export const UMBLER_RATE_LIMIT = {
  // A própria doc anuncia até 100 req/5s por rota; ficamos bem abaixo.
  max: 30,
  windowSeconds: 5,
};
