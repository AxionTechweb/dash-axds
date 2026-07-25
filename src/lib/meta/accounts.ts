/**
 * Tipos e helpers PUROS de contas de anúncio — sem `server-only`, porque a
 * interface (componente cliente) também precisa deles para renderizar a lista
 * descoberta. A chamada à Graph API fica em `./discover`, que é server-only.
 */

export type DiscoveredAccount = {
  /** Sempre no formato act_<numero>. */
  id: string;
  name: string;
  currency: string | null;
  /** 1 = ativa; outros valores indicam desabilitada/pendente na Meta. */
  status: number | null;
  businessName: string | null;
};

/** Traduz o `account_status` da Meta para algo legível na interface. */
export function accountStatusLabel(status: number | null): string | null {
  switch (status) {
    case 1:
      return null; // ativa: não precisa de rótulo
    case 2:
      return "desabilitada";
    case 3:
      return "não liquidada";
    case 7:
      return "em análise";
    case 9:
      return "em período de graça";
    case 101:
      return "encerrada";
    default:
      return status === null ? null : `status ${status}`;
  }
}
