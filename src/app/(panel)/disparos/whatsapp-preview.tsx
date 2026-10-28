import { Copy, ExternalLink, Phone, Reply } from "lucide-react";

/**
 * Prévia da mensagem como chega no WhatsApp (bolha verde + botões embaixo),
 * igual ao "Exemplo de visualização" da tela de templates.
 */
export function WhatsAppPreview({
  header,
  body,
  footer,
  buttons,
}: {
  header?: string;
  body: string;
  footer?: string;
  buttons?: { type: string; text: string }[];
}) {
  const icon = (type: string) => {
    if (type === "URL") return <ExternalLink className="size-3" />;
    if (type === "PHONE_NUMBER") return <Phone className="size-3" />;
    if (type === "COPY_CODE") return <Copy className="size-3" />;
    return <Reply className="size-3" />;
  };

  return (
    <div className="rounded-xl border border-border bg-[#e9e3d9] p-4 dark:bg-[#0b141a]">
      <p className="micro-label mb-3 text-center text-[#8a6a16] dark:text-[#d4af37]">
        Exemplo de visualização
      </p>
      <div className="ml-auto max-w-[17rem] space-y-1">
        <div className="rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] leading-snug text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
          {header ? <p className="mb-1 font-semibold">{header}</p> : null}
          <p className="whitespace-pre-wrap break-words">{body || "Sua mensagem…"}</p>
          {footer ? <p className="mt-1 text-[11px] opacity-60">{footer}</p> : null}
          <p className="mt-0.5 text-right text-[10px] opacity-50">12:00</p>
        </div>
        {(buttons ?? []).map((b, i) => (
          <div
            key={`${b.type}-${i}`}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#d9fdd3] px-3 py-1.5 text-[13px] text-[#027eb5] shadow-sm dark:bg-[#005c4b] dark:text-[#53bdeb]"
          >
            {icon(b.type)}
            {b.text || (b.type === "COPY_CODE" ? "Copiar código" : "Botão")}
          </div>
        ))}
      </div>
    </div>
  );
}
