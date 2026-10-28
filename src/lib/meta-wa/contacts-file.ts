/**
 * Leitura da lista de contatos de uma campanha (.csv ou .vcf), feita no
 * navegador. Sem "server-only": o servidor só recebe a lista já em colunas e
 * normaliza os telefones de novo antes de enfileirar.
 */

export type ContactsFile = {
  columns: string[];
  rows: Record<string, string>[];
  /** Coluna detectada com o telefone (null quando nenhuma parece telefone). */
  phoneColumn: string | null;
  nameColumn: string | null;
};

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_ROWS = 5000;

const PHONE_HEADER = /tel|fone|phone|celular|cel\b|whats|n[uú]mero|contato/i;
const NAME_HEADER = /^(nome|name|cliente|primeiro.?nome|first.?name|full.?name)/i;

/** Mesmo critério do servidor: 10–11 dígitos ganham 55; aceita 12–15. */
export function looksLikePhone(raw: string | undefined): boolean {
  if (!raw) return false;
  let digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 15;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return { columns: [], rows: [] };

  // Excel em português salva com ";"; o resto do mundo com ",".
  const first = lines[0];
  const delimiter =
    (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
      ? ";"
      : first.includes("\t")
        ? "\t"
        : ",";

  const firstCells = splitCsvLine(first, delimiter);
  // Sem cabeçalho quando a 1ª linha já tem um telefone.
  const hasHeader = !firstCells.some(looksLikePhone);
  const columns = hasHeader
    ? firstCells.map((c, i) => c || `Coluna ${i + 1}`)
    : firstCells.map((_, i) => (i === 0 ? "Telefone" : `Coluna ${i + 1}`));

  const rows = lines
    .slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + MAX_FILE_ROWS)
    .map((line) => {
      const cells = splitCsvLine(line, delimiter);
      return Object.fromEntries(columns.map((col, i) => [col, cells[i] ?? ""]));
    });
  return { columns, rows };
}

function parseVcf(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const rows: Record<string, string>[] = [];
  // Linhas dobradas (continuação começa com espaço) voltam a ser uma só.
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  for (const card of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    const lines = card.split(/\r?\n/);
    const value = (prefix: RegExp) => {
      const line = lines.find((l) => prefix.test(l));
      return line ? line.slice(line.indexOf(":") + 1).trim() : "";
    };
    const nome = value(/^FN[;:]/i) || value(/^N[;:]/i).split(";").filter(Boolean).reverse().join(" ");
    const telefone = value(/^(item\d+\.)?TEL[;:]/i);
    if (telefone) rows.push({ Nome: nome, Telefone: telefone });
    if (rows.length >= MAX_FILE_ROWS) break;
  }
  return { columns: ["Nome", "Telefone"], rows };
}

export function parseContactsFile(text: string, filename: string): ContactsFile {
  const { columns, rows } = /\.vcf$/i.test(filename) ? parseVcf(text) : parseCsv(text);

  // Telefone: pelo nome da coluna; senão, a coluna com mais números válidos.
  let phoneColumn = columns.find((c) => PHONE_HEADER.test(c)) ?? null;
  if (!phoneColumn) {
    let best = 0;
    for (const col of columns) {
      const valid = rows.filter((r) => looksLikePhone(r[col])).length;
      if (valid > best) {
        best = valid;
        phoneColumn = col;
      }
    }
  }
  const nameColumn = columns.find((c) => NAME_HEADER.test(c)) ?? null;

  return { columns, rows, phoneColumn, nameColumn };
}
