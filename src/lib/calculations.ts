import {
  CarriedBalanceSourceItem,
  Client,
  Vehicle,
  Charge,
  Payment,
  Plan,
  ClientConsolidatedFinancials,
} from '../types';

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
  const trimmed = dateStr.trim();
  if (!trimmed) return '-';
  // Evita deslocamento de fuso (UTC -> local) para strings somente data YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatDate(trimmed);
  }
  try {
    const d = new Date(trimmed);
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

export function isValidIsoCalendarDate(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/**
 * Extrai a data efetiva (YYYY-MM-DD) de um pagamento sem sofrer deslocamento de fuso.
 */
export function getPaymentEffectiveDate(
  payment: Pick<Payment, 'paymentDate' | 'createdAt'>
): string {
  const fromPayment = normalizeIsoDate(payment.paymentDate);
  if (isValidIsoCalendarDate(fromPayment)) return fromPayment;
  const fromCreated = normalizeIsoDate(payment.createdAt);
  if (isValidIsoCalendarDate(fromCreated)) return fromCreated;
  return '';
}

/**
 * Retorna true quando a data real de pagamento ocorre antes da data de vencimento original.
 */
export function isEarlyPaymentDate(
  paymentDate?: string | null,
  dueDate?: string | null
): boolean {
  const normPay = normalizeIsoDate(paymentDate);
  const normDue = normalizeIsoDate(dueDate);
  if (!isValidIsoCalendarDate(normPay) || !isValidIsoCalendarDate(normDue)) {
    return false;
  }
  return normPay < normDue;
}

/**
 * Verifica se um pagamento (individual ou consolidado) cobre a cobrança informada.
 */
export function doesPaymentCoverCharge(payment: Payment, chargeId: string): boolean {
  if (!chargeId) return false;
  if (payment.chargeId === chargeId) return true;
  if (Array.isArray(payment.consolidatedItems)) {
    return payment.consolidatedItems.some((item) => item.chargeId === chargeId);
  }
  return false;
}

/**
 * Retorna todos os pagamentos (individuais ou consolidados) que cobrem a cobrança informada.
 */
export function getPaymentsForCharge(payments: Payment[], chargeId: string): Payment[] {
  if (!chargeId) return [];
  return payments.filter((p) => doesPaymentCoverCharge(p, chargeId));
}

/**
 * Retorna o valor efetivamente aplicado por um pagamento a uma cobrança específica.
 */
export function getPaymentAmountForCharge(payment: Payment, chargeId: string): number {
  if (!chargeId) return 0;
  if (payment.isConsolidated && Array.isArray(payment.consolidatedItems)) {
    const matched = payment.consolidatedItems.find((item) => item.chargeId === chargeId);
    if (matched) return roundCurrencyValue(Number(matched.paidInThisOperation) || 0);
    return 0;
  }
  return payment.chargeId === chargeId ? roundCurrencyValue(Number(payment.amount) || 0) : 0;
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

export function getDaysDifference(dueDate: string, referenceToday?: string): number {
  const normalized = normalizeIsoDate(dueDate);
  if (!normalized) return 0;
  const baseToday = referenceToday && isValidIsoCalendarDate(referenceToday)
    ? referenceToday
    : getTodayIsoDate();
  const today = new Date(baseToday + 'T00:00:00');
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
  payments: Payment[],
  referenceToday?: string
): DashboardMetrics {
  const today = referenceToday && isValidIsoCalendarDate(referenceToday)
    ? referenceToday
    : getTodayIsoDate();
  const currentMonth = today.slice(0, 7);

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

  // Financial calculations: caixa contabilizado estritamente na data real de pagamento (paymentDate)
  let totalReceivedMonth = 0;
  payments.forEach((p) => {
    const effectivePayDate = getPaymentEffectiveDate(p);
    if (effectivePayDate && effectivePayDate.startsWith(currentMonth)) {
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

  const effectiveCharges = getEffectiveCharges(charges);

  effectiveCharges.forEach((c) => {
    if (c.status === 'cancelado') return;

    const remaining = getChargeEffectiveOpenBalance(c);
    const normalizedDue = normalizeIsoDate(c.dueDate);
    const isOpen = c.status !== 'pago' && remaining > 0.009;
    const isDue = isOpen && Boolean(normalizedDue) && normalizedDue < today;
    const isToday = isOpen && Boolean(normalizedDue) && normalizedDue === today;
    const isPendingOrPartial = (c.status === 'pendente' || c.status === 'parcial') && remaining > 0.009;

    if (isOpen) {
      totalPendingBalance = roundCurrencyValue(totalPendingBalance + remaining);
    }

    if (getEffectiveBillingMonth(c) === currentMonth && isPendingOrPartial) {
      totalToReceiveMonth = roundCurrencyValue(totalToReceiveMonth + remaining);
    }

    if (c.status === 'parcial' && remaining > 0.009) {
      totalPartialAmount = roundCurrencyValue(totalPartialAmount + remaining);
      partialCharges.push(c);
    }

    if (isDue) {
      totalOverdueAmount = roundCurrencyValue(totalOverdueAmount + remaining);
      defaultingClientIds.add(c.clientId);
      overdueCharges.push(c);
    } else if (isToday) {
      dueTodayCharges.push(c);
    } else if (Boolean(normalizedDue) && normalizedDue > today && isPendingOrPartial) {
      const diff = getDaysDifference(normalizedDue, today);
      if (diff <= 7) {
        upcomingCharges.push(c);
      }
    }
  });

  // Recent payments
  const sortedPayments = [...payments].sort((a, b) =>
    getPaymentEffectiveDate(b).localeCompare(getPaymentEffectiveDate(a)) ||
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
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
  allCharges: Charge[],
  referenceToday?: string
): ClientConsolidatedFinancials {
  const clientVehicles = allVehicles.filter((v) => v.clientId === client.id);
  const clientCharges = getEffectiveCharges(allCharges).filter(
    (c) => c.clientId === client.id && c.status !== 'cancelado'
  );
  const today = referenceToday && isValidIsoCalendarDate(referenceToday)
    ? referenceToday
    : getTodayIsoDate();

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
    const remaining = getChargeEffectiveOpenBalance(c);
    const normalizedDue = normalizeIsoDate(c.dueDate);
    if (c.status !== 'pago' && remaining > 0.009) {
      totalPending = roundCurrencyValue(totalPending + remaining);
      if (normalizedDue && normalizedDue < today) {
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

export interface MonthlyReportSummary {
  filteredCharges: Charge[];
  periodPayments: Payment[];
  totalCharged: number;
  totalReceivedInPeriod: number;
  totalPending: number;
  totalOverdue: number;
}

/**
 * Calcula os dados consolidados do relatório de mensalidades para um intervalo de datas:
 * - Inclui cobranças cujo vencimento ou competência esteja no período E também cobranças
 *   que tiveram pagamento efetivo (`paymentDate`) dentro do período (baixa antecipada).
 * - Contabiliza `totalReceivedInPeriod` estritamente pelos pagamentos cujo `paymentDate`
 *   real está dentro de `[startDate, endDate]`, nunca antecipando receita não recebida.
 * - Classifica inadimplência apenas para cobranças em aberto (`status !== 'pago'`) com
 *   saldo > 0 e `dueDate < today`, garantindo que cobranças antecipadamente quitadas jamais
 *   apareçam como inadimplentes.
 */
export function calculateMonthlyReportMetrics(params: {
  charges: Charge[];
  payments: Payment[];
  startDate: string;
  endDate: string;
  clientId?: string;
  statusFilter?: string;
  referenceToday?: string;
}): MonthlyReportSummary {
  const {
    charges,
    payments,
    startDate,
    endDate,
    clientId,
    statusFilter = 'all',
    referenceToday,
  } = params;

  const today =
    referenceToday && isValidIsoCalendarDate(referenceToday)
      ? referenceToday
      : getTodayIsoDate();

  const effectiveCharges = getEffectiveCharges(charges).filter((c) => c.status !== 'cancelado');

  // Pagamentos cujo caixa real ocorreu dentro do intervalo [startDate, endDate]
  const periodPayments = payments.filter((p) => {
    if (clientId && p.clientId !== clientId) return false;
    const payDate = getPaymentEffectiveDate(p);
    if (!payDate) return false;
    return payDate >= startDate && payDate <= endDate;
  });

  const chargeIdsPaidInPeriod = new Set<string>();
  periodPayments.forEach((p) => {
    if (p.isConsolidated && Array.isArray(p.consolidatedItems) && p.consolidatedItems.length > 0) {
      p.consolidatedItems.forEach((item) => {
        if (item.chargeId) chargeIdsPaidInPeriod.add(item.chargeId);
      });
    } else if (p.chargeId) {
      chargeIdsPaidInPeriod.add(p.chargeId);
    }
  });

  const startMonth = startDate.slice(0, 7);
  const endMonth = endDate.slice(0, 7);

  const filteredCharges = effectiveCharges.filter((c) => {
    if (clientId && c.clientId !== clientId) return false;

    const normalizedDue = normalizeIsoDate(c.dueDate);
    const inPeriodByDue = Boolean(normalizedDue) && normalizedDue >= startDate && normalizedDue <= endDate;
    const inPeriodByMonth =
      Boolean(c.referenceMonth) && c.referenceMonth >= startMonth && c.referenceMonth <= endMonth;
    const inPeriodByPayment = chargeIdsPaidInPeriod.has(c.id);

    if (!inPeriodByDue && !inPeriodByMonth && !inPeriodByPayment) {
      return false;
    }

    const remaining = getChargeEffectiveOpenBalance(c);
    const isOverdue = c.status !== 'pago' && remaining > 0.009 && Boolean(normalizedDue) && normalizedDue < today;

    if (statusFilter === 'overdue') {
      return isOverdue;
    }
    if (statusFilter && statusFilter !== 'all') {
      return c.status === statusFilter;
    }
    return true;
  });

  const filteredChargeIds = new Set(filteredCharges.map((c) => c.id));

  // Total recebido real (caixa) no período correspondente às cobranças exibidas
  let totalReceivedInPeriod = 0;
  periodPayments.forEach((p) => {
    if (p.isConsolidated && Array.isArray(p.consolidatedItems) && p.consolidatedItems.length > 0) {
      p.consolidatedItems.forEach((item) => {
        if (filteredChargeIds.has(item.chargeId)) {
          totalReceivedInPeriod = roundCurrencyValue(
            totalReceivedInPeriod + (Number(item.paidInThisOperation) || 0)
          );
        }
      });
    } else if (filteredChargeIds.has(p.chargeId)) {
      totalReceivedInPeriod = roundCurrencyValue(totalReceivedInPeriod + (Number(p.amount) || 0));
    }
  });

  let totalCharged = 0;
  let totalPending = 0;
  let totalOverdue = 0;

  filteredCharges.forEach((c) => {
    totalCharged = roundCurrencyValue(totalCharged + (Number(c.totalAmount) || 0));
    const remaining = getChargeEffectiveOpenBalance(c);
    if (c.status !== 'pago' && remaining > 0.009) {
      totalPending = roundCurrencyValue(totalPending + remaining);
      const normalizedDue = normalizeIsoDate(c.dueDate);
      if (normalizedDue && normalizedDue < today) {
        totalOverdue = roundCurrencyValue(totalOverdue + remaining);
      }
    }
  });

  return {
    filteredCharges,
    periodPayments,
    totalCharged,
    totalReceivedInPeriod,
    totalPending,
    totalOverdue,
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
 * Filtra cobranças individuais pendentes, sem pagamento e não adiadas que já estão
 * efetivamente cobertas por uma cobrança antiga de plano (`isPlanCharge`) para o MESMO
 * veículo e a MESMA competência (`referenceMonth`).
 *
 * Correção Etapa A2:
 * - Não compara apenas `clientId` + `referenceMonth`; verifica a cobertura real do veículo
 *   usando `doesChargeCoverVehicle` (`vehicleId`, `vehicleIds`, `vehiclePlates`, `vehiclePlate`
 *   e fallback conservador para planos legados sem lista explícita).
 * - Nunca oculta cobranças individuais de veículos não contemplados pela cobrança de plano.
 * - Preserva integralmente cobranças pagas, parciais, adiadas e de competências diferentes.
 */
export function getEffectiveCharges(charges: Charge[]): Charge[] {
  const activePlanChargesByKey = new Map<string, Charge[]>();
  for (const c of charges) {
    if (c.isPlanCharge && c.status !== 'cancelado') {
      const key = `${c.clientId}__${c.referenceMonth}`;
      const list = activePlanChargesByKey.get(key);
      if (list) {
        list.push(c);
      } else {
        activePlanChargesByKey.set(key, [c]);
      }
    }
  }

  return charges.filter((c) => {
    if (
      !c.isPlanCharge &&
      !c.isPostponed &&
      c.status === 'pendente' &&
      roundCurrencyValue(Number(c.paidAmount) || 0) === 0
    ) {
      const key = `${c.clientId}__${c.referenceMonth}`;
      const coveringPlans = activePlanChargesByKey.get(key);
      if (
        coveringPlans &&
        coveringPlans.some((planCharge) =>
          doesChargeCoverVehicle(planCharge, {
            id: c.vehicleId,
            clientId: c.clientId,
            plate: c.vehiclePlate,
          })
        )
      ) {
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
 * Calcula o saldo restante bruto registrado no documento da cobrança, com fallback seguro.
 */
export function getRawChargeRemainingBalance(
  charge: Pick<Charge, 'remainingBalance' | 'totalAmount' | 'paidAmount'>
): number {
  const rawRemaining = charge.remainingBalance as unknown;
  if (
    rawRemaining !== undefined &&
    rawRemaining !== null &&
    rawRemaining !== '' &&
    !Number.isNaN(Number(rawRemaining))
  ) {
    return Math.max(0, roundCurrencyValue(Number(rawRemaining)));
  }
  const total = roundCurrencyValue(Number(charge.totalAmount) || 0);
  const paid = roundCurrencyValue(Number(charge.paidAmount) || 0);
  return Math.max(0, roundCurrencyValue(total - paid));
}

/**
 * Retorna o saldo em aberto efetivamente cobrável de uma cobrança.
 * Quando o saldo residual já foi formalmente transportado para outra competência
 * (`carriedBalanceConsumed === true` ou `carriedToChargeId` preenchido), desconta o valor
 * efetivamente transportado para evitar dupla contagem do saldo devedor, preservando
 * intacto o `remainingBalance` histórico no documento de origem.
 */
export function getChargeEffectiveOpenBalance(
  charge: Pick<
    Charge,
    | 'remainingBalance'
    | 'totalAmount'
    | 'paidAmount'
    | 'carriedBalanceConsumed'
    | 'carriedBalanceAmount'
    | 'carriedToChargeId'
  >
): number {
  const rawRemaining = getRawChargeRemainingBalance(charge);
  const hasBeenCarried =
    charge.carriedBalanceConsumed === true ||
    (typeof charge.carriedToChargeId === 'string' && charge.carriedToChargeId.trim().length > 0);

  if (hasBeenCarried) {
    const carriedAmount =
      charge.carriedBalanceAmount !== undefined &&
      charge.carriedBalanceAmount !== null &&
      !Number.isNaN(Number(charge.carriedBalanceAmount))
        ? Math.max(0, roundCurrencyValue(Number(charge.carriedBalanceAmount)))
        : rawRemaining;
    return Math.max(0, roundCurrencyValue(rawRemaining - carriedAmount));
  }

  return rawRemaining;
}

/**
 * Calcula o saldo restante efetivo da cobrança com fallback seguro caso
 * remainingBalance não esteja preenchido e respeitando o consumo de saldo transportado.
 */
export function getChargeRemainingBalance(
  charge: Pick<
    Charge,
    | 'remainingBalance'
    | 'totalAmount'
    | 'paidAmount'
    | 'carriedBalanceConsumed'
    | 'carriedBalanceAmount'
    | 'carriedToChargeId'
  >
): number {
  return getChargeEffectiveOpenBalance(charge);
}

/**
 * Regra única e centralizada de elegibilidade para "Adiar mensalidade"
 * (usada tanto pela interface quanto pela função de execução do adiamento):
 * 1. Vencimento igual ou anterior à data atual (America/Fortaleza)
 * 2. Status pendente ou parcial (não quitada e não cancelada)
 * 3. Saldo restante efetivo maior que zero (não transportado)
 */
export function getPostponeEligibility(
  charge: Pick<
    Charge,
    | 'status'
    | 'remainingBalance'
    | 'totalAmount'
    | 'paidAmount'
    | 'dueDate'
    | 'carriedBalanceConsumed'
    | 'carriedBalanceAmount'
    | 'carriedToChargeId'
  >,
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
  charge: Pick<
    Charge,
    | 'status'
    | 'remainingBalance'
    | 'totalAmount'
    | 'paidAmount'
    | 'dueDate'
    | 'carriedBalanceConsumed'
    | 'carriedBalanceAmount'
    | 'carriedToChargeId'
  >,
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
  carryOverSourceIds: string[];
}

export interface MonthlyChargeGenerationPlan {
  chargesToCreate: PlannedChargeCreation[];
  skippedCount: number;
  untransferredPlanChargeIds: string[];
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

  if (vehicle.id && charge.vehicleId && charge.vehicleId === vehicle.id) {
    return true;
  }

  if (vehicle.id && Array.isArray(charge.vehicleIds) && charge.vehicleIds.includes(vehicle.id)) {
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
 * Verifica se uma cobrança de origem está elegível para transporte de saldo parcial
 * (`balanceHandling === 'next_month'`) para uma nova cobrança individual do veículo.
 *
 * Regras da Etapa A2:
 * - Nunca transporta cobranças canceladas ou quitadas.
 * - Nunca atribui automaticamente saldo de cobrança antiga de plano (`isPlanCharge === true`)
 *   ou cobrança multi-veículo a um único veículo.
 * - Exige consumo único: bloqueia qualquer cobrança já marcada como `carriedBalanceConsumed`
 *   ou já vinculada a uma cobrança de destino (`carriedToChargeId`).
 * - Exige competência estritamente anterior (`referenceMonth < targetMonth`), mesmo cliente e mesmo veículo.
 * - Preserva `specific_date`, `open_negotiation` e `none` sem transporte automático.
 */
export function isChargeEligibleForBalanceCarryOver(
  charge: Pick<
    Charge,
    | 'id'
    | 'status'
    | 'isPlanCharge'
    | 'clientId'
    | 'vehicleId'
    | 'vehicleIds'
    | 'referenceMonth'
    | 'balanceHandling'
    | 'remainingBalance'
    | 'totalAmount'
    | 'paidAmount'
    | 'carriedBalanceConsumed'
    | 'carriedToChargeId'
    | 'carriedBalanceAmount'
  >,
  vehicle: Pick<Vehicle, 'id' | 'clientId'>,
  targetMonth: string
): boolean {
  if (charge.status === 'cancelado' || charge.status === 'pago') return false;
  if (charge.isPlanCharge === true) return false;
  if (Array.isArray(charge.vehicleIds) && charge.vehicleIds.length > 1) return false;
  if (charge.clientId !== vehicle.clientId) return false;
  if (!charge.vehicleId || charge.vehicleId !== vehicle.id) return false;
  if (!charge.referenceMonth || charge.referenceMonth >= targetMonth) return false;
  if (charge.balanceHandling !== 'next_month') return false;
  if (charge.carriedBalanceConsumed === true) return false;
  if (typeof charge.carriedToChargeId === 'string' && charge.carriedToChargeId.trim().length > 0) {
    return false;
  }

  return getChargeEffectiveOpenBalance(charge) > 0.009;
}

/**
 * Motor puro de planejamento das mensalidades de uma competência (YYYY-MM) — ETAPA A + A2:
 * - Gera cobranças exclusivamente individuais por veículo ativo (`chg_veh_{vehicleId}_{month}`),
 *   utilizando o `monthlyValue` e o `dueDay` próprios de cada veículo.
 * - Ignora agrupamento comercial por planos na criação de novas cobranças, preservando integralmente
 *   o histórico existente (inclusive cobranças históricas `isPlanCharge`, pagas, parciais ou adiadas).
 * - Respeita o início somente no mês seguinte ao cadastro do cliente.
 * - Bloqueia duplicidades contra cobranças individuais e cobranças históricas de plano, além de adiamentos.
 * - Planeja transporte de saldo parcial (`next_month`) com rastreabilidade explícita origem -> destino,
 *   consumo único e proteção contra atribuição automática de saldos de cobranças antigas de plano.
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

  // Defesa em profundidade: identifica origens já referenciadas em qualquer cobrança ativa existente
  const alreadyReferencedSourceIds = new Set<string>();
  const untransferredPlanChargeIdsSet = new Set<string>();
  for (const c of charges) {
    if (c.status === 'cancelado') continue;
    if (Array.isArray(c.carriedFromChargeIds)) {
      for (const srcId of c.carriedFromChargeIds) {
        if (srcId) alreadyReferencedSourceIds.add(srcId);
      }
    }
    if (Array.isArray(c.carriedBalanceSources)) {
      for (const src of c.carriedBalanceSources) {
        if (src?.sourceChargeId) alreadyReferencedSourceIds.add(src.sourceChargeId);
      }
    }
    // Identifica cobranças antigas de plano com saldo marcado para próximo mês que não podem
    // ser atribuídas arbitrariamente a um único veículo (preservadas intactas).
    if (
      c.isPlanCharge === true &&
      c.status !== 'pago' &&
      c.referenceMonth < month &&
      c.balanceHandling === 'next_month' &&
      !c.carriedBalanceConsumed &&
      !c.carriedToChargeId &&
      getChargeEffectiveOpenBalance(c) > 0.009
    ) {
      untransferredPlanChargeIdsSet.add(c.id);
    }
  }

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
    const eligibleCarrySources = charges
      .filter(
        (c) =>
          !alreadyReferencedSourceIds.has(c.id) &&
          isChargeEligibleForBalanceCarryOver(c, vehicle, month)
      )
      .sort((a, b) => (a.referenceMonth || '').localeCompare(b.referenceMonth || ''));

    const carriedBalanceSources: CarriedBalanceSourceItem[] = eligibleCarrySources.map((src) => ({
      sourceChargeId: src.id,
      sourceReferenceMonth: src.referenceMonth,
      amount: getChargeEffectiveOpenBalance(src),
    }));
    const carryOverSourceIds = carriedBalanceSources.map((s) => s.sourceChargeId);
    const carriedBalance = roundCurrencyValue(
      carriedBalanceSources.reduce((sum, item) => sum + item.amount, 0)
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
        carriedFromChargeIds: carryOverSourceIds.length > 0 ? carryOverSourceIds : undefined,
        carriedBalanceSources:
          carriedBalanceSources.length > 0 ? carriedBalanceSources : undefined,
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
      carryOverSourceIds,
    });
  }

  return {
    chargesToCreate,
    skippedCount,
    untransferredPlanChargeIds: Array.from(untransferredPlanChargeIdsSet),
  };
}

