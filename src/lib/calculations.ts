import { Client, Vehicle, Charge, Payment, Plan, ClientConsolidatedFinancials } from '../types';

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

export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonthStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function isDateOverdue(dueDate: string): boolean {
  if (!dueDate) return false;
  const today = getTodayIsoDate();
  return dueDate < today;
}

export function isDateToday(dueDate: string): boolean {
  if (!dueDate) return false;
  const today = getTodayIsoDate();
  return dueDate === today;
}

export function getDaysDifference(dueDate: string): number {
  if (!dueDate) return 0;
  const today = new Date(getTodayIsoDate() + 'T00:00:00');
  const target = new Date(dueDate.split('T')[0] + 'T00:00:00');
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
      estimatedMonthlyRevenue += Number(v.monthlyValue) || 0;
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
      totalReceivedMonth += Number(p.amount) || 0;
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

    const remaining = Number(c.remainingBalance) || 0;
    const isDue = c.dueDate < today && remaining > 0;
    const isToday = c.dueDate === today && remaining > 0;
    const isPendingOrPartial = (c.status === 'pendente' || c.status === 'parcial') && remaining > 0;

    if (remaining > 0) {
      totalPendingBalance += remaining;
    }

    if (getEffectiveBillingMonth(c) === currentMonth && isPendingOrPartial) {
      totalToReceiveMonth += remaining;
    }

    if (c.status === 'parcial' && remaining > 0) {
      totalPartialAmount += remaining;
      partialCharges.push(c);
    }

    if (isDue) {
      totalOverdueAmount += remaining;
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
      totalMonthlyValue += Number(v.monthlyValue) || 0;
    }
  });

  let totalReceived = 0;
  let totalPending = 0;
  let totalOverdue = 0;
  let isOverdue = false;

  clientCharges.forEach((c) => {
    totalReceived += Number(c.paidAmount) || 0;
    const remaining = Number(c.remainingBalance) || 0;
    if (remaining > 0) {
      totalPending += remaining;
      if (c.dueDate < today) {
        totalOverdue += remaining;
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
  if (charge.isPostponed && charge.dueDate && /^\d{4}-\d{2}-\d{2}/.test(charge.dueDate)) {
    return charge.dueDate.slice(0, 7);
  }
  return charge.referenceMonth;
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
 * Motor puro de planejamento das mensalidades de uma competência (YYYY-MM):
 * - Respeita o início somente no mês seguinte ao cadastro do cliente.
 * - Gera 1 cobrança única consolidada por plano ativo do cliente.
 * - Gera cobranças individuais por veículo para clientes sem plano.
 * - Bloqueia duplicidades e respeita adiamentos sem alterar o dia habitual futuro.
 */
export function planMonthlyCharges({
  month,
  clients,
  vehicles,
  plans,
  charges,
}: {
  month: string;
  clients: Client[];
  vehicles: Vehicle[];
  plans: Plan[];
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

  const activeVehicles = vehicles.filter((v) => v.status === 'ativo');
  const activePlans = plans.filter((p) => p.status === 'ativo');

  const coveredVehicleIds = new Set<string>();
  const planGroups = new Map<
    string,
    { clientId: string; planId: string; planName: string; planValue: number; vehicles: Vehicle[] }
  >();

  // 1A. Planos vinculados diretamente ao cliente (client.planId) — referência principal
  for (const client of clients) {
    if (client.status === 'inativo' || !client.planId) continue;
    const plan = activePlans.find((p) => p.id === client.planId);
    if (!plan) continue;

    const clientVehicles = activeVehicles.filter((v) => v.clientId === client.id);
    if (clientVehicles.length === 0) continue;

    const key = `${client.id}__${plan.id}`;
    planGroups.set(key, {
      clientId: client.id,
      planId: plan.id,
      planName: plan.name || client.planName || 'Plano',
      planValue: Number(plan.totalMonthlyValue) || 0,
      vehicles: clientVehicles,
    });
    clientVehicles.forEach((v) => coveredVehicleIds.add(v.id));
  }

  // 1B. Fallback: veículos ativos vinculados via vehicle.planId
  for (const v of activeVehicles) {
    if (coveredVehicleIds.has(v.id)) continue;
    if (v.planId) {
      const key = `${v.clientId}__${v.planId}`;
      const existing = planGroups.get(key);
      if (existing) {
        existing.vehicles.push(v);
      } else {
        const plan = activePlans.find((p) => p.id === v.planId);
        planGroups.set(key, {
          clientId: v.clientId,
          planId: v.planId,
          planName: plan?.name || v.planName || 'Plano',
          planValue: Number(plan?.totalMonthlyValue ?? v.monthlyValue) || 0,
          vehicles: [v],
        });
      }
      coveredVehicleIds.add(v.id);
    }
  }

  const standaloneVehicles = activeVehicles.filter((v) => !coveredVehicleIds.has(v.id));

  // 2. Cobranças únicas consolidadas por plano
  for (const [, group] of planGroups.entries()) {
    const { clientId, planId, planName, planValue, vehicles: groupVehicles } = group;
    const client = clientMap.get(clientId);

    if (client?.status === 'inativo' || !isCompetenceEligibleForClient(month, client)) {
      skippedCount++;
      continue;
    }

    const firstVehicle = groupVehicles[0];
    const groupVehicleIds = groupVehicles.map((v) => v.id);

    const relatedPlanCharges = charges.filter(
      (c) =>
        c.status !== 'cancelado' &&
        c.isPlanCharge &&
        c.clientId === clientId &&
        (c.planId === planId || c.referenceMonth === month)
    );

    if (isChargeBlockedByExistingOrPostponement(month, relatedPlanCharges)) {
      skippedCount++;
      continue;
    }

    const clientName = client?.name || 'Cliente';
    const dueDate = getSafeDueDate(targetYear, targetMonthIndex, firstVehicle.dueDay || 10);
    const platesList = groupVehicles.map((v) => v.plate);
    const deterministicPlanChargeId = `chg_plan_${clientId}_${planId}_${month}`.replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );

    const supersededChargeIds = charges
      .filter(
        (c) =>
          !c.isPlanCharge &&
          c.referenceMonth === month &&
          c.status === 'pendente' &&
          (c.paidAmount || 0) === 0 &&
          (c.clientId === clientId || groupVehicleIds.includes(c.vehicleId))
      )
      .map((c) => c.id);

    chargesToCreate.push({
      deterministicId: deterministicPlanChargeId,
      data: {
        clientId,
        clientName,
        vehicleId: firstVehicle.id,
        vehiclePlate: platesList.join(', '),
        vehicleModel: `${groupVehicles.length} veículo(s) vinculados`,
        referenceMonth: month,
        originalMonthlyValue: planValue,
        previousBalanceCarried: 0,
        discount: 0,
        addition: 0,
        totalAmount: planValue,
        paidAmount: 0,
        remainingBalance: planValue,
        dueDate,
        status: 'pendente',
        balanceHandling: 'none',
        isPlanCharge: true,
        planId,
        planName,
        vehicleIds: groupVehicleIds,
        vehiclePlates: platesList,
      },
      supersededChargeIds,
    });
  }

  // 3. Cobranças individuais por veículo para clientes sem plano
  for (const vehicle of standaloneVehicles) {
    const client = clientMap.get(vehicle.clientId);

    if (client?.status === 'inativo' || !isCompetenceEligibleForClient(month, client)) {
      skippedCount++;
      continue;
    }

    const relatedVehicleCharges = charges.filter(
      (c) => c.status !== 'cancelado' && !c.isPlanCharge && c.vehicleId === vehicle.id
    );

    if (isChargeBlockedByExistingOrPostponement(month, relatedVehicleCharges)) {
      skippedCount++;
      continue;
    }

    const clientName = client?.name || 'Cliente';
    const prevCharges = charges.filter(
      (c) => c.vehicleId === vehicle.id && c.remainingBalance > 0 && c.balanceHandling === 'next_month'
    );
    const carriedBalance = prevCharges.reduce((sum, item) => sum + item.remainingBalance, 0);

    const dueDate = getSafeDueDate(targetYear, targetMonthIndex, vehicle.dueDay || 10);
    const totalAmount = Number(vehicle.monthlyValue) + carriedBalance;
    const deterministicVehChargeId = `chg_veh_${vehicle.id}_${month}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    chargesToCreate.push({
      deterministicId: deterministicVehChargeId,
      data: {
        clientId: vehicle.clientId,
        clientName,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        vehicleModel: `${vehicle.brand} ${vehicle.model}`,
        referenceMonth: month,
        originalMonthlyValue: Number(vehicle.monthlyValue),
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

