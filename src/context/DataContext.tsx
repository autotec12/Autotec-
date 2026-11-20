import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  runTransaction,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from '../lib/firebase';
import {
  Client,
  Vehicle,
  Charge,
  ChargePostponementRecord,
  Payment,
  ConsolidatedPaymentItem,
  CompanySettings,
  AuditLog,
  PaymentMethod,
  BalanceHandling,
  Plan,
  PlanVehicleItem,
  TechnicalServiceOrder,
  TechnicalServiceItem,
  CompanyExpense,
  ExpenseItem,
  Technician,
  TechnicianPayment,
  TechnicalServiceType,
  ExpenseCategoryItem,
  FixedExpense,
} from '../types';
import { useAuth } from './AuthContext';
import {
  getCurrentMonthStr,
  getTodayIsoDate,
  getCompetenceLabel,
  formatDate,
  getPostponeEligibility,
  normalizeIsoDate,
} from '../lib/calculations';
import {
  FinancialStoreAdapter,
  FinancialValidationError,
  TransactionLike,
  createOperationId,
  executeCreateChargeIfAbsent,
  executeMonthlyChargeGeneration,
  executeRecordConsolidatedPayment,
  executeRecordPayment,
} from '../lib/financialTransactions';

export interface RefreshDataResult {
  ok: boolean;
  error?: string;
  refreshedAt?: string;
  failedCollections?: string[];
}

interface DataContextType {
  clients: Client[];
  vehicles: Vehicle[];
  charges: Charge[];
  payments: Payment[];
  plans: Plan[];
  companySettings: CompanySettings;
  auditLogs: AuditLog[];
  loading: boolean;
  hasLoadedOnce: boolean;
  isRefreshing: boolean;
  activeOperationsCount: number;
  activeOperationLabel: string | null;
  syncError: string | null;
  retrySync: () => void;
  refreshData: () => Promise<RefreshDataResult>;
  
