import { Client, Vehicle, Charge, Payment, ClientConsolidatedFinancials } from '../types';

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

    if (c.referenceMonth === currentMonth && isPendingOrPartial) {
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
