/**
 * Seletor de período do header — filtra TODO o painel.
 * O período viaja na URL (?period=7d ou ?from=&to=), então é compartilhável e
 * fica disponível nos Server Components.
 */

export type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "custom";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "custom", label: "Personalizado" },
];

export type Period = {
  key: PeriodKey;
  label: string;
  from: Date;
  to: Date;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

const BRT_TZ = "America/Sao_Paulo";
const WEEKDAY_ORDER_MON_FIRST = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** "YYYY-MM-DD" no fuso de Brasília. */
function brtYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BRT_TZ }).format(d);
}

/** 0 = segunda ... 6 = domingo, no fuso de Brasília. */
function brtWeekdayIndex(d: Date): number {
  const name = d.toLocaleDateString("en-US", { timeZone: BRT_TZ, weekday: "long" });
  return WEEKDAY_ORDER_MON_FIRST.indexOf(name);
}

/** 00:00:00 BRT de um "YYYY-MM-DD", como instante UTC. BRT é UTC-3 fixo (sem horário de verão desde 2019). */
function brtStartOfDayUtc(ymd: string): Date {
  return new Date(`${ymd}T03:00:00.000Z`);
}

export type WeekRange = {
  weekStart: Date;
  weekEnd: Date;
  weekStartYmd: string;
  weekEndYmd: string;
};

/**
 * Semana Seg–Dom ANTERIOR à semana corrente, em horário de Brasília — a
 * semana que acabou de fechar, alvo do relatório semanal. Independe do fuso
 * do servidor (Vercel roda em UTC), mesmo raciocínio de getSalesTiming em
 * src/lib/metrics.ts.
 */
export function getLastWeekRange(reference: Date = new Date()): WeekRange {
  const weekdayIdx = brtWeekdayIndex(reference); // 0=seg .. 6=dom, na semana corrente
  const daysSinceLastSunday = weekdayIdx + 1;
  const daysSinceLastMonday = daysSinceLastSunday + 6;

  const lastSunday = new Date(reference);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - daysSinceLastSunday);
  const lastMonday = new Date(reference);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - daysSinceLastMonday);

  const weekStartYmd = brtYmd(lastMonday);
  const weekEndYmd = brtYmd(lastSunday);

  const weekStart = brtStartOfDayUtc(weekStartYmd);
  // 23:59:59.999 BRT do domingo = 1ms antes da meia-noite BRT da segunda seguinte.
  const weekEnd = new Date(brtStartOfDayUtc(weekEndYmd).getTime() + 86_400_000 - 1);

  return { weekStart, weekEnd, weekStartYmd, weekEndYmd };
}

/**
 * Resolve o período a partir dos searchParams (já aguardados — no Next.js 16
 * `searchParams` é assíncrono). Default: 7 dias.
 */
export function resolvePeriod(params: {
  period?: string;
  from?: string;
  to?: string;
}): Period {
  const now = new Date();
  const key = (params.period ?? "7d") as PeriodKey;

  if (key === "custom" && params.from && params.to) {
    const from = new Date(params.from);
    const to = new Date(params.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return {
        key: "custom",
        label: "Personalizado",
        from: startOfDay(from),
        to: endOfDay(to),
      };
    }
  }

  switch (key) {
    case "today":
      return { key, label: "Hoje", from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = addDays(now, -1);
      return { key, label: "Ontem", from: startOfDay(y), to: endOfDay(y) };
    }
    case "30d":
      return {
        key,
        label: "30 dias",
        from: startOfDay(addDays(now, -29)),
        to: endOfDay(now),
      };
    case "7d":
    default:
      return {
        key: "7d",
        label: "7 dias",
        from: startOfDay(addDays(now, -6)),
        to: endOfDay(now),
      };
  }
}
