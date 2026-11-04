export type VehicleType = 'carro' | 'moto' | 'caminhao' | 'outro';
export type VehicleStatus = 'ativo' | 'suspenso' | 'cancelado';
export type ClientStatus = 'ativo' | 'inativo';
export type ChargeStatus = 'pendente' | 'parcial' | 'pago' | 'cancelado';
export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'transferencia';
export type BalanceHandling = 'none' | 'next_month' | 'specific_date' | 'open_negotiation';
export type UserRole = 'admin' | 'operator';

export interface PlanVehicleItem {
  vehicleType: VehicleType;
  count: number;
  unitValue: number;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  composition: PlanVehicleItem[];
  totalMonthlyValue: number;
  status: 'ativo' | 'inativo';
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface Client {
  id: string;
  name: string;
  document: string; // CPF or CNPJ
  phone: string;
  whatsapp: string;
  email?: string;
  address?: string;
  notes?: string;
  status: ClientStatus;
  planId?: string;
  planName?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface Vehicle {
  id: string;
  clientId: string;
  vehicleType: VehicleType;
  brand: string;
  model: string;
  plate: string;
  color: string;
  planId?: string;
  planName?: string;
  planDescription: string;
  monthlyValue: number;
  dueDay: number;
  contractStartDate: string;
  notes?: string;
  status: VehicleStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface Charge {
  id: string;
  clientId: string;
  clientName: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  referenceMonth: string; // e.g., '2026-11'
  originalMonthlyValue: number;
  previousBalanceCarried: number;
  discount: number;
  addition: number;
  totalAmount: number;
  paidAmount: number;
  remainingBalance: number;
  dueDate: string; // YYYY-MM-DD
  status: ChargeStatus;
  balanceHandling?: BalanceHandling;
  balanceScheduledDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface Payment {
  id: string;
  chargeId: string;
  clientId: string;
  clientName: string;
  vehicleId: string;
  vehiclePlate: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  operatorId: string;
  operatorName: string;
  receiptNumber: string;
  remainingAfterPayment: number;
  notes?: string;
  createdAt: string;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  tradeName?: string;
  cnpj: string;
  phone: string;
  whatsapp: string;
  email?: string;
  pixKey: string;
  pixKeyType: string;
  address: string;
  receiptFooterMessage: string;
  logoSvg?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  operatorId: string;
  operatorEmail: string;
  details: string;
  timestamp: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
  active: boolean;
}

export interface ClientConsolidatedFinancials {
  client: Client;
  vehiclesCount: number;
  vehicles: Vehicle[];
  totalMonthlyValue: number;
  totalReceived: number;
  totalPending: number;
  totalOverdue: number;
  charges: Charge[];
  isOverdue: boolean;
}
