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
  trackerModel?: string; // Modelo do equipamento rastreador instalado
  trackerSerial?: string; // Número de série do rastreador (Serial individual)
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
  companySnapshot?: Partial<CompanySettings>;
  createdAt: string;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  tradeName?: string;
  cnpj: string; // CNPJ ou CPF
  phone: string;
  whatsapp: string;
  email?: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string; // CEP
  website?: string;
  pixKey: string;
  pixKeyType: string;
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

// ==========================================
// SERVIÇOS TÉCNICOS (Instalação, Retirada, Manutenção, Reinstalação)
// ==========================================
export type TechnicalServiceCategory = 'Instalação' | 'Retirada' | 'Manutenção' | 'Reinstalação';

export interface TechnicalServiceItem {
  id: string;
  category: TechnicalServiceCategory;
  description: string;
  value: number;
}

export interface TechnicalServiceOrder {
  id: string;
  orderNumber: string; // ex: OS-202611-0001
  date?: string; // YYYY-MM-DD
  executionDate?: string; // YYYY-MM-DD
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientDocument?: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleBrand?: string;
  vehicleModel: string;
  vehicleColor?: string;
  technicianName?: string;
  items: TechnicalServiceItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentMethod: 'dinheiro' | 'pix';
  paidAmount: number;
  remainingBalance: number;
  paymentDate?: string;
  status: 'pendente' | 'parcial' | 'pago';
  receiptNumber: string; // ex: REC-ST-202611-0001
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// ==========================================
// GASTOS DA EMPRESA (Despesas e Compras)
// ==========================================
export type ExpenseCategory =
  | 'Apoio Rastreamento'
  | 'Chips'
  | 'Sistema'
  | 'Rastreadores'
  | 'Sensor'
  | 'Antifurto'
  | 'Chicotes'
  | 'Relê'
  | 'Fita Isolante'
  | 'Abraçadeira'
  | 'Outros Gastos';

export interface ExpenseItem {
  id: string;
  category: ExpenseCategory;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface CompanyExpense {
  id: string;
  expenseNumber: string; // ex: DESP-202611-0001
  voucherNumber: string; // ex: COMP-202611-0001 (Comprovante de Despesa)
  date: string; // YYYY-MM-DD
  paymentDate?: string;
  supplier: string; // Fornecedor ou estabelecimento
  operationDescription?: string;
  items: ExpenseItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  remainingBalance: number;
  paymentMethod: 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'transferencia';
  status: 'pago' | 'pendente' | 'parcial';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// ==========================================
// GESTÃO GERAL DA EMPRESA (Visão Consolidada)
// ==========================================
export type TransactionOrigin = 'mensalidade' | 'servico_tecnico' | 'despesa';
export type TransactionType = 'receita' | 'despesa';

export interface GeneralTransaction {
  id: string;
  date: string;
  description: string;
  entityName?: string;
  partyName: string; // Cliente ou Fornecedor
  identifier: string; // Recibo, O.S. ou Comprovante
  category?: string;
  origin: TransactionOrigin;
  originLabel?: string;
  type: TransactionType;
  totalAmount?: number;
  amount: number;
  paidAmount?: number;
  pendingAmount?: number;
  paymentMethod?: string;
  status: 'pago' | 'parcial' | 'pendente';
  documentNumber?: string;
  rawRecordId: string;
  originalId?: string;
}

export interface GeneralFinancialSummary {
  periodStart?: string;
  periodEnd?: string;
  totalRevenueReceived: number;
  totalExpensesPaid: number;
  netBalance: number;
  monthlyReceived?: number;
  servicesReceived?: number;
  expensesPaid?: number;
  monthlyFeesReceived?: number;
  servicesRevenueReceived?: number;
  companyExpensesPaid?: number;
  pendingReceivables?: number;
  monthlyPending?: number;
  servicesPending?: number;
  expensesPending?: number;
  totalPendingReceivables?: number;
  totalPendingPayables?: number;
  partiallyReceivedAmount?: number;
  totalTransactionsCount?: number;
}
