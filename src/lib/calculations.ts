import { Client, Vehicle, Charge, Payment, Plan, ClientConsolidatedFinancials } from '../types';

export function roundCurrencyValue(value: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Math.sign(num) * 1e-10) * 100) / 100;
}

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'R$ 0,00';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR');
    }
  } catch {
    // fallback
  }
  return dateStr;
}

export function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('pt-BR');
    }
  } catch {
    // fallback
  }
  return dateStr;
}

export function normalizeIsoDate(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return trimmed;
}

export function getTodayIsoDate(): string {
  try {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Fortaleza',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
      return formatted;
    }
  } catch {
    // fallback para data local se Intl com timeZone não estiver disponível
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonthStr(): string {
  return getTodayIsoDate().slice(0, 7);
}

export function isDateOverdue(dueDate: string): boolean {
  const normalized = normalizeIsoDate(dueDate);
  if (!normalized) return false;
  const today = getTodayIsoDate();
  return normalized < today;
}

export function isDateToday(dueDate: string): boolean {
  const normalized = normalizeIsoDate(dueDate);
  if (!normalized) return false;
  const today = getTodayIsoDate();
  return normalized === today;
}

export function getDaysDifference(dueDate: string): number {
  const normalized = normalizeIsoDate(dueDate);
  if (!normalized) return 0;
  const today = new Date(getTodayIsoDate() + 'T00:00:00');
  const target = new Date(normalized + 'T00:00:00');
  const diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export interface DashboardMetrics {
  totalClients: number;
  totalVehicles: number;
  carsCount: number;
  motosCount: number;
  trucksCount: number;
  othersCount: number;
  activeVehiclesCount: number;
  suspendedVehiclesCount: number;
  cancelledVehiclesCount: number;
  
  estimatedMonthlyRevenue: number;
  totalReceivedMonth: number;
  totalToReceiveMonth: number;
  totalOverdueAmount: number;
  totalPartialAmount: number;
  totalPendingBalance: number;
  defaultingClientsCount: number;
  
  upcomingCharges: Charge[];
  dueTodayCharges: Charge[];
  overdueCharges: Charge[];
  partialCharges: Charge[];
  recentPayments: Payment[];
}

export function calculateDashboardMetrics(
  clients: Client[],
  vehicles: Vehicle[],
  charges: Charge[],
  payments: Payment[]
): DashboardMetrics {
  const currentMonth = getCurrentMonthStr();
  const today = getTodayIsoDate();

  // Operational metrics
  const totalClients = clients.length;
  const totalVehicles = vehicles.length;
  
  let carsCount = 0;
  let motosCount = 0;
  let trucksCount = 0;
  let othersCount = 0;
  let activeVehiclesCount = 0;
  let suspendedVehiclesCount = 0;
  let cancelledVehiclesCount = 0;
  let estimatedMonthlyRevenue = 0;

  vehicles.forEach((v) => {
    if (v.vehicleType === 'carro') carsCount++;
    else if (v.vehicleType === 'moto') motosCount++;
    else if (v.vehicleType === 'caminhao') trucksCount++;
    else othersCount++;

    if (v.status === 'ativo') {
      activeVehiclesCount++;
      estimatedMonthlyRevenue = roundCurrencyValue(
        estimatedMonthlyRevenue + (Number(v.monthlyValue) || 0)
      );
    } else if (v.status === 'suspenso') {
      suspendedVehiclesCount++;
    } else if (v.status === 'cancelado') {
      cancelledVehiclesCount++;
    }
  });

  // Financial calculations
  let totalReceivedMonth = 0;
  payments.forEach((p) => {
    if (p.paymentDate && p.paymentDate.startsWith(currentMonth)) {
      totalReceivedMonth = roundCurrencyValue(totalReceivedMonth + (Number(p.amount) || 0));
    }
  });

  let totalToReceiveMonth = 0;
  let totalOverdueAmount = 0;
  let totalPartialAmount = 0;
  let totalPendingBalance = 0;
  const defaultingClientIds = new Set<string>();

  const upcomingCharges: Charge[] = [];
  const dueTodayCharges: Charge[] = [];
  const overdueCharges: Charge[] = [];
  const partialCharges: Charge[] = [];

  charges.forEach((c) => {
    if (c.status === 'cancelado') return;

    const remaining = roundCurrencyValue(Number(c.remainingBalance) || 0);
    const isDue = c.dueDate < today && remaining > 0;
    const isToday = c.dueDate === today && remaining > 0;
    const isPendingOrPartial = (c.status === 'pendente' || c.status === 'parcial') && remaining > 0;

    if (remaining > 0) {
      totalPendingBalance = roundCurrencyValue(totalPendingBalance + remaining);
    }

    if (getEffectiveBillingMonth(c) === currentMonth && isPendingOrPartial) {
      totalToReceiveMonth = roundCurrencyValue(totalToReceiveMonth + remaining);
    }

    if (c.status === 'parcial' && remaining > 0) {
      totalPartialAmount = roundCurrencyValue(totalPartialAmount + remaining);
      partialCharges.push(c);
    }

    if (isDue) {
      totalOverdueAmount = roundCurrencyValue(totalOverdueAmount + remaining);
      defaultingClientIds.add(c.clientId);
      overdueCharges.push(c);
    } else if (isToday) {
      dueTodayCharges.push(c);
    } else if (c.dueDate > today && isPendingOrPartial) {
      const diff = getDaysDifference(c.dueDate);
      if (diff <= 7) {
        upcomingCharges.push(c);
      }
    }
  });

  // Recent payments
  const sortedPayments = [...payments].sort((a, b) => (b.paymentDate > a.paymentDate ? 1 : -1));
  const recentPayments = sortedPayments.slice(0, 10);

  return {
    totalClients,
    totalVehicles,
    carsCount,
    motosCount,
    trucksCount,
    othersCount,
    activeVehiclesCount,
    suspendedVehiclesCount,
    cancelledVehiclesCount,
    estimatedMonthlyRevenue,
    totalReceivedMonth,
    totalToReceiveMonth,
    totalOverdueAmount,
    totalPartialAmount,
    totalPendingBalance,
    defaultingClientsCount: defaultingClientIds.size,
    upcomingCharges: upcomingCharges.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    dueTodayCharges,
    overdueCharges: overdueCharges.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    partialCharges,
    recentPayments,
  };
}

export function consolidateClientFinancials(
  client: Client,
  allVehicles: Vehicle[],
  allCharges: Charge[]
): ClientConsolidatedFinancials {
  const clientVehicles = allVehicles.filter((v) => v.clientId === client.id);
  const clientCharges = allCharges.filter((c) => c.clientId === client.id && c.status !== 'cancelado');
  const today = getTodayIsoDate();

  let totalMonthlyValue = 0;
  clientVehicles.forEach((v) => {
    if (v.status === 'ativo') {
      totalMonthlyValue = roundCurrencyValue(totalMonthlyValue + (Number(v.monthlyValue) || 0));
    }
  });

  let totalReceived = 0;
  let totalPending = 0;
  let totalOverdue = 0;
  let isOverdue = false;

  clientCharges.forEach((c) => {
    totalReceived = roundCurrencyValue(totalReceived + (Number(c.paidAmount) || 0));
    const remaining = roundCurrencyValue(Number(c.remainingBalance) || 0);
    if (remaining > 0) {
      totalPending = roundCurrencyValue(totalPending + remaining);
      if (c.dueDate < today) {
        totalOverdue = roundCurrencyValue(totalOverdue + remaining);
        isOverdue = true;
      }
    }
  });

  return {
    client,
    vehiclesCount: clientVehicles.length,
    vehicles: clientVehicles,
    totalMonthlyValue,
    totalReceived,
    totalPending,
    totalOverdue,
    charges: clientCharges.sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    isOverdue,
  };
}

/**
 * Calcula a data de vencimento segura para um determinado mês e ano,
 * tratando os dias 29, 30 e 31 em meses que não possuem esses dias
 * (utilizando o último dia do mês sem gerar datas inválidas).
 */
export function getSafeDueDate(year: number, monthIndex: number, targetDay: number): string {
  // monthIndex: 0-11
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
  const safeDay = Math.min(Math.max(1, targetDay || 1), lastDayOfMonth);
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(safeDay).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Retorna o rótulo legível em português da competência (ex: "2026-11" -> "Novembro / 2026")
 */
export function getCompetenceLabel(competence: string): string {
  if (!competence) return '';
  const parts = competence.split('-');
  if (parts.length >= 2) {
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    if (month >= 1 && month <= 12) {
      if (parts.length === 3 && parts[2]) {
        return `${monthNames[month - 1]} / ${year} (${parts[2]})`;
      }
      return `${monthNames[month - 1]} / ${year}`;
    }
  }
  return competence;
}

/**
 * Filtra cobranças individuais pendentes e sem pagamento que já foram
 * substituídas por uma cobrança única de plano na mesma competência,
 * preservando integralmente cobranças pagas, parciais e de clientes sem plano.
 */
export function getEffectiveCharges(charges: Charge[]): Charge[] {
  const planChargeKeys = new Set(
    charges
      .filter((c) => c.isPlanCharge && c.status !== 'cancelado')
      .map((c) => `${c.clientId}__${c.referenceMonth}`)
  );

  return charges.filter((c) => {
    if (!c.isPlanCharge && c.status === 'pendente' && (c.paidAmount || 0) === 0) {
      if (planChargeKeys.has(`${c.clientId}__${c.referenceMonth}`)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Extrai a competência YYYY-MM de uma string de data ISO ou YYYY-MM-DD.
 * Para datas YYYY-MM-DD usa os componentes literais sem conversão de fuso.
 * Para timestamps ISO com horário, usa o calendário local do ambiente.
 */
export function getMonthStrFromDateValue(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed.slice(0, 7);
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  const prefixMatch = trimmed.match(/^(\d{4}-\d{2})/);
  return prefixMatch ? prefixMatch[1] : null;
}

/**
 * Regra de início das mensalidades:
 * A primeira mensalidade do cliente deve vencer somente no mês SEGUINTE
 * ao mês em que o cliente foi cadastrado (independente do dia do cadastro ou dia de vencimento).
 * Clientes legados sem data de cadastro continuam elegíveis normalmente.
 */
export function isCompetenceEligibleForClient(
  targetMonth: string,
  client?: Pick<Client, 'createdAt'> | null
): boolean {
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) return false;
  const registrationMonth = getMonthStrFromDateValue(client?.createdAt);
  if (!registrationMonth) return true;
  return targetMonth > registrationMonth;
}

/**
 * Retorna a competência efetiva de vencimento de uma cobrança.
 * Para cobranças sem adiamento, é idêntica a referenceMonth.
 * Para cobranças adiadas, reflete o mês do novo vencimento escolhido.
 */
export function getEffectiveBillingMonth(
  charge: Pick<Charge, 'referenceMonth' | 'isPostponed' | 'dueDate'>
): string {
  const normalizedDue = normalizeIsoDate(charge.dueDate);
  if (charge.isPostponed && /^\d{4}-\d{2}-\d{2}$/.test(normalizedDue)) {
    return normalizedDue.slice(0, 7);
  }
  return charge.referenceMonth;
}

/**
 * Calcula o saldo restante efetivo da cobrança com fallback seguro caso
 * remainingBalance não esteja preenchido ou esteja ausente no documento.
 */
export function getChargeRemainingBalance(
  charge: Pick<Charge, 'remainingBalance' | 'totalAmount' | 'paidAmount'>
): number {
  const rawRemaining = charge.remainingBalance as unknown;
  if (
    rawRemaining !== undefined &&
    rawRemaining !== null &&
    rawRemaining !== '' &&
    !Number.isNaN(Number(rawRemaining))
  ) {
    return Math.max(0, Number(rawRemaining));
  }
  const total = Number(charge.totalAmount) || 0;
  const paid = Number(charge.paidAmount) || 0;
  return Math.max(0, total - paid);
}

/**
 * Regra única e centralizada de elegibilidade para "Adiar mensalidade"
 * (usada tanto pela interface quanto pela função de execução do adiamento):
 * 1. Vencimento igual ou anterior à data atual (America/Fortaleza)
 * 2. Status pendente ou parcial (não quitada e não cancelada)
 * 3. Saldo restante maior que zero
 */
export function getPostponeEligibility(
  charge: Pick<Charge, 'status' | 'remainingBalance' | 'totalAmount' | 'paidAmount' | 'dueDate'>,
  referenceToday?: string
): { allowed: boolean; reason?: string } {
  const today = normalizeIsoDate(referenceToday) || getTodayIsoDate();
  const normalizedStatus = String(charge.status || '').trim().toLowerCase();
  const remaining = getChargeRemainingBalance(charge);
  const effectiveDueDate = normalizeIsoDate(charge.dueDate);

  if (normalizedStatus === 'cancelado') {
    return { allowed: false, reason: 'Não é possível adiar uma mensalidade cancelada.' };
  }

  if (normalizedStatus === 'pago' || remaining <= 0.009) {
    return {
      allowed: false,
      reason: 'Não é possível adiar uma mensalidade já quitada ou sem saldo devedor.',
    };
  }

  if (normalizedStatus !== 'pendente' && normalizedStatus !== 'parcial') {
    return {
      allowed: false,
      reason: 'Apenas mensalidades pendentes ou parcialmente pagas podem ser adiadas.',
    };
  }

  if (!effectiveDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDueDate)) {
    return {
      allowed: false,
      reason: 'Mensalidade sem data de vencimento válida para adiamento.',
    };
  }

  if (effectiveDueDate > today) {
    return {
      allowed: false,
      reason: 'Apenas mensalidades vencidas ou com vencimento hoje podem ser adiadas.',
    };
  }

  return { allowed: true };
}

export function canPostponeCharge(
  charge: Pick<Charge, 'status' | 'remainingBalance' | 'totalAmount' | 'paidAmount' | 'dueDate'>,
  referenceToday?: string
): boolean {
  return getPostponeEligibility(charge, referenceToday).allowed;
}

/**
 * Ordena a lista exibida de mensalidades sem alterar os objetos originais:
 * 1. Vencidas em aberto (mais antigas primeiro — ordem crescente de vencimento efetivo)
 * 2. Vencimento hoje em aberto
 * 3. A vencer em aberto (mais próximas primeiro — ordem crescente de vencimento efetivo)
 * 4. Quitadas / canceladas / sem saldo (mais recentes primeiro)
 * Empates de data mantêm ordenação determinística e estável.
 */
export function sortChargesByPriority(
  chargesList: Charge[],
  referenceToday?: string
): Charge[] {
  const today = normalizeIsoDate(referenceToday) || getTodayIsoDate();

  const getTier = (c: Charge): 0 | 1 | 2 | 3 => {
    const status = String(c.status || '').trim().toLowerCase();
    const remaining = getChargeRemainingBalance(c);
    const isOpen = (status === 'pendente' || status === 'parcial') && remaining > 0.009;
    if (!isOpen) return 3;

    const effectiveDue = normalizeIsoDate(c.dueDate);
    if (!effectiveDue) return 2;
    if (effectiveDue < today) return 0;
    if (effectiveDue === today) return 1;
    return 2;
  };

  return [...chargesList].sort((a, b) => {
    const tierA = getTier(a);
    const tierB = getTier(b);
    if (tierA !== tierB) return tierA - tierB;

    const dueA = normalizeIsoDate(a.dueDate);
    const dueB = normalizeIsoDate(b.dueDate);

    if (dueA !== dueB) {
      if (tierA === 3) {
        return dueB.localeCompare(dueA);
      }
      return dueA.localeCompare(dueB);
    }

    const clientCmp = (a.clientName || '').localeCompare(b.clientName || '', 'pt-BR');
    if (clientCmp !== 0) return clientCmp;

    const refCmp = (a.referenceMonth || '').localeCompare(b.referenceMonth || '');
    if (refCmp !== 0) return refCmp;

    const plateCmp = (a.vehiclePlate || '').localeCompare(b.vehiclePlate || '');
    if (plateCmp !== 0) return plateCmp;

    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Verifica se já existe cobrança ativa ou adiamento cobrindo a competência alvo,
 * impedindo duplicação ou geração antecipada antes da data de adiamento escolhida.
 * Após a quitação da cobrança adiada, competências futuras voltam automaticamente
 * a ser geradas com o dia habitual de vencimento.
 */
export function isChargeBlockedByExistingOrPostponement(
  targetMonth: string,
  relatedCharges: Charge[]
): boolean {
  for (const c of relatedCharges) {
    if (c.status === 'cancelado') continue;

    if (c.referenceMonth === targetMonth) {
      return true;
    }

    if (c.isPostponed && c.dueDate && /^\d{4}-\d{2}-\d{2}/.test(c.dueDate)) {
      const deferredTargetMonth = c.dueDate.slice(0, 7);
      const hasOpenBalance = c.status !== 'pago' && (Number(c.remainingBalance) || 0) > 0.009;

      if (hasOpenBalance && targetMonth >= c.referenceMonth && targetMonth <= deferredTargetMonth) {
        return true;
      }

      if (
        c.status === 'pago' &&
        deferredTargetMonth > c.referenceMonth &&
        targetMonth > c.referenceMonth &&
        targetMonth <= deferredTargetMonth
      ) {
        return true;
      }
    }
  }

  return false;
}

export interface PlannedChargeCreation {
  deterministicId: string;
  data: Omit<Charge, 'id' | 'createdAt' | 'updatedAt'>;
  supersededChargeIds: string[];
}

export interface MonthlyChargeGenerationPlan {
  chargesToCreate: PlannedChargeCreation[];
  skippedCount: number;
}

/**
 * Verifica se uma cobrança existente (individual ou histórica de plano `isPlanCharge`)
 * cobre determinado veículo, permitindo bloquear duplicidades sem alterar ou cancelar o histórico.
 */
export function doesChargeCoverVehicle(
  charge: Pick<
    Charge,
    | 'status'
    | 'clientId'
    | 'vehicleId'
    | 'vehicleIds'
    | 'vehiclePlate'
    | 'vehiclePlates'
    | 'isPlanCharge'
  >,
  vehicle: Pick<Vehicle, 'id' | 'clientId' | 'plate'>
): boolean {
  if (charge.status === 'cancelado') return false;

  if (charge.vehicleId === vehicle.id) {
    return true;
  }

  if (Array.isArray(charge.vehicleIds) && charge.vehicleIds.includes(vehicle.id)) {
    return true;
  }

  if (charge.isPlanCharge && charge.clientId === vehicle.clientId) {
    const normalizedPlate = (vehicle.plate || '').trim().toUpperCase();
    if (normalizedPlate) {
      if (
        Array.isArray(charge.vehiclePlates) &&
        charge.vehiclePlates.some((p) => String(p).trim().toUpperCase() === normalizedPlate)
      ) {
        return true;
      }

      if (typeof charge.vehiclePlate === 'string' && charge.vehiclePlate.trim().length > 0) {
        const splitPlates = charge.vehiclePlate
          .split(',')
          .map((p) => p.trim().toUpperCase())
          .filter(Boolean);
        if (splitPlates.includes(normalizedPlate)) {
          return true;
        }
      }
    }

    const hasExplicitVehicleIds = Array.isArray(charge.vehicleIds) && charge.vehicleIds.length > 0;
    const hasExplicitPlates =
      (Array.isArray(charge.vehiclePlates) && charge.vehiclePlates.length > 0) ||
      (typeof charge.vehiclePlate === 'string' && charge.vehiclePlate.trim().length > 0);

    // Fallback conservador para cobranças legadas de plano sem lista de veículos/placas
    if (!hasExplicitVehicleIds && !hasExplicitPlates) {
      return true;
    }
  }

  return false;
}

/**
 * Motor puro de planejamento das mensalidades de uma competência (YYYY-MM) — ETAPA A:
 * - Gera cobranças exclusivamente individuais por veículo ativo (`chg_veh_{vehicleId}_{month}`),
 *   utilizando o `monthlyValue` e o `dueDay` próprios de cada veículo.
 * - Ignora agrupamento comercial por planos na criação de novas cobranças, preservando integralmente
 *   o histórico existente (inclusive cobranças históricas `isPlanCharge`, pagas, parciais ou adiadas).
 * - Respeita o início somente no mês seguinte ao cadastro do cliente.
 * - Bloqueia duplicidades contra cobranças individuais e cobranças históricas de plano, além de adiamentos.
 */
export function planMonthlyCharges({
  month,
  clients,
  vehicles,
  plans: _plans = [],
  charges,
}: {
  month: string;
  clients: Client[];
  vehicles: Vehicle[];
  plans?: Plan[];
  charges: Charge[];
}): MonthlyChargeGenerationPlan {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Competência inválida para geração de mensalidades.');
  }

  const [yearStr, monthStr] = month.split('-');
  const targetYear = Number(yearStr);
  const targetMonthIndex = Number(monthStr) - 1;

  const chargesToCreate: PlannedChargeCreation[] = [];
  let skippedCount = 0;

  const clientMap = new Map<string, Client>();
  clients.forEach((c) => clientMap.set(c.id, c));

  const seenVehicleIds = new Set<string>();
  const activeVehicles = vehicles.filter((v) => {
    if (v.status !== 'ativo') return false;
    if (seenVehicleIds.has(v.id)) return false;
    seenVehicleIds.add(v.id);
    return true;
  });

  // Geração 100% individual por veículo ativo
  for (const vehicle of activeVehicles) {
    const client = clientMap.get(vehicle.clientId);

    if (client?.status === 'inativo' || !isCompetenceEligibleForClient(month, client)) {
      skippedCount++;
      continue;
    }

    // Proteção de duplicidade considerando tanto cobranças individuais quanto históricas de planos (`isPlanCharge`)
    const relatedVehicleCharges = charges.filter((c) => doesChargeCoverVehicle(c, vehicle));

    if (isChargeBlockedByExistingOrPostponement(month, relatedVehicleCharges)) {
      skippedCount++;
      continue;
    }

    const clientName = client?.name || 'Cliente';
    const prevCharges = charges.filter(
      (c) =>
        c.status !== 'cancelado' &&
        c.vehicleId === vehicle.id &&
        c.referenceMonth < month &&
        Number(c.remainingBalance) > 0 &&
        c.balanceHandling === 'next_month'
    );
    const carriedBalance = roundCurrencyValue(
      prevCharges.reduce((sum, item) => sum + (Number(item.remainingBalance) || 0), 0)
    );

    const originalMonthlyValue = Math.max(0, roundCurrencyValue(Number(vehicle.monthlyValue) || 0));
    const dueDate = getSafeDueDate(targetYear, targetMonthIndex, vehicle.dueDay || 10);
    const totalAmount = roundCurrencyValue(originalMonthlyValue + carriedBalance);
    const deterministicVehChargeId = `chg_veh_${vehicle.id}_${month}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    chargesToCreate.push({
      deterministicId: deterministicVehChargeId,
      data: {
        clientId: vehicle.clientId,
        clientName,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        vehicleModel: `${vehicle.brand} ${vehicle.model}`.trim(),
        referenceMonth: month,
        originalMonthlyValue,
        previousBalanceCarried: carriedBalance,
        discount: 0,
        addition: 0,
        totalAmount,
        paidAmount: 0,
        remainingBalance: totalAmount,
        dueDate,
        status: 'pendente',
        balanceHandling: 'none',
      },
      supersededChargeIds: [],
    });
  }

  return {
    chargesToCreate,
    skippedCount,
  };
}