  // Plan actions
  addPlan: (data: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updatePlan: (id: string, data: Partial<Plan>) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  togglePlanStatus: (id: string) => Promise<void>;
  seedDefaultPlans: () => Promise<void>;
  assignPlanToClient: (params: {
    clientId: string;
    planId: string | null;
    vehicleAssignments: {
      vehicleId: string;
      monthlyValue: number;
      planDescription?: string;
    }[];
    operatorNote?: string;
  }) => Promise<{ success: boolean; updatedVehicles: number }>;

  // Client actions
  addClient: (data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateClient: (id: string, data: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  
  // Vehicle actions
  addVehicle: (data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateVehicle: (id: string, data: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  
  // Charge actions
  addCharge: (data: Omit<Charge, 'id' | 'createdAt' | 'updatedAt'>, customId?: string) => Promise<string>;
  updateCharge: (id: string, data: Partial<Charge>) => Promise<void>;
  deleteCharge: (id: string) => Promise<void>;
  postponeCharge: (params: {
    chargeId: string;
    newDueDate: string;
    reason?: string;
  }) => Promise<ChargePostponementRecord>;
  generateMonthlyCharges: (month: string) => Promise<{ created: number; skipped: number }>;
  
  // Payment actions
  recordPayment: (params: {
    charge: Charge;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    balanceHandling?: BalanceHandling;
    balanceScheduledDate?: string;
    operationId?: string;
  }) => Promise<Payment>;
  recordConsolidatedPayment: (params: {
    clientId: string;
    clientName: string;
    items: { charge: Charge; amountToPay: number }[];
    paymentDate: string;
    paymentMethod: PaymentMethod;
    notes?: string;
    operationId?: string;
  }) => Promise<Payment>;
  
  // Technical Services actions
  technicalServices: TechnicalServiceOrder[];
  addTechnicalService: (data: Omit<TechnicalServiceOrder, 'id' | 'orderNumber' | 'receiptNumber' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateTechnicalService: (id: string, data: Partial<TechnicalServiceOrder>) => Promise<void>;
  deleteTechnicalService: (id: string) => Promise<void>;

  // Technicians actions
  technicians: Technician[];
  addTechnician: (data: Omit<Technician, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateTechnician: (id: string, data: Partial<Technician>) => Promise<void>;
  deleteTechnician: (id: string) => Promise<void>;
  toggleTechnicianStatus: (id: string) => Promise<void>;

  // Technician Payments actions (Controle de pagamentos da empresa aos técnicos)
  technicianPayments: TechnicianPayment[];
  recordTechnicianPayment: (params: {
    technicianId: string;
    technicianName: string;
    serviceIds: string[];
    amount: number;
    paymentDate: string;
    paymentMethod: 'dinheiro' | 'pix' | string;
    notes?: string;
  }) => Promise<string>;
  cancelTechnicianPayment: (paymentId: string, reason?: string) => Promise<void>;

  // Technical Service Types actions
  technicalServiceTypes: TechnicalServiceType[];
  addTechnicalServiceType: (data: Omit<TechnicalServiceType, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateTechnicalServiceType: (id: string, data: Partial<TechnicalServiceType>) => Promise<void>;
  deleteTechnicalServiceType: (id: string) => Promise<void>;
  toggleTechnicalServiceTypeStatus: (id: string) => Promise<void>;

  // Company Expenses actions
  companyExpenses: CompanyExpense[];
  addCompanyExpense: (data: Omit<CompanyExpense, 'id' | 'expenseNumber' | 'voucherNumber' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateCompanyExpense: (id: string, data: Partial<CompanyExpense>) => Promise<void>;
  deleteCompanyExpense: (id: string) => Promise<void>;

  // Custom Expense Categories actions
  customExpenseCategories: ExpenseCategoryItem[];
  addExpenseCategory: (data: Omit<ExpenseCategoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateExpenseCategory: (id: string, data: Partial<ExpenseCategoryItem>) => Promise<void>;
  deleteExpenseCategory: (id: string) => Promise<void>;
  toggleExpenseCategoryStatus: (id: string) => Promise<void>;

  // Fixed Expenses actions
  fixedExpenses: FixedExpense[];
  addFixedExpense: (data: Omit<FixedExpense, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateFixedExpense: (id: string, data: Partial<FixedExpense>) => Promise<void>;
  pauseFixedExpense: (id: string) => Promise<void>;
  resumeFixedExpense: (id: string) => Promise<void>;
  closeFixedExpense: (id: string) => Promise<void>;
  deleteFixedExpense: (id: string) => Promise<void>;
  generateFixedExpenseOccurrences: (occurrences: { fixedExpenseId: string; competence: string; amount: number; dueDate: string; notes?: string }[]) => Promise<{ created: number; skipped: number }>;

  // Selected Detail Item for navigation from Gestão Geral to source module
  selectedDetailItem: { type: 'mensalidade' | 'servico_tecnico' | 'despesa'; id: string } | null;
  setSelectedDetailItem: (item: { type: 'mensalidade' | 'servico_tecnico' | 'despesa'; id: string } | null) => void;
  // Selected Client ID for filtered billing/account navigation
  selectedBillingClientId: string | null;
  setSelectedBillingClientId: (clientId: string | null) => void;
  permissionNotice: string | null;

  // Settings
  updateCompanySettings: (settings: Partial<CompanySettings>) => Promise<void>;
  
  // Seed demo
  seedDemoData: () => Promise<void>;
}

import { AUTOTEC_LOGO_ORIGINAL_DATA_URI } from '../assets/autotecLogos';

export const INITIAL_DEFAULT_PLANS: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Plano Moto Individual',
    description: 'Plano dedicado para 1 motocicleta com cobertura e rastreamento integral.',
    composition: [{ vehicleType: 'moto', count: 1, unitValue: 60 }],
    totalMonthlyValue: 60,
    status: 'ativo',
  },
  {
    name: 'Plano Duas Motos',
    description: 'Pacote promocional para frotas de 2 motocicletas (R$ 50,00 por moto).',
    composition: [{ vehicleType: 'moto', count: 2, unitValue: 50 }],
    totalMonthlyValue: 100,
    status: 'ativo',
  },
  {
    name: 'Plano Carro Individual',
    description: 'Plano padrão para 1 veículo de passeio com rastreamento e assistência.',
    composition: [{ vehicleType: 'carro', count: 1, unitValue: 80 }],
    totalMonthlyValue: 80,
    status: 'ativo',
  },
  {
    name: 'Plano Moto + Carro',
    description: 'Pacote combinado com 1 carro (R$ 60,00) e 1 moto (R$ 50,00) com valor especial.',
    composition: [
      { vehicleType: 'carro', count: 1, unitValue: 60 },
      { vehicleType: 'moto', count: 1, unitValue: 50 },
    ],
    totalMonthlyValue: 110,
    status: 'ativo',
  },
];

const defaultSettings: CompanySettings = {
  id: 'default',
  companyName: 'AUTOTEC RASTREAMENTO VEICULAR',
  tradeName: 'AUTOTEC',
  cnpj: '38.450.812/0001-94',
  phone: '(11) 98765-4321',
  whatsapp: '(11) 98765-4321',
  email: 'contato@autotec.com.br',
  address: 'Atendimento e Suporte em todo o território nacional',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '01310-100',
  website: 'www.autotec.com.br',
  pixKey: '38.450.812/0001-94',
  pixKeyType: 'CNPJ',
  receiptFooterMessage: 'Agradecemos a confiança e preferência pelos serviços AUTOTEC!',
  logoSvg: AUTOTEC_LOGO_ORIGINAL_DATA_URI,
};

const DataContext = createContext<DataContextType>({} as DataContextType);

const firestoreFinancialStoreAdapter: FinancialStoreAdapter = {
  runTransaction: (fn) =>
    runTransaction(db, async (tx) => {
      const txWrapper: TransactionLike = {
        get: async (colName, id) => {
          const snap = await tx.get(doc(db, colName, id));
          return {
            id: snap.id,
            exists: () => snap.exists(),
            data: () => snap.data() as any,
          };
        },
        set: (colName, id, data) => {
          tx.set(doc(db, colName, id), cleanFirestoreData(data));
        },
        update: (colName, id, data) => {
          tx.update(doc(db, colName, id), cleanFirestoreData(data));
        },
      };
      return fn(txWrapper);
    }),
};

const REQUIRED_DATA_LISTENERS = [
  { key: 'company_settings', label: 'Configurações da Empresa' },
  { key: 'clients', label: 'Clientes' },
  { key: 'vehicles', label: 'Veículos' },
  { key: 'charges', label: 'Mensalidades' },
  { key: 'payments', label: 'Pagamentos' },
  { key: 'plans', label: 'Planos' },
  { key: 'technical_services', label: 'Serviços Técnicos' },
  { key: 'company_expenses', label: 'Gastos da Empresa' },
  { key: 'technicians', label: 'Técnicos' },
  { key: 'technical_service_types', label: 'Tipos de Serviço' },
  { key: 'expense_categories', label: 'Categorias de Despesas' },
  { key: 'fixed_expenses', label: 'Despesas Fixas' },
  { key: 'technician_payments', label: 'Pagamentos a Técnicos' },
  { key: 'audit_logs', label: 'Registros de Auditoria' },
] as const;

type ListenerKey = typeof REQUIRED_DATA_LISTENERS[number]['key'];

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [technicalServices, setTechnicalServices] = useState<TechnicalServiceOrder[]>([]);
  const [companyExpenses, setCompanyExpenses] = useState<CompanyExpense[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [technicianPayments, setTechnicianPayments] = useState<TechnicianPayment[]>([]);
  const [technicalServiceTypes, setTechnicalServiceTypes] = useState<TechnicalServiceType[]>([]);
  const [customExpenseCategories, setCustomExpenseCategories] = useState<ExpenseCategoryItem[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultSettings);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeOperationsCount, setActiveOperationsCount] = useState(0);
  const [activeOperationLabel, setActiveOperationLabel] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState<{ type: 'mensalidade' | 'servico_tecnico' | 'despesa'; id: string } | null>(null);
  const [selectedBillingClientId, setSelectedBillingClientId] = useState<string | null>(null);

  const prevUserUidRef = useRef<string | null>(null);
  const hasLoadedOnceRef = useRef<boolean>(false);
  const refreshPromiseRef = useRef<Promise<RefreshDataResult> | null>(null);

  const trackOperation = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    setActiveOperationsCount((prev) => prev + 1);
    setActiveOperationLabel(label);
    try {
      return await fn();
    } finally {
      setActiveOperationsCount((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) {
          setActiveOperationLabel(null);
        }
        return next;
      });
    }
  }, []);

  useEffect(() => {
    hasLoadedOnceRef.current = hasLoadedOnce;
  }, [hasLoadedOnce]);

  // Non-destructive, read-only manual refresh (Pull to Refresh & post-load sync retry)
  // Keeps all existing state, hasLoadedOnce, and real-time onSnapshot listeners intact.
  const refreshData = useCallback(async (): Promise<RefreshDataResult> => {
    if (!user) {
      return { ok: false, error: 'Sessão não autenticada.' };
    }
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineMsg = 'Sem conexão com a internet. Mantendo os últimos dados válidos carregados em tela.';
      setSyncError(offlineMsg);
      return { ok: false, error: offlineMsg };
    }

    setIsRefreshing(true);

    const runRefresh = (async (): Promise<RefreshDataResult> => {
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      try {
        const auditQuery = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));

        const fetchAll = Promise.allSettled([
          getDocFromServer(doc(db, 'company_settings', 'default')),
          getDocsFromServer(collection(db, 'clients')),
          getDocsFromServer(collection(db, 'vehicles')),
          getDocsFromServer(collection(db, 'charges')),
          getDocsFromServer(collection(db, 'payments')),
          getDocsFromServer(collection(db, 'plans')),
          getDocsFromServer(collection(db, 'technical_services')),
          getDocsFromServer(collection(db, 'company_expenses')),
          getDocsFromServer(collection(db, 'technicians')),
          getDocsFromServer(collection(db, 'technical_service_types')),
          getDocsFromServer(collection(db, 'expense_categories')),
          getDocsFromServer(collection(db, 'fixed_expenses')),
          getDocsFromServer(collection(db, 'technician_payments')),
          getDocsFromServer(auditQuery),
        ]);

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('SYNC_TIMEOUT')), 12000);
        });

        const results = await Promise.race([fetchAll, timeoutPromise]);
        if (timeoutHandle) clearTimeout(timeoutHandle);
        const failedLabels: string[] = [];

        // 1. Company Settings
        const settingsRes = results[0];
        if (settingsRes.status === 'fulfilled') {
          const snap = settingsRes.value;
          if (snap.exists()) {
            setCompanySettings({ ...defaultSettings, ...snap.data(), id: 'default' } as CompanySettings);
          } else {
            setCompanySettings(defaultSettings);
          }
        } else {
          failedLabels.push('Configurações da Empresa');
        }

        // Helper for collection snapshot mapping
        const mapDocs = <T extends { id: string }>(snap: { forEach: (cb: (d: any) => void) => void }) => {
          const list: T[] = [];
          snap.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() } as T);
          });
          return list;
        };

        // 2. Clients
        if (results[1].status === 'fulfilled') {
          setClients(mapDocs<Client>(results[1].value).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        } else failedLabels.push('Clientes');

        // 3. Vehicles
        if (results[2].status === 'fulfilled') {
          setVehicles(mapDocs<Vehicle>(results[2].value).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        } else failedLabels.push('Veículos');

        // 4. Charges
        if (results[3].status === 'fulfilled') {
          setCharges(mapDocs<Charge>(results[3].value).sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || '')));
        } else failedLabels.push('Mensalidades');

        // 5. Payments
        if (results[4].status === 'fulfilled') {
          setPayments(mapDocs<Payment>(results[4].value).sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')));
        } else failedLabels.push('Pagamentos');

        // 6. Plans
        if (results[5].status === 'fulfilled') {
          setPlans(mapDocs<Plan>(results[5].value).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        } else failedLabels.push('Planos');

        // 7. Technical Services
        if (results[6].status === 'fulfilled') {
          setTechnicalServices(mapDocs<TechnicalServiceOrder>(results[6].value).sort((a, b) => (b.date || '').localeCompare(a.date || '')));
        } else failedLabels.push('Serviços Técnicos');

        // 8. Company Expenses
        if (results[7].status === 'fulfilled') {
          setCompanyExpenses(mapDocs<CompanyExpense>(results[7].value).sort((a, b) => (b.date || '').localeCompare(a.date || '')));
        } else failedLabels.push('Gastos da Empresa');

        // 9. Technicians
        if (results[8].status === 'fulfilled') {
          setTechnicians(mapDocs<Technician>(results[8].value).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        } else failedLabels.push('Técnicos');

        // 10. Technical Service Types
        if (results[9].status === 'fulfilled') {
          setTechnicalServiceTypes(mapDocs<TechnicalServiceType>(results[9].value).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        } else failedLabels.push('Tipos de Serviço');

        // 11. Custom Expense Categories
        if (results[10].status === 'fulfilled') {
          setCustomExpenseCategories(mapDocs<ExpenseCategoryItem>(results[10].value).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        } else failedLabels.push('Categorias de Despesas');

        // 12. Fixed Expenses
        if (results[11].status === 'fulfilled') {
          setFixedExpenses(mapDocs<FixedExpense>(results[11].value).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        } else failedLabels.push('Despesas Fixas');

        // 13. Technician Payments
        if (results[12].status === 'fulfilled') {
          setTechnicianPayments(mapDocs<TechnicianPayment>(results[12].value).sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')));
        } else failedLabels.push('Pagamentos a Técnicos');

        // 14. Audit Logs
        if (results[13].status === 'fulfilled') {
          setAuditLogs(mapDocs<AuditLog>(results[13].value));
        } else failedLabels.push('Registros de Auditoria');

        if (failedLabels.length > 0) {
          const partialError = `Não foi possível atualizar: ${failedLabels.join(', ')}. Mantendo os últimos dados válidos em tela.`;
          setSyncError(partialError);
          return {
            ok: false,
            error: partialError,
            failedCollections: failedLabels,
          };
        }

        setSyncError(null);
        setPermissionNotice(null);
        return {
          ok: true,
          refreshedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        console.warn('Manual refresh notice:', err);
        const errorMsg =
          err?.message === 'SYNC_TIMEOUT'
            ? 'Tempo limite excedido ao consultar o Cloud Firestore. Mantendo os últimos dados válidos em tela.'
            : 'Não foi possível concluir a atualização com o Cloud Firestore. Mantendo os últimos dados válidos em tela.';
        setSyncError(errorMsg);
        return {
          ok: false,
          error: errorMsg,
        };
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        refreshPromiseRef.current = null;
        setIsRefreshing(false);
      }
    })();

    refreshPromiseRef.current = runRefresh;
    return runRefresh;
  }, [user]);

  const retrySync = useCallback(() => {
    if (hasLoadedOnceRef.current) {
      void refreshData();
      return;
    }
    setSyncError(null);
    setLoading(true);
    setSyncAttempt((prev) => prev + 1);
  }, [refreshData]);

  // Sync Listeners
  useEffect(() => {
    // Only attach if user is signed in
    if (!user) {
      prevUserUidRef.current = null;
      hasLoadedOnceRef.current = false;
      setClients([]);
      setVehicles([]);
      setCharges([]);
      setPayments([]);
      setPlans([]);
      setTechnicalServices([]);
      setCompanyExpenses([]);
      setTechnicians([]);
      setTechnicianPayments([]);
      setTechnicalServiceTypes([]);
      setCustomExpenseCategories([]);
      setFixedExpenses([]);
      setCompanySettings(defaultSettings);
      setAuditLogs([]);
      setHasLoadedOnce(false);
      setSyncError(null);
      setPermissionNotice(null);
      setLoading(false);
      return;
    }

    const isDifferentUser = prevUserUidRef.current !== user.uid;
    if (isDifferentUser) {
      prevUserUidRef.current = user.uid;
      hasLoadedOnceRef.current = false;
      setClients([]);
      setVehicles([]);
      setCharges([]);
      setPayments([]);
      setPlans([]);
      setTechnicalServices([]);
      setCompanyExpenses([]);
      setTechnicians([]);
      setTechnicianPayments([]);
      setTechnicalServiceTypes([]);
      setCustomExpenseCategories([]);
      setFixedExpenses([]);
      setCompanySettings(defaultSettings);
      setAuditLogs([]);
      setHasLoadedOnce(false);
    }

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    setSyncError(null);

    let isActive = true;
    const respondedKeys = new Set<ListenerKey>();
    const erroredCollections = new Map<ListenerKey, string>();

    const updateSyncState = () => {
      if (!isActive) return;

      const allSettled = REQUIRED_DATA_LISTENERS.every((item) => respondedKeys.has(item.key));

      if (erroredCollections.size > 0) {
        const failedLabels = Array.from(erroredCollections.values()).join(', ');
        setSyncError(
          `Não foi possível sincronizar: ${failedLabels}. Os dados apresentados podem estar incompletos.`
        );
        if (allSettled) {
          setLoading(false);
        }
        return;
      }

      setSyncError(null);
      setPermissionNotice(null);

      if (allSettled) {
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
        setLoading(false);
      }
    };

    const markSuccess = (key: ListenerKey) => {
      respondedKeys.add(key);
      erroredCollections.delete(key);
      updateSyncState();
    };

    const markError = (
      key: ListenerKey,
      label: string,
      error: unknown,
      operationType: OperationType,
      path: string
    ) => {
      respondedKeys.add(key);
      erroredCollections.set(key, label);
      try {
        handleFirestoreError(error, operationType, path);
      } catch (err) {
        console.warn(`Aviso de permissão/sincronização no Firestore para "${path}":`, err);
      }
      updateSyncState();
    };

    // 1. Company Settings (Read-only on snapshot; never overwrite existing settings automatically)
    const unsubSettings = onSnapshot(
      doc(db, 'company_settings', 'default'),
      (snap) => {
        if (snap.exists()) {
          setCompanySettings({ ...defaultSettings, ...snap.data(), id: 'default' } as CompanySettings);
        } else {
          setCompanySettings(defaultSettings);
        }
        markSuccess('company_settings');
      },
      (error) => {
        markError('company_settings', 'Configurações da Empresa', error, OperationType.GET, 'company_settings/default');
      }
    );

    // 2. Clients
    const unsubClients = onSnapshot(
      collection(db, 'clients'),
      (snap) => {
        const list: Client[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Client);
        });
        setClients(list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        markSuccess('clients');
      },
      (error) => {
        markError('clients', 'Clientes', error, OperationType.LIST, 'clients');
      }
    );

    // 3. Vehicles
    const unsubVehicles = onSnapshot(
      collection(db, 'vehicles'),
      (snap) => {
        const list: Vehicle[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Vehicle);
        });
        setVehicles(list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        markSuccess('vehicles');
      },
      (error) => {
        markError('vehicles', 'Veículos', error, OperationType.LIST, 'vehicles');
      }
    );

    // 4. Charges
    const unsubCharges = onSnapshot(
      collection(db, 'charges'),
      (snap) => {
        const list: Charge[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Charge);
        });
        setCharges(list.sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || '')));
        markSuccess('charges');
      },
      (error) => {
        markError('charges', 'Mensalidades', error, OperationType.LIST, 'charges');
      }
    );

    // 5. Payments
    const unsubPayments = onSnapshot(
      collection(db, 'payments'),
      (snap) => {
        const list: Payment[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Payment);
        });
        setPayments(list.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')));
        markSuccess('payments');
      },
      (error) => {
        markError('payments', 'Pagamentos', error, OperationType.LIST, 'payments');
      }
    );

    // 6. Plans (Read-only on snapshot; do not auto-seed during initial load)
    const unsubPlans = onSnapshot(
      collection(db, 'plans'),
      (snap) => {
        const list: Plan[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Plan);
        });
        setPlans(list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        markSuccess('plans');
      },
      (error) => {
        markError('plans', 'Planos', error, OperationType.LIST, 'plans');
      }
    );

    // 7. Technical Services (Ordens de Serviços Técnicos)
    const unsubServices = onSnapshot(
      collection(db, 'technical_services'),
      (snap) => {
        const list: TechnicalServiceOrder[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as TechnicalServiceOrder);
        });
        setTechnicalServices(list.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
        markSuccess('technical_services');
      },
      (error) => {
        markError('technical_services', 'Serviços Técnicos', error, OperationType.LIST, 'technical_services');
      }
    );

    // 8. Company Expenses (Gastos e Compras Operacionais da Empresa)
    const unsubExpenses = onSnapshot(
      collection(db, 'company_expenses'),
      (snap) => {
        const list: CompanyExpense[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as CompanyExpense);
        });
        setCompanyExpenses(list.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
        markSuccess('company_expenses');
      },
      (error) => {
        markError('company_expenses', 'Gastos da Empresa', error, OperationType.LIST, 'company_expenses');
      }
    );

    // 9. Technicians
    const unsubTechnicians = onSnapshot(
      collection(db, 'technicians'),
      (snap) => {
        const list: Technician[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Technician);
        });
        setTechnicians(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        markSuccess('technicians');
      },
      (error) => {
        markError('technicians', 'Técnicos', error, OperationType.LIST, 'technicians');
      }
    );

    // 10. Technical Service Types
    const unsubServiceTypes = onSnapshot(
      collection(db, 'technical_service_types'),
      (snap) => {
        const list: TechnicalServiceType[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as TechnicalServiceType);
        });
        setTechnicalServiceTypes(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        markSuccess('technical_service_types');
      },
      (error) => {
        markError('technical_service_types', 'Tipos de Serviço', error, OperationType.LIST, 'technical_service_types');
      }
    );

    // 11. Custom Expense Categories
    const unsubExpCategories = onSnapshot(
      collection(db, 'expense_categories'),
      (snap) => {
        const list: ExpenseCategoryItem[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as ExpenseCategoryItem);
        });
        setCustomExpenseCategories(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        markSuccess('expense_categories');
      },
      (error) => {
        markError('expense_categories', 'Categorias de Despesas', error, OperationType.LIST, 'expense_categories');
      }
    );

    // 12. Fixed Expenses (Despesas Fixas e Custos Recorrentes)
    const unsubFixedExpenses = onSnapshot(
      collection(db, 'fixed_expenses'),
      (snap) => {
        const list: FixedExpense[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as FixedExpense);
        });
        setFixedExpenses(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        markSuccess('fixed_expenses');
      },
      (error) => {
        markError('fixed_expenses', 'Despesas Fixas', error, OperationType.LIST, 'fixed_expenses');
      }
    );

    // 13. Technician Payments
    const unsubTechPayments = onSnapshot(
      collection(db, 'technician_payments'),
      (snap) => {
        const list: TechnicianPayment[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as TechnicianPayment);
        });
        setTechnicianPayments(list.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')));
        markSuccess('technician_payments');
      },
      (error) => {
        markError('technician_payments', 'Pagamentos a Técnicos', error, OperationType.LIST, 'technician_payments');
      }
    );

    // 14. Audit Logs
    const auditQuery = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubAudit = onSnapshot(
      auditQuery,
      (snap) => {
        const list: AuditLog[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
        });
        setAuditLogs(list);
        markSuccess('audit_logs');
      },
      (error) => {
        markError('audit_logs', 'Registros de Auditoria', error, OperationType.LIST, 'audit_logs');
      }
    );

    // Offline / connection-unavailability detection (never treats unreceived data as zero)
    const handleOffline = () => {
      if (!isActive) return;
      if (!hasLoadedOnceRef.current) {
        setSyncError(
          'Sem conexão com a internet. Não foi possível sincronizar os dados com o Cloud Firestore.'
        );
        setLoading(false);
      } else {
        setSyncError(
          'Conexão com a internet interrompida. Exibindo os últimos dados válidos carregados; novas atualizações serão sincronizadas ao reconectar.'
        );
      }
    };

    const handleOnline = () => {
      if (!isActive) return;
      const allSettled = REQUIRED_DATA_LISTENERS.every((item) => respondedKeys.has(item.key));
      if (!allSettled && !hasLoadedOnceRef.current) {
        setSyncError(null);
        setLoading(true);
      } else if (erroredCollections.size === 0) {
        setSyncError(null);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
      if (typeof navigator !== 'undefined' && !navigator.onLine && !hasLoadedOnceRef.current) {
        handleOffline();
      }
    }

    // Connection-timeout safeguard only for reporting unavailability if Firestore never responds
    const connectionGuardTimer = setTimeout(() => {
      if (!isActive) return;
      const allSettled = REQUIRED_DATA_LISTENERS.every((item) => respondedKeys.has(item.key));
      if (!allSettled && !hasLoadedOnceRef.current) {
        const pendingLabels = REQUIRED_DATA_LISTENERS
          .filter((item) => !respondedKeys.has(item.key))
          .map((item) => item.label);
        setSyncError(
          `Não foi possível concluir a sincronização inicial com o Cloud Firestore (${pendingLabels.slice(0, 4).join(', ')}${pendingLabels.length > 4 ? ' e outras coleções' : ''}). Verifique sua conexão e tente novamente.`
        );
        setLoading(false);
      }
    }, 10000);

    return () => {
      isActive = false;
      clearTimeout(connectionGuardTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('online', handleOnline);
      }
      unsubSettings();
      unsubClients();
      unsubVehicles();
      unsubCharges();
      unsubPayments();
      unsubPlans();
      unsubServices();
      unsubExpenses();
      unsubTechnicians();
      unsubTechPayments();
      unsubServiceTypes();
      unsubExpCategories();
      unsubFixedExpenses();
      unsubAudit();
    };
  }, [user?.uid, syncAttempt]);

  // Log Audit Action Helper
  const logAudit = async (action: string, entity: string, entityId: string, details: string) => {
    if (!user) return;
    try {
      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const logData: AuditLog = {
        id: logId,
        action,
        entity,
        entityId,
        operatorId: user.uid,
        operatorEmail: user.email || profile?.displayName || 'Operador',
        details,
        timestamp: new Date().toISOString(),
      };
      await setDoc(doc(db, 'audit_logs', logId), cleanFirestoreData(logData));
    } catch (err) {
      console.warn('Audit log write error:', err);
    }
  };

  // CLIENT ACTIONS
  const addClient = async (data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = `cli_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newClient: Client = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };
    try {
      await setDoc(doc(db, 'clients', id), cleanFirestoreData(newClient));
      await logAudit('CREATE', 'Client', id, `Cadastrou o cliente ${data.name}`);
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `clients/${id}`);
    }
  };

  const updateClient = async (id: string, data: Partial<Client>) => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'clients', id), cleanFirestoreData({
        ...data,
        updatedAt: now,
      }));
      await logAudit('UPDATE', 'Client', id, `Atualizou dados do cliente ${data.name || id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${id}`);
    }
  };

  const deleteClient = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'clients', id));
      await logAudit('DELETE', 'Client', id, `Excluiu o cliente ID ${id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `clients/${id}`);
    }
  };

  // VEHICLE ACTIONS
  const addVehicle = async (data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = `veh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newVehicle: Vehicle = {
      ...data,
      id,
      plate: data.plate.toUpperCase().trim(),
      monthlyValue: Number(data.monthlyValue),
      dueDay: Number(data.dueDay),
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };
    try {
      await setDoc(doc(db, 'vehicles', id), cleanFirestoreData(newVehicle));
      await logAudit('CREATE', 'Vehicle', id, `Cadastrou veículo ${newVehicle.plate} (${newVehicle.model}) para o cliente ${data.clientId}`);
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `vehicles/${id}`);
    }
  };

  const updateVehicle = async (id: string, data: Partial<Vehicle>) => {
    try {
      const now = new Date().toISOString();
      const payload: Record<string, any> = {
        ...data,
        updatedAt: now,
      };
      if (data.plate) payload.plate = data.plate.toUpperCase().trim();
      if (data.monthlyValue !== undefined) payload.monthlyValue = Number(data.monthlyValue);
      if (data.dueDay !== undefined) payload.dueDay = Number(data.dueDay);

      await updateDoc(doc(db, 'vehicles', id), cleanFirestoreData(payload));
      await logAudit('UPDATE', 'Vehicle', id, `Atualizou dados do veículo ID ${id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vehicles/${id}`);
    }
  };

  const deleteVehicle = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'vehicles', id));
      await logAudit('DELETE', 'Vehicle', id, `Excluiu veículo ID ${id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vehicles/${id}`);
    }
  };

  // PLAN ACTIONS
  const addPlan = async (data: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newPlan: Plan = {
      ...data,
      id,
      name: data.name.trim(),
      totalMonthlyValue: Number(data.totalMonthlyValue),
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };
    try {
      await setDoc(doc(db, 'plans', id), cleanFirestoreData(newPlan));
      await logAudit('CREATE', 'Plan', id, `Cadastrou o plano "${newPlan.name}" (R$ ${newPlan.totalMonthlyValue.toFixed(2)}/mês)`);
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `plans/${id}`);
      throw error;
    }
  };

  const updatePlan = async (id: string, data: Partial<Plan>) => {
    try {
      const now = new Date().toISOString();
      const payload: Record<string, any> = {
        ...data,
        updatedAt: now,
      };
      if (data.name) payload.name = data.name.trim();
      if (data.totalMonthlyValue !== undefined) payload.totalMonthlyValue = Number(data.totalMonthlyValue);

      await updateDoc(doc(db, 'plans', id), cleanFirestoreData(payload));
      await logAudit('UPDATE', 'Plan', id, `Atualizou dados do plano "${data.name || id}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `plans/${id}`);
      throw error;
    }
  };

  const deletePlan = async (id: string) => {
    const plan = plans.find((p) => p.id === id);
    const planName = plan?.name || id;

    const linkedVehicles = vehicles.filter((v) => v.planId === id);
    const linkedClients = clients.filter((c) => c.planId === id);

    if (linkedVehicles.length > 0 || linkedClients.length > 0) {
      throw new Error(
        `Não é possível excluir o plano "${planName}". Existem ${linkedClients.length} cliente(s) e ${linkedVehicles.length} veículo(s) vinculados a este plano. Desvincule os contratos ou desative o plano.`
      );
    }

    try {
      await deleteDoc(doc(db, 'plans', id));
      await logAudit('DELETE', 'Plan', id, `Excluiu o plano "${planName}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `plans/${id}`);
      throw error;
    }
  };

  const togglePlanStatus = async (id: string) => {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    const newStatus = plan.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'plans', id), cleanFirestoreData({
        status: newStatus,
        updatedAt: now,
      }));
      await logAudit('UPDATE', 'Plan', id, `Alterou status do plano "${plan.name}" para "${newStatus}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `plans/${id}`);
      throw error;
    }
  };

  const seedDefaultPlans = async () => {
    const now = new Date().toISOString();
    for (let idx = 0; idx < INITIAL_DEFAULT_PLANS.length; idx++) {
      const p = INITIAL_DEFAULT_PLANS[idx];
      const planId = `plan_default_${idx + 1}_${p.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const docData: Plan = {
        ...p,
        id: planId,
        createdAt: now,
        updatedAt: now,
        createdBy: user?.uid || 'sistema',
      };
      try {
        await setDoc(doc(db, 'plans', planId), cleanFirestoreData(docData));
      } catch (e) {
        console.warn('Erro ao semear plano padrão:', e);
      }
    }
    await logAudit('SEED', 'Plan', 'default_plans', 'Semeou os planos padrão da AUTOTEC no Firestore');
  };

  const assignPlanToClient = async (params: {
    clientId: string;
    planId: string | null;
    vehicleAssignments: {
      vehicleId: string;
      monthlyValue: number;
      planDescription?: string;
    }[];
    operatorNote?: string;
  }) => {
    const client = clients.find((c) => c.id === params.clientId);
    if (!client) throw new Error('Cliente não encontrado');

    const selectedPlan = params.planId ? plans.find((p) => p.id === params.planId) : null;
    const oldPlanName = client.planName || 'Avulso';
    const newPlanName = selectedPlan ? selectedPlan.name : (params.planId === null ? 'Avulso / Sem Plano' : 'Personalizado');

    const now = new Date().toISOString();

    // 1. Update client doc
    await updateDoc(doc(db, 'clients', client.id), cleanFirestoreData({
      planId: params.planId || null,
      planName: newPlanName,
      updatedAt: now,
    }));

    // 2. Update each vehicle doc individually
    let updatedCount = 0;
    const changesSummary: string[] = [];

    for (const assign of params.vehicleAssignments) {
      const veh = vehicles.find((v) => v.id === assign.vehicleId);
      if (!veh) continue;
      const oldVal = veh.monthlyValue;
      const newVal = Number(assign.monthlyValue);

      await updateDoc(doc(db, 'vehicles', veh.id), cleanFirestoreData({
        planId: params.planId || null,
        planName: newPlanName,
        monthlyValue: newVal,
        planDescription: assign.planDescription || newPlanName,
        updatedAt: now,
      }));
      updatedCount++;
      changesSummary.push(`${veh.plate} (${veh.model}): R$ ${oldVal.toFixed(2)} -> R$ ${newVal.toFixed(2)}`);
    }

    // 3. Log Audit as strictly required
    await logAudit(
      'PLAN_CHANGE',
      'Client',
      client.id,
      `Alteração de plano do cliente "${client.name}". Plano anterior: "${oldPlanName}" -> Novo plano: "${newPlanName}". Alterações nos veículos: [${changesSummary.join('; ')}]. Observação: ${params.operatorNote || 'Nenhuma'}`
    );

    return { success: true, updatedVehicles: updatedCount };
  };

  // CHARGE ACTIONS
  const addCharge = async (data: Omit<Charge, 'id' | 'createdAt' | 'updatedAt'>, customId?: string) => {
    const id = customId || createOperationId('chg');
    try {
      const result = await executeCreateChargeIfAbsent(firestoreFinancialStoreAdapter, {
        id,
        data,
        createdBy: user?.uid || '',
      });
      if (result.created) {
        await logAudit(
          'CREATE',
          'Charge',
          result.id,
          `Gerou cobrança ${result.charge.referenceMonth} do veículo ${result.charge.vehiclePlate}`
        );
      }
      return result.id;
    } catch (error) {
      if (error instanceof FinancialValidationError) {
        throw error;
      }
      handleFirestoreError(error, OperationType.CREATE, `charges/${id}`);
    }
  };

  const updateCharge = async (id: string, data: Partial<Charge>) => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'charges', id), cleanFirestoreData({
        ...data,
        updatedAt: now,
      }));
      await logAudit('UPDATE', 'Charge', id, `Atualizou dados da cobrança ID ${id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `charges/${id}`);
    }
  };

  const deleteCharge = async (id: string) => {
    try {
      const charge = charges.find((c) => c.id === id);
      if (!charge) {
        throw new Error('Cobrança não encontrada.');
      }

      // Safeguard: Check if there are any linked payments (individual or consolidated) or paid amount > 0
      const linkedPayments = payments.filter(
        (p) =>
          p.chargeId === id ||
          (Array.isArray(p.consolidatedItems) && p.consolidatedItems.some((item) => item.chargeId === id))
      );
      if ((charge.paidAmount && charge.paidAmount > 0) || linkedPayments.length > 0) {
        throw new Error(
          'Não é permitido excluir esta mensalidade pois ela possui registros de pagamentos vinculados. Para preservar a integridade contábil e auditoria financeira, a exclusão de cobranças com pagamentos é bloqueada.'
        );
      }

      await deleteDoc(doc(db, 'charges', id));
      await logAudit(
        'DELETE',
        'Charge',
        id,
        `Excluiu mensalidade de ${charge.referenceMonth} do veículo ${charge.vehiclePlate} (${charge.clientName}) no valor de R$ ${charge.totalAmount.toFixed(2)}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `charges/${id}`);
      throw error;
    }
  };

  // Adiar mensalidade (adiamento temporário somente da cobrança selecionada, preservando dia habitual e histórico)
  const postponeCharge = async ({
    chargeId,
    newDueDate,
    reason,
  }: {
    chargeId: string;
    newDueDate: string;
    reason?: string;
  }): Promise<ChargePostponementRecord> => {
    const charge = charges.find((c) => c.id === chargeId);
    if (!charge) {
      throw new Error('Mensalidade não encontrada.');
    }

    const eligibility = getPostponeEligibility(charge);
    if (!eligibility.allowed) {
      throw new Error(eligibility.reason || 'Esta mensalidade não pode ser adiada.');
    }

    const currentDueDate = normalizeIsoDate(charge.dueDate);
    const normalizedNewDate = normalizeIsoDate(newDueDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedNewDate)) {
      throw new Error('Informe uma data válida para o adiamento (dia, mês e ano).');
    }

    if (normalizedNewDate === currentDueDate) {
      throw new Error('A nova data de vencimento precisa ser diferente da data atual.');
    }

    const now = new Date().toISOString();
    const originalDueDate = normalizeIsoDate(charge.originalDueDate) || currentDueDate;
    const targetType: 'plano' | 'veiculo' = charge.isPlanCharge ? 'plano' : 'veiculo';
    const targetLabel = charge.isPlanCharge
      ? `${charge.planName || 'Plano'} (${charge.vehiclePlate})`
      : `${charge.vehiclePlate} — ${charge.vehicleModel}`;

    const postponementRecord: ChargePostponementRecord = {
      id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      originalDueDate,
      previousDueDate: currentDueDate,
      newDueDate: normalizedNewDate,
      referenceMonth: charge.referenceMonth,
      clientId: charge.clientId,
      clientName: charge.clientName,
      targetType,
      targetLabel,
      planId: charge.planId,
      vehicleId: charge.vehicleId,
      postponedAt: now,
      operatorId: user?.uid || 'system',
      operatorName: profile?.displayName || user?.displayName || user?.email || 'Operador',
      reason: reason?.trim() || undefined,
    };

    const nextHistory = [...(charge.postponementHistory || []), postponementRecord];

    try {
      await updateDoc(
        doc(db, 'charges', charge.id),
        cleanFirestoreData({
          dueDate: normalizedNewDate,
          originalDueDate,
          isPostponed: true,
          postponedAt: now,
          postponementCount: nextHistory.length,
          postponementHistory: nextHistory,
          updatedAt: now,
        })
      );

      await logAudit(
        'POSTPONE',
        'Charge',
        charge.id,
        `Adiou mensalidade (${charge.referenceMonth}) de ${charge.clientName} [${targetLabel}] de ${formatDate(charge.dueDate)} para ${formatDate(normalizedNewDate)}${reason?.trim() ? ` — Motivo: ${reason.trim()}` : ''}`
      );

      return postponementRecord;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `charges/${charge.id}`);
      throw error;
    }
  };

  // Generate Monthly Charges (Etapa A): 1 individual charge per active vehicle using its own monthlyValue and dueDay
  const generateMonthlyCharges = async (month: string) => {
    try {
      const result = await executeMonthlyChargeGeneration(firestoreFinancialStoreAdapter, {
        month,
        clients,
        vehicles,
        plans: [],
        charges,
        fetchServerCharges: async () => {
          const snap = await getDocsFromServer(collection(db, 'charges'));
          const serverCharges: Charge[] = [];
          snap.forEach((docSnap) => {
            serverCharges.push({ id: docSnap.id, ...docSnap.data() } as Charge);
          });
          return serverCharges;
        },
        createdBy: user?.uid || '',
      });

      if (result.created > 0) {
        await logAudit(
          'CREATE',
          'Charge',
          month,
          `Geração em lote (${month}): ${result.created} cobrança(s) criada(s), ${result.skipped} ignorada(s)`
        );
      }

      return { created: result.created, skipped: result.skipped };
    } catch (error) {
      if (error instanceof FinancialValidationError) {
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, `charges/${month}`);
    }
  };

  // RECORD PAYMENT (Atomic Transaction + Idempotency Key + Live Balance Validation)
  const recordConsolidatedPayment = async ({
    clientId,
    clientName,
    items,
    paymentDate,
    paymentMethod,
    notes = '',
    operationId,
  }: {
    clientId: string;
    clientName: string;
    items: { charge: Charge; amountToPay: number }[];
    paymentDate: string;
    paymentMethod: PaymentMethod;
    notes?: string;
    operationId?: string;
  }): Promise<Payment> => {
    try {
      const result = await executeRecordConsolidatedPayment(firestoreFinancialStoreAdapter, {
        clientId,
        clientName,
        items,
        paymentDate,
        paymentMethod,
        notes,
        operatorId: user?.uid || 'admin',
        operatorName: profile?.displayName || user?.displayName || user?.email || 'Administrador',
        companySnapshot: { ...companySettings },
        operationId,
      });

      if (!result.wasReplay) {
        await logAudit(
          'PAYMENT',
          'ConsolidatedPayment',
          result.payment.id,
          `Recebimento consolidado ${result.payment.receiptNumber} para ${clientName}: R$ ${result.payment.amount.toFixed(2)} (${items.length} veículos/mensalidades)`
        );
      }

      return result.payment;
    } catch (error) {
      if (error instanceof FinancialValidationError) {
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, `payments/${operationId || 'consolidated'}`);
    }
  };

  const recordPayment = async ({
    charge,
    amount,
    paymentMethod,
    notes,
    balanceHandling = 'none',
    balanceScheduledDate,
    operationId,
  }: {
    charge: Charge;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    balanceHandling?: BalanceHandling;
    balanceScheduledDate?: string;
    operationId?: string;
  }): Promise<Payment> => {
    try {
      const result = await executeRecordPayment(firestoreFinancialStoreAdapter, {
        chargeId: charge.id,
        amount,
        paymentMethod,
        notes,
        balanceHandling,
        balanceScheduledDate,
        operatorId: user?.uid || 'system',
        operatorName: profile?.displayName || user?.displayName || 'Operador',
        companySnapshot: { ...companySettings },
        operationId,
      });

      if (!result.wasReplay) {
        const auditDetails = result.isFullyPaid
          ? `Recebimento integral de R$ ${result.payment.amount.toFixed(2)} para ${result.payment.vehiclePlate} (${result.payment.receiptNumber})`
          : `Recebimento parcial de R$ ${result.payment.amount.toFixed(2)} para ${result.payment.vehiclePlate}. Saldo restante: R$ ${result.newRemainingBalance.toFixed(2)} (${result.payment.receiptNumber})`;

        await logAudit('PAYMENT', 'Payment', result.payment.id, auditDetails);
      }

      return result.payment;
    } catch (error) {
      if (error instanceof FinancialValidationError) {
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, `payments/${operationId || charge.id}`);
    }
  };

  // Settings
  const updateCompanySettings = async (settings: Partial<CompanySettings>) => {
    try {
      const now = new Date().toISOString();
      const payload = cleanFirestoreData({
        ...companySettings,
        ...settings,
        updatedAt: now,
        updatedBy: user?.uid || '',
      });
      await setDoc(doc(db, 'company_settings', 'default'), payload, { merge: true });
      await logAudit('UPDATE', 'CompanySettings', 'default', 'Atualizou dados cadastrais da empresa e recibos');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'company_settings/default');
      throw error;
    }
  };

  // TECHNICAL SERVICES ACTIONS
  const addTechnicalService = async (data: Omit<TechnicalServiceOrder, 'id' | 'orderNumber' | 'receiptNumber' | 'createdAt' | 'updatedAt'>) => {
    const id = `ts_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const orderNum = `OS-${now.slice(0, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const recNum = `REC-ST-${now.slice(0, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const subtotal = data.items.reduce((acc, item) => acc + Number(item.value || 0), 0);
    const discount = Number(data.discount || 0);
    const totalAmount = Math.max(0, subtotal - discount);
    const paidAmount = Number(data.paidAmount || 0);
    const remainingBalance = Math.max(0, totalAmount - paidAmount);

    let status: 'pendente' | 'parcial' | 'pago' = 'pendente';
    if (paidAmount >= totalAmount && totalAmount > 0) {
      status = 'pago';
    } else if (paidAmount > 0) {
      status = 'parcial';
    }

    const newOrder: TechnicalServiceOrder = {
      ...data,
      id,
      orderNumber: orderNum,
      receiptNumber: recNum,
      subtotal,
      discount,
      totalAmount,
      paidAmount,
      remainingBalance,
      status,
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };

    if (data.technicianFee !== undefined && data.technicianFee !== null) {
      const techFee = Number(data.technicianFee);
      const techPaid = Number(data.technicianPaidAmount || 0);
      const techRem = Math.max(0, techFee - techPaid);
      const techStatus: 'pendente' | 'parcial' | 'pago' = techPaid >= techFee && techFee > 0 ? 'pago' : techPaid > 0 ? 'parcial' : 'pendente';
      newOrder.technicianFee = techFee;
      newOrder.technicianPaidAmount = techPaid;
      newOrder.technicianRemainingBalance = techRem;
      newOrder.technicianPaymentStatus = techStatus;
    }

    try {
      await setDoc(doc(db, 'technical_services', id), cleanFirestoreData(newOrder));
      await logAudit('CREATE', 'TechnicalService', id, `Criou a O.S. ${orderNum} para ${data.clientName} (${data.vehiclePlate}) no valor de R$ ${totalAmount.toFixed(2)}`);
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `technical_services/${id}`);
    }
  };

  const updateTechnicalService = async (id: string, data: Partial<TechnicalServiceOrder>) => {
    try {
      const now = new Date().toISOString();
      const existing = technicalServices.find((s) => s.id === id);
      const items = data.items || existing?.items || [];
      const subtotal = items.reduce((acc, item) => acc + Number(item.value || 0), 0);
      const discount = data.discount !== undefined ? Number(data.discount) : (existing?.discount || 0);
      const totalAmount = Math.max(0, subtotal - discount);
      const paidAmount = data.paidAmount !== undefined ? Number(data.paidAmount) : (existing?.paidAmount || 0);
      const remainingBalance = Math.max(0, totalAmount - paidAmount);

      let status: 'pendente' | 'parcial' | 'pago' = 'pendente';
      if (paidAmount >= totalAmount && totalAmount > 0) {
        status = 'pago';
      } else if (paidAmount > 0) {
        status = 'parcial';
      }

      const payload: any = {
        ...data,
        subtotal,
        discount,
        totalAmount,
        paidAmount,
        remainingBalance,
        status,
        updatedAt: now,
      };

      if (data.technicianFee !== undefined) {
        const techFee = Number(data.technicianFee);
        const techPaid = data.technicianPaidAmount !== undefined 
          ? Number(data.technicianPaidAmount) 
          : Number(existing?.technicianPaidAmount || 0);
        const techRem = Math.max(0, techFee - techPaid);
        const techStatus: 'pendente' | 'parcial' | 'pago' = techPaid >= techFee && techFee > 0 ? 'pago' : techPaid > 0 ? 'parcial' : 'pendente';
        payload.technicianFee = techFee;
        payload.technicianPaidAmount = techPaid;
        payload.technicianRemainingBalance = techRem;
        payload.technicianPaymentStatus = techStatus;
      }

      await updateDoc(doc(db, 'technical_services', id), cleanFirestoreData(payload));
      await logAudit('UPDATE', 'TechnicalService', id, `Atualizou O.S. ${existing?.orderNumber || id} (${status})`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `technical_services/${id}`);
    }
  };

  const deleteTechnicalService = async (id: string) => {
    try {
      const existing = technicalServices.find((s) => s.id === id);
      await deleteDoc(doc(db, 'technical_services', id));
      await logAudit('DELETE', 'TechnicalService', id, `Excluiu O.S. ${existing?.orderNumber || id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `technical_services/${id}`);
    }
  };

  // Record Technician Payment (Controle de quitação para os técnicos prestadores)
  const recordTechnicianPayment = async (params: {
    technicianId: string;
    technicianName: string;
    serviceIds: string[];
    amount: number;
    paymentDate: string;
    paymentMethod: 'dinheiro' | 'pix' | string;
    notes?: string;
  }) => {
    const id = `tp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const recNum = `REC-TEC-${now.slice(0, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const techObj = technicians.find((t) => t.id === params.technicianId);
    const ordersToUpdate = technicalServices.filter((s) => params.serviceIds.includes(s.id));
    const serviceOrderNumbers = ordersToUpdate.map((o) => o.orderNumber);

    // Distribuir baixa e gerar detalhamento dos itens quitados
    let remainingToDistribute = Number(params.amount);
    const paymentItems: import('../types').TechnicianPaymentItem[] = [];

    for (const service of ordersToUpdate) {
      const currentFee = Number(service.technicianFee || 0);
      const currentPaid = Number(service.technicianPaidAmount || 0);
      const currentDue = Math.max(0, currentFee - currentPaid);

      const payingForThis = remainingToDistribute > 0 ? Math.min(remainingToDistribute, currentDue > 0 ? currentDue : currentFee) : 0;
      const newPaid = currentPaid + payingForThis;
      const newRemaining = Math.max(0, currentFee - newPaid);
      const newStatus: 'pendente' | 'parcial' | 'pago' = newRemaining <= 0.009 ? 'pago' : (newPaid > 0 ? 'parcial' : 'pendente');

      paymentItems.push({
        serviceId: service.id,
        orderNumber: service.orderNumber,
        executionDate: service.executionDate || service.createdAt,
        clientName: service.clientName,
        vehiclePlate: service.vehiclePlate,
        vehicleModel: service.vehicleModel,
        serviceCategory: service.items?.map((i) => i.category).join(', ') || 'Serviço Técnico',
        technicianFee: currentFee,
        paidInThisPayment: payingForThis,
        remainingAfterThisPayment: newRemaining,
        statusAfterThisPayment: newRemaining <= 0.009 ? 'pago' : 'parcial',
      });

      remainingToDistribute -= payingForThis;
    }

    const paymentDoc: TechnicianPayment = {
      id,
      technicianId: params.technicianId,
      technicianName: params.technicianName,
      technicianCpf: techObj?.cpf || '',
      technicianPhone: techObj?.whatsapp || techObj?.phone || '',
      serviceIds: params.serviceIds,
      serviceOrderNumbers,
      items: paymentItems,
      amount: Number(params.amount),
      paymentDate: params.paymentDate,
      paymentMethod: params.paymentMethod,
      receiptNumber: recNum,
      status: 'confirmado',
      notes: params.notes || '',
      createdAt: now,
      createdBy: user?.uid || '',
    };

    try {
      // 1. Gravar comprovante do pagamento ao técnico
      await setDoc(doc(db, 'technician_payments', id), cleanFirestoreData(paymentDoc));

      // 2. Atualizar as O.S. selecionadas vinculando este pagamento
      for (const item of paymentItems) {
        const service = ordersToUpdate.find((s) => s.id === item.serviceId);
        if (!service) continue;

        const currentPaid = Number(service.technicianPaidAmount || 0);
        await updateDoc(doc(db, 'technical_services', item.serviceId), cleanFirestoreData({
          technicianPaidAmount: currentPaid + item.paidInThisPayment,
          technicianRemainingBalance: item.remainingAfterThisPayment,
          technicianPaymentStatus: item.statusAfterThisPayment,
          technicianPaymentId: id,
          technicianPaymentReceiptNumber: recNum,
          technicianPaymentDate: params.paymentDate,
          updatedAt: now,
        }));
      }

      await logAudit(
        'CREATE',
        'TechnicianPayment',
        id,
        `Registrou quitação/pagamento ${recNum} de R$ ${Number(params.amount).toFixed(2)} ao técnico ${params.technicianName} referente a [${serviceOrderNumbers.join(', ')}]`
      );

      setTechnicianPayments((prev) => [paymentDoc, ...prev.filter((p) => p.id !== id)]);

      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `technician_payments/${id}`);
      throw error;
    }
  };

  // Cancel Technician Payment (Estorno auditado preservando histórico)
  const cancelTechnicianPayment = async (paymentId: string, reason?: string) => {
    const payment = technicianPayments.find((p) => p.id === paymentId);
    if (!payment) {
      throw new Error('Comprovante de pagamento ao técnico não encontrado.');
    }
    if (payment.status === 'cancelado') {
      throw new Error('Este pagamento já foi cancelado anteriormente.');
    }

    const now = new Date().toISOString();

    try {
      // 1. Reverter saldos e status nas Ordens de Serviço vinculadas
      if (payment.items && payment.items.length > 0) {
        for (const item of payment.items) {
          const service = technicalServices.find((s) => s.id === item.serviceId);
          if (!service) continue;

          const currentPaid = Number(service.technicianPaidAmount || 0);
          const restoredPaid = Math.max(0, currentPaid - Number(item.paidInThisPayment || 0));
          const fee = Number(service.technicianFee || 0);
          const restoredRemaining = Math.max(0, fee - restoredPaid);
          const restoredStatus: 'pendente' | 'parcial' | 'pago' =
            restoredRemaining <= 0.009 ? 'pago' : (restoredPaid > 0 ? 'parcial' : 'pendente');

          await updateDoc(doc(db, 'technical_services', item.serviceId), cleanFirestoreData({
            technicianPaidAmount: restoredPaid,
            technicianRemainingBalance: restoredRemaining,
            technicianPaymentStatus: restoredStatus,
            technicianPaymentId: restoredPaid === 0 ? null : (service.technicianPaymentId === paymentId ? null : service.technicianPaymentId),
            technicianPaymentReceiptNumber: restoredPaid === 0 ? null : (service.technicianPaymentReceiptNumber === payment.receiptNumber ? null : service.technicianPaymentReceiptNumber),
            updatedAt: now,
          }));
        }
      } else {
        // Fallback para pagamentos antigos
        for (const serviceId of payment.serviceIds) {
          const service = technicalServices.find((s) => s.id === serviceId);
          if (!service) continue;
          const fee = Number(service.technicianFee || 0);
          await updateDoc(doc(db, 'technical_services', serviceId), cleanFirestoreData({
            technicianPaidAmount: 0,
            technicianRemainingBalance: fee,
            technicianPaymentStatus: 'pendente',
            technicianPaymentId: null,
            technicianPaymentReceiptNumber: null,
            updatedAt: now,
          }));
        }
      }

      // 2. Marcar comprovante como cancelado no Firestore
      await updateDoc(doc(db, 'technician_payments', paymentId), cleanFirestoreData({
        status: 'cancelado',
        cancelledAt: now,
        cancelledBy: user?.uid || '',
        cancellationReason: reason?.trim() || 'Cancelamento solicitado pelo operador',
        updatedAt: now,
      }));

      // 3. Registrar auditoria forense do cancelamento
      await logAudit(
        'CANCEL',
        'TechnicianPayment',
        paymentId,
        `Cancelou pagamento ao técnico ${payment.technicianName} (Recibo: ${payment.receiptNumber || paymentId}, Valor: R$ ${payment.amount.toFixed(2)}). Motivo: ${reason?.trim() || 'Não informado'}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `technician_payments/${paymentId}`);
      throw error;
    }
  };

  // COMPANY EXPENSES ACTIONS
  const addCompanyExpense = async (data: Omit<CompanyExpense, 'id' | 'expenseNumber' | 'voucherNumber' | 'createdAt' | 'updatedAt'>) => {
    const id = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const expNum = `DESP-${now.slice(0, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const vouchNum = `COMP-${now.slice(0, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const subtotal = data.items.reduce((acc, item) => acc + Number(item.subtotal || item.quantity * item.unitPrice || 0), 0);
    const discount = Number(data.discount || 0);
    const totalAmount = Math.max(0, subtotal - discount);
    const paidAmount = Number(data.paidAmount || 0);
    const remainingBalance = Math.max(0, totalAmount - paidAmount);

    let status: 'pago' | 'pendente' | 'parcial' = 'pendente';
    if (paidAmount >= totalAmount && totalAmount > 0) {
      status = 'pago';
    } else if (paidAmount > 0) {
      status = 'parcial';
    }

    const newExpense: CompanyExpense = {
      ...data,
      id,
      expenseNumber: expNum,
      voucherNumber: vouchNum,
      subtotal,
      discount,
      totalAmount,
      paidAmount,
      remainingBalance,
      status,
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };

    try {
      await setDoc(doc(db, 'company_expenses', id), cleanFirestoreData(newExpense));
      await logAudit('CREATE', 'CompanyExpense', id, `Registrou despesa ${expNum} (${data.supplier}) no valor de R$ ${totalAmount.toFixed(2)}`);
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `company_expenses/${id}`);
    }
  };

  const updateCompanyExpense = async (id: string, data: Partial<CompanyExpense>) => {
    try {
      const now = new Date().toISOString();
      const existing = companyExpenses.find((e) => e.id === id);
      const items = data.items || existing?.items || [];
      const subtotal = items.reduce((acc, item) => acc + Number(item.subtotal || item.quantity * item.unitPrice || 0), 0);
      const discount = data.discount !== undefined ? Number(data.discount) : (existing?.discount || 0);
      const totalAmount = Math.max(0, subtotal - discount);
      const paidAmount = data.paidAmount !== undefined ? Number(data.paidAmount) : (existing?.paidAmount || 0);
      const remainingBalance = Math.max(0, totalAmount - paidAmount);

      let status: 'pago' | 'pendente' | 'parcial' = 'pendente';
      if (paidAmount >= totalAmount && totalAmount > 0) {
        status = 'pago';
      } else if (paidAmount > 0) {
        status = 'parcial';
      }

      const payload = {
        ...data,
        subtotal,
        discount,
        totalAmount,
        paidAmount,
        remainingBalance,
        status,
        updatedAt: now,
      };

      await updateDoc(doc(db, 'company_expenses', id), cleanFirestoreData(payload));
      await logAudit('UPDATE', 'CompanyExpense', id, `Atualizou despesa ${existing?.expenseNumber || id} (${status})`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `company_expenses/${id}`);
    }
  };

  const deleteCompanyExpense = async (id: string) => {
    try {
      const existing = companyExpenses.find((e) => e.id === id);
      await deleteDoc(doc(db, 'company_expenses', id));
      await logAudit('DELETE', 'CompanyExpense', id, `Excluiu despesa ${existing?.expenseNumber || id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `company_expenses/${id}`);
    }
  };

  // ==========================================
  // FIXED EXPENSES ACTIONS (DESPESAS FIXAS)
  // ==========================================
  const addFixedExpense = async (data: Omit<FixedExpense, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = `fix_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newFixedExpense: FixedExpense = {
      ...data,
      id,
      name: data.name?.trim() || 'Despesa Fixa',
      supplier: data.supplier?.trim() || '',
      category: data.category?.trim() || 'Outros gastos recorrentes',
      valueType: data.valueType || 'fixo',
      amount: data.valueType === 'fixo' ? Number(data.amount || 0) : 0,
      status: data.status || 'ativa',
      dueDay: Math.min(31, Math.max(1, Number(data.dueDay) || 10)),
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };
    try {
      await setDoc(doc(db, 'fixed_expenses', id), cleanFirestoreData(newFixedExpense));
      await logAudit(
        'CREATE',
        'FixedExpense',
        id,
        `Cadastrou despesa fixa "${newFixedExpense.name}" (${newFixedExpense.category}) - ${newFixedExpense.valueType === 'fixo' ? `R$ ${newFixedExpense.amount?.toFixed(2)}` : 'Valor Variável'}`
      );
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `fixed_expenses/${id}`);
      throw error;
    }
  };

  const updateFixedExpense = async (id: string, data: Partial<FixedExpense>) => {
    try {
      const now = new Date().toISOString();
      const existing = fixedExpenses.find((f) => f.id === id);
      const payload: Partial<FixedExpense> = {
        ...data,
        updatedAt: now,
      };
      if (data.valueType === 'fixo' && data.amount !== undefined) {
        payload.amount = Number(data.amount);
      } else if (data.valueType === 'variavel') {
        payload.amount = 0;
      }
      if (data.dueDay !== undefined) {
        payload.dueDay = Math.min(31, Math.max(1, Number(data.dueDay)));
      }
      await updateDoc(doc(db, 'fixed_expenses', id), cleanFirestoreData(payload));
      await logAudit('UPDATE', 'FixedExpense', id, `Atualizou cadastro da despesa fixa "${existing?.name || id}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `fixed_expenses/${id}`);
      throw error;
    }
  };

  const pauseFixedExpense = async (id: string) => {
    try {
      const existing = fixedExpenses.find((f) => f.id === id);
      await updateDoc(doc(db, 'fixed_expenses', id), {
        status: 'pausada',
        updatedAt: new Date().toISOString(),
      });
      await logAudit('PAUSE', 'FixedExpense', id, `Pausou recorrência da despesa fixa "${existing?.name || id}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `fixed_expenses/${id}`);
      throw error;
    }
  };

  const resumeFixedExpense = async (id: string) => {
    try {
      const existing = fixedExpenses.find((f) => f.id === id);
      await updateDoc(doc(db, 'fixed_expenses', id), {
        status: 'ativa',
        updatedAt: new Date().toISOString(),
      });
      await logAudit('RESUME', 'FixedExpense', id, `Reativou recorrência da despesa fixa "${existing?.name || id}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `fixed_expenses/${id}`);
      throw error;
    }
  };

  const closeFixedExpense = async (id: string) => {
    try {
      const existing = fixedExpenses.find((f) => f.id === id);
      await updateDoc(doc(db, 'fixed_expenses', id), {
        status: 'encerrada',
        updatedAt: new Date().toISOString(),
      });
      await logAudit('CLOSE', 'FixedExpense', id, `Encerrou recorrência da despesa fixa "${existing?.name || id}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `fixed_expenses/${id}`);
      throw error;
    }
  };

  const deleteFixedExpense = async (id: string) => {
    try {
      const existing = fixedExpenses.find((f) => f.id === id);
      const linkedCount = companyExpenses.filter((e) => e.fixedExpenseId === id).length;
      await deleteDoc(doc(db, 'fixed_expenses', id));
      await logAudit(
        'DELETE',
        'FixedExpense',
        id,
        `Excluiu modelo de despesa fixa "${existing?.name || id}". ${linkedCount} ocorrências financeiras históricas preservadas nos Gastos da Empresa.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `fixed_expenses/${id}`);
      throw error;
    }
  };

  const generateFixedExpenseOccurrences = async (
    occurrences: { fixedExpenseId: string; competence: string; amount: number; dueDate: string }[]
  ) => {
    let created = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const occ of occurrences) {
      const fix = fixedExpenses.find((f) => f.id === occ.fixedExpenseId);
      if (!fix) {
        skipped++;
        continue;
      }

      // Prevenir duplicidade estrita por fixedExpenseId + competência
      const alreadyExists = companyExpenses.some(
        (e) => (e.fixedExpenseId === occ.fixedExpenseId || e.id.includes(occ.fixedExpenseId)) && e.competence === occ.competence
      );

      if (alreadyExists) {
        skipped++;
        continue;
      }

      const id = `exp_fix_${occ.fixedExpenseId}_${occ.competence.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const expNum = `DESP-${occ.competence.replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const vouchNum = `COMP-${occ.competence.replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const confirmedAmount = Math.max(0, Number(occ.amount) || 0);

      const newExpense: CompanyExpense = {
        id,
        expenseNumber: expNum,
        voucherNumber: vouchNum,
        date: occ.dueDate || getTodayIsoDate(),
        dueDate: occ.dueDate || getTodayIsoDate(),
        supplier: fix.supplier || 'Beneficiário',
        operationDescription: `Despesa Fixa (${getCompetenceLabel(occ.competence)}): ${fix.name}`,
        items: [
          {
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            category: fix.category || 'Outros gastos recorrentes',
            description: `${fix.name} - Competência ${getCompetenceLabel(occ.competence)}`,
            quantity: 1,
            unitPrice: confirmedAmount,
            subtotal: confirmedAmount,
          },
        ],
        subtotal: confirmedAmount,
        discount: 0,
        totalAmount: confirmedAmount,
        paidAmount: 0,
        remainingBalance: confirmedAmount,
        paymentMethod: 'pix',
        status: 'pendente',
        notes: fix.notes ? `[Despesa Fixa: ${fix.name}] ${fix.notes}` : `Lançamento gerado a partir da Despesa Fixa: ${fix.name}`,
        fixedExpenseId: fix.id,
        competence: occ.competence,
        isFixedExpense: true,
        createdAt: now,
        updatedAt: now,
        createdBy: user?.uid || '',
      };

      try {
        await setDoc(doc(db, 'company_expenses', id), cleanFirestoreData(newExpense));
        await logAudit(
          'GENERATE',
          'FixedExpense',
          fix.id,
          `Gerou ocorrência financeira ${expNum} para "${fix.name}" na competência ${occ.competence} (Valor: R$ ${confirmedAmount.toFixed(2)})`
        );
        created++;
      } catch (err) {
        console.error('Erro ao gerar ocorrência de despesa fixa:', err);
        skipped++;
      }
    }

    return { created, skipped };
  };

  // TECHNICIAN ACTIONS
  const addTechnician = async (data: Omit<Technician, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = `tech_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newTechnician: Technician = {
      ...data,
      id,
      name: data.name?.trim() || 'Técnico',
      status: data.status || 'ativo',
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };
    try {
      await setDoc(doc(db, 'technicians', id), cleanFirestoreData(newTechnician));
      await logAudit('CREATE', 'Technician', id, `Cadastrou o técnico ${newTechnician.name}`);
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `technicians/${id}`);
      throw error;
    }
  };

  const updateTechnician = async (id: string, data: Partial<Technician>) => {
    try {
      const now = new Date().toISOString();
      const payload: Record<string, any> = {
        ...data,
        updatedAt: now,
      };
      if (data.name) payload.name = data.name.trim();

      await updateDoc(doc(db, 'technicians', id), cleanFirestoreData(payload));
      await logAudit('UPDATE', 'Technician', id, `Atualizou dados do técnico ${data.name || id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `technicians/${id}`);
      throw error;
    }
  };

  const deleteTechnician = async (id: string) => {
    const tech = technicians.find((t) => t.id === id);
    const techName = tech?.name || id;

    // Check if technician is linked to existing technical services
    const linkedServices = technicalServices.filter(
      (s) => s.technicianId === id || (tech?.name && s.technicianName?.trim().toLowerCase() === tech.name.trim().toLowerCase())
    );

    if (linkedServices.length > 0) {
      throw new Error(
        `Não é possível excluir o técnico "${techName}". Existem ${linkedServices.length} ordem(ns) de serviço vinculada(s) a este técnico. Para manter o histórico íntegro, você pode desativar o cadastro do técnico.`
      );
    }

    try {
      await deleteDoc(doc(db, 'technicians', id));
      await logAudit('DELETE', 'Technician', id, `Excluiu o técnico "${techName}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `technicians/${id}`);
      throw error;
    }
  };

  const toggleTechnicianStatus = async (id: string) => {
    const tech = technicians.find((t) => t.id === id);
    if (!tech) return;
    const newStatus = tech.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'technicians', id), cleanFirestoreData({
        status: newStatus,
        updatedAt: now,
      }));
      await logAudit('UPDATE', 'Technician', id, `Alterou status do técnico "${tech.name}" para "${newStatus}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `technicians/${id}`);
      throw error;
    }
  };

  // TECHNICAL SERVICE TYPES ACTIONS
  const addTechnicalServiceType = async (data: Omit<TechnicalServiceType, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = `stype_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newType: TechnicalServiceType = {
      ...data,
      id,
      name: data.name.trim(),
      status: data.status || 'ativo',
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };
    try {
      await setDoc(doc(db, 'technical_service_types', id), cleanFirestoreData(newType));
      await logAudit('CREATE', 'TechnicalServiceType', id, `Cadastrou o tipo de serviço técnico "${newType.name}"`);
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `technical_service_types/${id}`);
      throw error;
    }
  };

  const updateTechnicalServiceType = async (id: string, data: Partial<TechnicalServiceType>) => {
    try {
      const now = new Date().toISOString();
      const payload: Record<string, any> = {
        ...data,
        updatedAt: now,
      };
      if (data.name) payload.name = data.name.trim();

      await updateDoc(doc(db, 'technical_service_types', id), cleanFirestoreData(payload));
      await logAudit('UPDATE', 'TechnicalServiceType', id, `Atualizou o tipo de serviço técnico "${data.name || id}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `technical_service_types/${id}`);
      throw error;
    }
  };

  const deleteTechnicalServiceType = async (id: string) => {
    const sType = technicalServiceTypes.find((t) => t.id === id);
    const typeName = sType?.name || id;

    // Check if any technical service item references this type
    const linkedServices = technicalServices.filter((s) =>
      s.items?.some((item) => item.category?.trim().toLowerCase() === typeName.trim().toLowerCase())
    );

    if (linkedServices.length > 0) {
      throw new Error(
        `Não é possível excluir o tipo de serviço "${typeName}". Existem ${linkedServices.length} ordem(ns) de serviço com itens deste tipo. Para manter o histórico seguro, desative este serviço.`
      );
    }

    try {
      await deleteDoc(doc(db, 'technical_service_types', id));
      await logAudit('DELETE', 'TechnicalServiceType', id, `Excluiu o tipo de serviço "${typeName}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `technical_service_types/${id}`);
      throw error;
    }
  };

  const toggleTechnicalServiceTypeStatus = async (id: string) => {
    const sType = technicalServiceTypes.find((t) => t.id === id);
    if (!sType) return;
    const newStatus = sType.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'technical_service_types', id), cleanFirestoreData({
        status: newStatus,
        updatedAt: now,
      }));
      await logAudit('UPDATE', 'TechnicalServiceType', id, `Alterou status do tipo de serviço "${sType.name}" para "${newStatus}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `technical_service_types/${id}`);
      throw error;
    }
  };

  // EXPENSE CATEGORIES ACTIONS
  const addExpenseCategory = async (data: Omit<ExpenseCategoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = `expcat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newCat: ExpenseCategoryItem = {
      ...data,
      id,
      name: data.name.trim(),
      status: data.status || 'ativo',
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };
    try {
      await setDoc(doc(db, 'expense_categories', id), cleanFirestoreData(newCat));
      await logAudit('CREATE', 'ExpenseCategory', id, `Cadastrou o item/categoria de despesa "${newCat.name}"`);
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `expense_categories/${id}`);
      throw error;
    }
  };

  const updateExpenseCategory = async (id: string, data: Partial<ExpenseCategoryItem>) => {
    try {
      const now = new Date().toISOString();
      const payload: Record<string, any> = {
        ...data,
        updatedAt: now,
      };
      if (data.name) payload.name = data.name.trim();

      await updateDoc(doc(db, 'expense_categories', id), cleanFirestoreData(payload));
      await logAudit('UPDATE', 'ExpenseCategory', id, `Atualizou a categoria/item de despesa "${data.name || id}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `expense_categories/${id}`);
      throw error;
    }
  };

  const deleteExpenseCategory = async (id: string) => {
    const cat = customExpenseCategories.find((c) => c.id === id);
    const catName = cat?.name || id;

    // Check if any company expense item references this category
    const linkedExpenses = companyExpenses.filter((e) =>
      e.items?.some((item) => item.category?.trim().toLowerCase() === catName.trim().toLowerCase())
    );

    if (linkedExpenses.length > 0) {
      throw new Error(
        `Não é possível excluir o item "${catName}". Existem ${linkedExpenses.length} lançamento(s) de despesa utilizando este item. Para manter o histórico seguro, desative este item.`
      );
    }

    try {
      await deleteDoc(doc(db, 'expense_categories', id));
      await logAudit('DELETE', 'ExpenseCategory', id, `Excluiu o item/categoria de despesa "${catName}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expense_categories/${id}`);
      throw error;
    }
  };

  const toggleExpenseCategoryStatus = async (id: string) => {
    const cat = customExpenseCategories.find((c) => c.id === id);
    if (!cat) return;
    const newStatus = cat.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'expense_categories', id), cleanFirestoreData({
        status: newStatus,
        updatedAt: now,
      }));
      await logAudit('UPDATE', 'ExpenseCategory', id, `Alterou status do item de despesa "${cat.name}" para "${newStatus}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `expense_categories/${id}`);
      throw error;
    }
  };

  // SEED DEMO DATA
  const seedDemoData = async () => {
    const currentMonth = getCurrentMonthStr();
    const today = getTodayIsoDate();

    // 0. Seed default commercial plans
    await seedDefaultPlans();

    // Client 1: João da Silva (Possui Plano Moto + Carro)
    const c1Id = await addClient({
      name: 'João da Silva',
      document: '284.912.438-51',
      phone: '(11) 97123-4567',
      whatsapp: '11971234567',
      email: 'joao.silva@email.com',
      address: 'Rua das Flores, 142 - São Paulo - SP',
      notes: 'Cliente antigo. Possui frota familiar com Plano Moto + Carro.',
      status: 'ativo',
      planId: 'plan_default_4_plano_moto___carro',
      planName: 'Plano Moto + Carro',
    });

    // Client 2: Transportadora Rápido Seguro Ltda
    const c2Id = await addClient({
      name: 'Transportadora Rápido Seguro Ltda',
      document: '14.281.932/0001-40',
      phone: '(11) 3456-7890',
      whatsapp: '11988887777',
      email: 'contato@rapdoseguro.com.br',
      address: 'Rodovia Anhanguera, km 18 - Jundiaí - SP',
      notes: 'Frota pesada de caminhões. Pagamento via PIX corporativo.',
      status: 'ativo',
    });

    // Client 3: Mariana Costa (Plano Moto Individual)
    const c3Id = await addClient({
      name: 'Mariana Costa',
      document: '391.827.104-92',
      phone: '(11) 99112-3344',
      whatsapp: '11991123344',
      email: 'mariana.costa@gmail.com',
      address: 'Av. Brigadeiro Faria Lima, 2500 - SP',
      notes: 'Contrato residencial moto com Plano Moto Individual.',
      status: 'ativo',
      planId: 'plan_default_1_plano_moto_individual',
      planName: 'Plano Moto Individual',
    });

    // Vehicles for João da Silva
    const v1Id = await addVehicle({
      clientId: c1Id,
      vehicleType: 'carro',
      brand: 'Chevrolet',
      model: 'Onix Plus 1.0 Turbo',
      plate: 'ABC1234',
      color: 'Prata',
      planDescription: 'Plano Carro Individual',
      planId: 'plan_default_3_plano_carro_individual',
      planName: 'Plano Carro Individual',
      monthlyValue: 80,
      dueDay: 10,
      contractStartDate: '2025-01-15',
      status: 'ativo',
    });

    const v2Id = await addVehicle({
      clientId: c1Id,
      vehicleType: 'carro',
      brand: 'Fiat',
      model: 'Strada Freedom',
      plate: 'DEF5678',
      color: 'Branca',
      planDescription: 'Plano Moto + Carro (Carro)',
      planId: 'plan_default_4_plano_moto___carro',
      planName: 'Plano Moto + Carro',
      monthlyValue: 60,
      dueDay: 15,
      contractStartDate: '2025-03-10',
      status: 'ativo',
    });

    const v3Id = await addVehicle({
      clientId: c1Id,
      vehicleType: 'moto',
      brand: 'Honda',
      model: 'CG 160 Titan',
      plate: 'GHI9012',
      color: 'Vermelha',
      planDescription: 'Plano Moto + Carro (Moto)',
      planId: 'plan_default_4_plano_moto___carro',
      planName: 'Plano Moto + Carro',
      monthlyValue: 50,
      dueDay: 20,
      contractStartDate: '2025-06-01',
      status: 'ativo',
    });

    // Vehicles for Transportadora
    const v4Id = await addVehicle({
      clientId: c2Id,
      vehicleType: 'caminhao',
      brand: 'Volvo',
      model: 'FH 540 6x4',
      plate: 'ROD4A50',
      color: 'Azul Escuro',
      planDescription: 'Rastreamento Cargas Pesadas Telemetria',
      monthlyValue: 250,
      dueDay: 5,
      contractStartDate: '2024-11-01',
      status: 'ativo',
    });

    const v5Id = await addVehicle({
      clientId: c2Id,
      vehicleType: 'caminhao',
      brand: 'Scania',
      model: 'R 450 Highline',
      plate: 'TRK7B88',
      color: 'Prata',
      planDescription: 'Rastreamento Cargas Pesadas Telemetria',
      monthlyValue: 250,
      dueDay: 5,
      contractStartDate: '2024-11-01',
      status: 'ativo',
    });

    // Vehicle for Mariana
    const v6Id = await addVehicle({
      clientId: c3Id,
      vehicleType: 'moto',
      brand: 'Yamaha',
      model: 'Fazer FZ25',
      plate: 'MOT2C34',
      color: 'Preta',
      planDescription: 'Plano Moto Individual',
      planId: 'plan_default_1_plano_moto_individual',
      planName: 'Plano Moto Individual',
      monthlyValue: 60,
      dueDay: 25,
      contractStartDate: '2025-08-20',
      status: 'ativo',
    });

    // Charges and Payments examples:
    // Charge 1: João Onix ABC1234 - Partial Payment example (R$ 100 total, paid R$ 30, remaining R$ 70)
    const chg1Id = await addCharge({
      clientId: c1Id,
      clientName: 'João da Silva',
      vehicleId: v1Id,
      vehiclePlate: 'ABC1234',
      vehicleModel: 'Chevrolet Onix Plus 1.0 Turbo',
      referenceMonth: currentMonth,
      originalMonthlyValue: 100,
      previousBalanceCarried: 0,
      discount: 0,
      addition: 0,
      totalAmount: 100,
      paidAmount: 30,
      remainingBalance: 70,
      dueDate: `${currentMonth}-10`,
      status: 'parcial',
      balanceHandling: 'specific_date',
      balanceScheduledDate: `${currentMonth}-20`,
      notes: 'Cliente pagou R$ 30 adiantado em dinheiro e combinou pagar os R$ 70 restantes no dia 20.',
    });

    // Create payment record for the R$ 30
    await setDoc(doc(db, 'payments', `pay_init_1`), {
      id: `pay_init_1`,
      chargeId: chg1Id,
      clientId: c1Id,
      clientName: 'João da Silva',
      vehicleId: v1Id,
      vehiclePlate: 'ABC1234',
      amount: 30,
      paymentDate: new Date().toISOString(),
      paymentMethod: 'dinheiro',
      operatorId: user?.uid || 'admin',
      operatorName: profile?.displayName || 'Operador',
      receiptNumber: `REC-${new Date().getFullYear()}11-1001`,
      remainingAfterPayment: 70,
      notes: 'Entrada parcial em dinheiro',
      createdAt: new Date().toISOString(),
    });

    // Charge 2: João Strada DEF5678 - Fully Paid R$ 60 via PIX
    const chg2Id = await addCharge({
      clientId: c1Id,
      clientName: 'João da Silva',
      vehicleId: v2Id,
      vehiclePlate: 'DEF5678',
      vehicleModel: 'Fiat Strada Freedom',
      referenceMonth: currentMonth,
      originalMonthlyValue: 60,
      previousBalanceCarried: 0,
      discount: 0,
      addition: 0,
      totalAmount: 60,
      paidAmount: 60,
      remainingBalance: 0,
      dueDate: `${currentMonth}-15`,
      status: 'pago',
      balanceHandling: 'none',
    });

    await setDoc(doc(db, 'payments', `pay_init_2`), {
      id: `pay_init_2`,
      chargeId: chg2Id,
      clientId: c1Id,
      clientName: 'João da Silva',
      vehicleId: v2Id,
      vehiclePlate: 'DEF5678',
      amount: 60,
      paymentDate: new Date().toISOString(),
      paymentMethod: 'pix',
      operatorId: user?.uid || 'admin',
      operatorName: profile?.displayName || 'Operador',
      receiptNumber: `REC-${new Date().getFullYear()}11-1002`,
      remainingAfterPayment: 0,
      notes: 'PIX confirmado',
      createdAt: new Date().toISOString(),
    });

    // Charge 3: João Moto GHI9012 - Pending R$ 60
    await addCharge({
      clientId: c1Id,
      clientName: 'João da Silva',
      vehicleId: v3Id,
      vehiclePlate: 'GHI9012',
      vehicleModel: 'Honda CG 160 Titan',
      referenceMonth: currentMonth,
      originalMonthlyValue: 60,
      previousBalanceCarried: 0,
      discount: 0,
      addition: 0,
      totalAmount: 60,
      paidAmount: 0,
      remainingBalance: 60,
      dueDate: `${currentMonth}-20`,
      status: 'pendente',
      balanceHandling: 'none',
    });

    // Charge 4 & 5: Caminhões da Transportadora - Vencimento dia 05 (Atrasado se dia > 05)
    await addCharge({
      clientId: c2Id,
      clientName: 'Transportadora Rápido Seguro Ltda',
      vehicleId: v4Id,
      vehiclePlate: 'ROD4A50',
      vehicleModel: 'Volvo FH 540 6x4',
      referenceMonth: currentMonth,
      originalMonthlyValue: 250,
      previousBalanceCarried: 0,
      discount: 0,
      addition: 0,
      totalAmount: 250,
      paidAmount: 250,
      remainingBalance: 0,
      dueDate: `${currentMonth}-05`,
      status: 'pago',
      balanceHandling: 'none',
    });

    await setDoc(doc(db, 'payments', `pay_init_3`), {
      id: `pay_init_3`,
      chargeId: 'temp_4',
      clientId: c2Id,
      clientName: 'Transportadora Rápido Seguro Ltda',
      vehicleId: v4Id,
      vehiclePlate: 'ROD4A50',
      amount: 250,
      paymentDate: new Date().toISOString(),
      paymentMethod: 'pix',
      operatorId: user?.uid || 'admin',
      operatorName: profile?.displayName || 'Operador',
      receiptNumber: `REC-${new Date().getFullYear()}11-1003`,
      remainingAfterPayment: 0,
      notes: 'Transferência PIX',
      createdAt: new Date().toISOString(),
    });

    await addCharge({
      clientId: c2Id,
      clientName: 'Transportadora Rápido Seguro Ltda',
      vehicleId: v5Id,
      vehiclePlate: 'TRK7B88',
      vehicleModel: 'Scania R 450 Highline',
      referenceMonth: currentMonth,
      originalMonthlyValue: 250,
      previousBalanceCarried: 0,
      discount: 0,
      addition: 0,
      totalAmount: 250,
      paidAmount: 0,
      remainingBalance: 250,
      dueDate: `${currentMonth}-05`,
      status: 'pendente',
      balanceHandling: 'none',
    });

    // Charge 6: Mariana Moto - Pending
    await addCharge({
      clientId: c3Id,
      clientName: 'Mariana Costa',
      vehicleId: v6Id,
      vehiclePlate: 'MOT2C34',
      vehicleModel: 'Yamaha Fazer FZ25',
      referenceMonth: currentMonth,
      originalMonthlyValue: 70,
      previousBalanceCarried: 0,
      discount: 0,
      addition: 0,
      totalAmount: 70,
      paidAmount: 0,
      remainingBalance: 70,
      dueDate: `${currentMonth}-25`,
      status: 'pendente',
      balanceHandling: 'none',
    });

    // 7. Seed Sample Technical Services
    try {
      await addTechnicalService({
        clientId: c1Id,
        clientName: 'João da Silva',
        clientPhone: '(11) 97123-4567',
        vehicleId: v1Id,
        vehiclePlate: 'ABC1D23',
        vehicleModel: 'Toyota Corolla XEi 2.0',
        vehicleColor: 'Prata',
        executionDate: today,
        items: [
          {
            id: 'item_ts_1',
            category: 'Instalação',
            description: 'Instalação completa de rastreador 4G com chicote blindado',
            value: 180,
          },
          {
            id: 'item_ts_2',
            category: 'Manutenção',
            description: 'Configuração e teste de bloqueio remoto',
            value: 50,
          },
        ],
        subtotal: 230,
        discount: 30,
        totalAmount: 200,
        paidAmount: 200,
        remainingBalance: 0,
        paymentMethod: 'pix',
        paymentDate: today,
        status: 'pago',
        technicianName: 'Carlos Técnico AUTOTEC',
        notes: 'Instalação e testes finalizados com sucesso.',
      });

      await addTechnicalService({
        clientId: c2Id,
        clientName: 'Transportadora Rápido Seguro Ltda',
        clientPhone: '(11) 3456-7890',
        vehicleId: v4Id,
        vehiclePlate: 'ROD4A50',
        vehicleModel: 'Volvo FH 540 6x4',
        vehicleColor: 'Branco',
        executionDate: today,
        items: [
          {
            id: 'item_ts_3',
            category: 'Reinstalação',
            description: 'Reinstalação de sensor e módulo após troca de bateria',
            value: 150,
          },
        ],
        subtotal: 150,
        discount: 0,
        totalAmount: 150,
        paidAmount: 100,
        remainingBalance: 50,
        paymentMethod: 'dinheiro',
        paymentDate: today,
        status: 'parcial',
        technicianName: 'Carlos Técnico AUTOTEC',
        notes: 'Sinal de R$ 100 pago em dinheiro. Restante de R$ 50 para fechamento.',
      });
    } catch (e) {
      console.warn('Erro ao popular servicos técnicos de exemplo:', e);
    }

    // 8. Seed Sample Company Expenses
    try {
      await addCompanyExpense({
        date: today,
        supplier: 'TechChip Telecomunicações Ltda',
        paymentMethod: 'pix',
        items: [
          {
            id: 'exp_item_1',
            category: 'Chips',
            description: 'Recarga lote M2M 50MB multi-operadora',
            quantity: 20,
            unitPrice: 12,
            subtotal: 240,
          },
        ],
        subtotal: 240,
        discount: 20,
        totalAmount: 220,
        paidAmount: 220,
        remainingBalance: 0,
        status: 'pago',
        paymentDate: today,
        notes: 'Pacote mensal de conectividade de chips M2M.',
      });

      await addCompanyExpense({
        date: today,
        supplier: 'AutoPeças & Elétrica Distribuidora',
        paymentMethod: 'dinheiro',
        items: [
          {
            id: 'exp_item_2',
            category: 'Relê',
            description: 'Relês automotivos 12V 40A para corte',
            quantity: 10,
            unitPrice: 18,
            subtotal: 180,
          },
          {
            id: 'exp_item_3',
            category: 'Fita Isolante',
            description: 'Fitas isolantes anti-chama 3M 20m',
            quantity: 5,
            unitPrice: 14,
            subtotal: 70,
          },
          {
            id: 'exp_item_4',
            category: 'Abraçadeira',
            description: 'Pacote de abraçadeiras nylon 200mm',
            quantity: 3,
            unitPrice: 15,
            subtotal: 45,
          },
        ],
        subtotal: 295,
        discount: 15,
        totalAmount: 280,
        paidAmount: 280,
        remainingBalance: 0,
        status: 'pago',
        paymentDate: today,
        notes: 'Material de consumo elétrico para bancada e campo.',
      });
    } catch (e) {
      console.warn('Erro ao popular despesas de exemplo:', e);
    }
  };

  const tracked = <A extends any[], R>(label: string, fn: (...args: A) => Promise<R>) => {
    return (...args: A): Promise<R> => trackOperation(label, () => fn(...args));
  };

  return (
    <DataContext.Provider
      value={{
        clients,
        vehicles,
        charges,
        payments,
        plans,
        companySettings,
        auditLogs,
        loading,
        hasLoadedOnce,
        isRefreshing,
        activeOperationsCount,
        activeOperationLabel,
        syncError,
        retrySync,
        refreshData,
        addPlan: tracked('Salvando plano', addPlan),
        updatePlan: tracked('Atualizando plano', updatePlan),
        deletePlan: tracked('Excluindo plano', deletePlan),
        togglePlanStatus: tracked('Atualizando status do plano', togglePlanStatus),
        seedDefaultPlans: tracked('Carregando planos padrão', seedDefaultPlans),
        assignPlanToClient: tracked('Vinculando plano', assignPlanToClient),
        addClient: tracked('Cadastrando cliente', addClient),
        updateClient: tracked('Atualizando cliente', updateClient),
        deleteClient: tracked('Excluindo cliente', deleteClient),
        addVehicle: tracked('Cadastrando veículo', addVehicle),
        updateVehicle: tracked('Atualizando veículo', updateVehicle),
        deleteVehicle: tracked('Excluindo veículo', deleteVehicle),
        addCharge: tracked('Gerando mensalidade', addCharge),
        updateCharge: tracked('Atualizando mensalidade', updateCharge),
        deleteCharge: tracked('Excluindo mensalidade', deleteCharge),
        postponeCharge: tracked('Adiando mensalidade', postponeCharge),
        generateMonthlyCharges: tracked('Gerando mensalidades do mês', generateMonthlyCharges),
        recordPayment: tracked('Registrando recebimento', recordPayment),
        recordConsolidatedPayment: tracked('Registrando recebimento consolidado', recordConsolidatedPayment),
        technicalServices,
        addTechnicalService: tracked('Registrando serviço técnico', addTechnicalService),
        updateTechnicalService: tracked('Atualizando serviço técnico', updateTechnicalService),
        deleteTechnicalService: tracked('Excluindo serviço técnico', deleteTechnicalService),
        technicians,
        addTechnician: tracked('Cadastrando técnico', addTechnician),
        updateTechnician: tracked('Atualizando técnico', updateTechnician),
        deleteTechnician: tracked('Excluindo técnico', deleteTechnician),
        toggleTechnicianStatus: tracked('Atualizando técnico', toggleTechnicianStatus),
        technicianPayments,
        recordTechnicianPayment: tracked('Registrando pagamento ao técnico', recordTechnicianPayment),
        cancelTechnicianPayment: tracked('Cancelando pagamento ao técnico', cancelTechnicianPayment),
        technicalServiceTypes,
        addTechnicalServiceType: tracked('Salvando tipo de serviço', addTechnicalServiceType),
        updateTechnicalServiceType: tracked('Atualizando tipo de serviço', updateTechnicalServiceType),
        deleteTechnicalServiceType: tracked('Excluindo tipo de serviço', deleteTechnicalServiceType),
        toggleTechnicalServiceTypeStatus: tracked('Atualizando tipo de serviço', toggleTechnicalServiceTypeStatus),
        companyExpenses,
        addCompanyExpense: tracked('Registrando despesa', addCompanyExpense),
        updateCompanyExpense: tracked('Atualizando despesa', updateCompanyExpense),
        deleteCompanyExpense: tracked('Excluindo despesa', deleteCompanyExpense),
        customExpenseCategories,
        addExpenseCategory: tracked('Salvando categoria de despesa', addExpenseCategory),
        updateExpenseCategory: tracked('Atualizando categoria de despesa', updateExpenseCategory),
        deleteExpenseCategory: tracked('Excluindo categoria de despesa', deleteExpenseCategory),
        toggleExpenseCategoryStatus: tracked('Atualizando categoria de despesa', toggleExpenseCategoryStatus),
        fixedExpenses,
        addFixedExpense: tracked('Salvando despesa fixa', addFixedExpense),
        updateFixedExpense: tracked('Atualizando despesa fixa', updateFixedExpense),
        pauseFixedExpense: tracked('Pausando despesa fixa', pauseFixedExpense),
        resumeFixedExpense: tracked('Reativando despesa fixa', resumeFixedExpense),
        closeFixedExpense: tracked('Encerrando despesa fixa', closeFixedExpense),
        deleteFixedExpense: tracked('Excluindo despesa fixa', deleteFixedExpense),
        generateFixedExpenseOccurrences: tracked('Gerando despesas fixas', generateFixedExpenseOccurrences),
        selectedDetailItem,
        setSelectedDetailItem,
        selectedBillingClientId,
        setSelectedBillingClientId,
        permissionNotice,
        updateCompanySettings: tracked('Salvando configurações', updateCompanySettings),
        seedDemoData: tracked('Gerando dados de exemplo', seedDemoData),
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
