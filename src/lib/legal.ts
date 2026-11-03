import "server-only";

import { getBranding } from "@/lib/branding";

/**
 * Identificação do controlador para as páginas públicas (/privacidade, /docs).
 * White label: nada fixo no código — vem do env da instância e cai no nome do
 * produto (branding) quando não configurado.
 *
 *   LEGAL_COMPANY_NAME   razão social (ex.: "Empresa Ltda.")
 *   LEGAL_DOCUMENT       CNPJ/CPF do controlador (opcional)
 *   LEGAL_CONTACT_EMAIL  e-mail de privacidade/atendimento (encarregado LGPD)
 */
export type LegalInfo = {
  productName: string;
  companyName: string;
  document: string | null;
  contactEmail: string | null;
};

export async function getLegalInfo(): Promise<LegalInfo> {
  const branding = await getBranding();
  const env = (key: string) => process.env[key]?.trim() || null;

  return {
    productName: branding.product_name,
    companyName: env("LEGAL_COMPANY_NAME") ?? branding.product_name,
    document: env("LEGAL_DOCUMENT"),
    contactEmail: env("LEGAL_CONTACT_EMAIL"),
  };
}

/** Data de vigência da versão atual da Política de Privacidade. */
export const PRIVACY_UPDATED_AT = "03/11/2026";
