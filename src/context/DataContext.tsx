import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from '../lib/firebase';
import {
  Client,
  Vehicle,
  Charge,
  Payment,
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
import { getCurrentMonthStr, getTodayIsoDate, getCompetenceLabel } from '../lib/calculations';

interface DataContextType {
  clients: Client[];
  vehicles: Vehicle[];
  charges: Charge[];
  payments: Payment[];
  plans: Plan[];
  companySettings: CompanySettings;
  auditLogs: AuditLog[];
  loading: boolean;
  
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
  addCharge: (data: Omit<Charge, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateCharge: (id: string, data: Partial<Charge>) => Promise<void>;
  deleteCharge: (id: string) => Promise<void>;
  generateMonthlyCharges: (month: string) => Promise<{ created: number; skipped: number }>;
  
  // Payment actions
  recordPayment: (params: {
    charge: Charge;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    balanceHandling?: BalanceHandling;
    balanceScheduledDate?: string;
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
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState<{ type: 'mensalidade' | 'servico_tecnico' | 'despesa'; id: string } | null>(null);
  const [selectedBillingClientId, setSelectedBillingClientId] = useState<string | null>(null);

  // Helper de erro de snapshot com tolerância a falhas para não travar a UI
  const handleSnapshotError = (error: unknown, operationType: OperationType, path: string) => {
    setLoading(false);
    try {
      handleFirestoreError(error, operationType, path);
    } catch (err) {
      console.warn(`Aviso de permissão/sincronização no Firestore para "${path}":`, err);
      setPermissionNotice('Sincronização em tempo real com o Firestore (autotec-476bb).');
    }
  };

  // Sync Listeners
  useEffect(() => {
    // Only attach if user is signed in
    if (!user) {
      setClients([]);
      setVehicles([]);
      setCharges([]);
      setPayments([]);
      setTechnicalServices([]);
      setCompanyExpenses([]);
      setTechnicians([]);
      setTechnicianPayments([]);
      setTechnicalServiceTypes([]);
      setCustomExpenseCategories([]);
      setFixedExpenses([]);
      setAuditLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Company Settings
    const unsubSettings = onSnapshot(
      doc(db, 'company_settings', 'default'),
      (snap) => {
        if (snap.exists()) {
          setCompanySettings({ ...defaultSettings, ...snap.data(), id: 'default' } as CompanySettings);
        } else {
          // Initialize default company settings if not present
          setDoc(doc(db, 'company_settings', 'default'), defaultSettings).catch((err) => {
            console.warn('Notice saving default company settings:', err);
          });
        }
      },
      (error) => {
        handleSnapshotError(error, OperationType.GET, 'company_settings/default');
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
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'clients');
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
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'vehicles');
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
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'charges');
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
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'payments');
      }
    );

    // 6. Plans
    const unsubPlans = onSnapshot(
      collection(db, 'plans'),
      (snap) => {
        const list: Plan[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Plan);
        });
        setPlans(list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        
        // Auto-seed initial 4 default plans if database has no plans yet
        if (snap.empty && user) {
          const now = new Date().toISOString();
          INITIAL_DEFAULT_PLANS.forEach(async (p, idx) => {
            const planId = `plan_default_${idx + 1}_${p.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
            const docData: Plan = {
              ...p,
              id: planId,
              createdAt: now,
              updatedAt: now,
              createdBy: user.uid,
            };
            try {
              await setDoc(doc(db, 'plans', planId), cleanFirestoreData(docData));
            } catch (e) {
              console.warn('Auto-seed plan note:', e);
            }
          });
        }
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'plans');
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
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'technical_services');
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
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'company_expenses');
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
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'technicians');
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
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'technical_service_types');
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
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'expense_categories');
      }
    );

    // 11.1 Fixed Expenses (Despesas Fixas e Custos Recorrentes)
    const unsubFixedExpenses = onSnapshot(
      collection(db, 'fixed_expenses'),
      (snap) => {
        const list: FixedExpense[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as FixedExpense);
        });
        setFixedExpenses(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'fixed_expenses');
      }
    );

    // 12. Technician Payments
    const unsubTechPayments = onSnapshot(
      collection(db, 'technician_payments'),
      (snap) => {
        const list: TechnicianPayment[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as TechnicianPayment);
        });
        setTechnicianPayments(list.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')));
      },
      (error) => {
        handleSnapshotError(error, OperationType.LIST, 'technician_payments');
      }
    );

    // 13. Audit Logs
    const auditQuery = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubAudit = onSnapshot(
      auditQuery,
      (snap) => {
        const list: AuditLog[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
        });
        setAuditLogs(list);
        setLoading(false);
      },
      (error) => {
        console.warn('Audit logs snapshot info:', error);
        setLoading(false);
      }
    );

    // Initial timeout safeguard so UI never hangs indefinitely in loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    return () => {
      clearTimeout(timer);
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
  }, [user?.uid]);

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
  const addCharge = async (data: Omit<Charge, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = `chg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newCharge: Charge = {
      ...data,
      id,
      originalMonthlyValue: Number(data.originalMonthlyValue),
      previousBalanceCarried: Number(data.previousBalanceCarried || 0),
      discount: Number(data.discount || 0),
      addition: Number(data.addition || 0),
      totalAmount: Number(data.totalAmount),
      paidAmount: Number(data.paidAmount || 0),
      remainingBalance: Number(data.remainingBalance),
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid || '',
    };
    try {
      await setDoc(doc(db, 'charges', id), cleanFirestoreData(newCharge));
      await logAudit('CREATE', 'Charge', id, `Gerou cobrança ${newCharge.referenceMonth} do veículo ${newCharge.vehiclePlate}`);
      return id;
    } catch (error) {
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

      // Safeguard: Check if there are any linked payments or paid amount > 0
      const linkedPayments = payments.filter((p) => p.chargeId === id);
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

  // Generate Monthly Charges for Active Vehicles
  const generateMonthlyCharges = async (month: string) => {
    let created = 0;
    let skipped = 0;

    const activeVehicles = vehicles.filter((v) => v.status === 'ativo');

    for (const vehicle of activeVehicles) {
      // Check if charge already exists for this vehicle and month
      const exists = charges.some(
        (c) => c.vehicleId === vehicle.id && c.referenceMonth === month && c.status !== 'cancelado'
      );

      if (exists) {
        skipped++;
        continue;
      }

      const client = clients.find((c) => c.id === vehicle.clientId);
      const clientName = client?.name || 'Cliente';

      // Check if previous charge had balance carried over
      const prevCharges = charges.filter(
        (c) => c.vehicleId === vehicle.id && c.remainingBalance > 0 && c.balanceHandling === 'next_month'
      );
      const carriedBalance = prevCharges.reduce((sum, item) => sum + item.remainingBalance, 0);

      // Formulate dueDate for month (YYYY-MM-DD)
      const dueDayFormatted = String(Math.min(Math.max(vehicle.dueDay || 10, 1), 28)).padStart(2, '0');
      const dueDate = `${month}-${dueDayFormatted}`;

      const totalAmount = Number(vehicle.monthlyValue) + carriedBalance;

      await addCharge({
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
      });

      created++;
    }

    return { created, skipped };
  };

  // RECORD PAYMENT (With Strict Partial Handling)
  const recordPayment = async ({
    charge,
    amount,
    paymentMethod,
    notes,
    balanceHandling = 'none',
    balanceScheduledDate,
  }: {
    charge: Charge;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    balanceHandling?: BalanceHandling;
    balanceScheduledDate?: string;
  }): Promise<Payment> => {
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const receiptNumber = `REC-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const currentPaid = Number(charge.paidAmount) || 0;
    const paymentValue = Number(amount);
    const newPaidAmount = currentPaid + paymentValue;
    const newRemainingBalance = Math.max(0, Number(charge.totalAmount) - newPaidAmount);

    const isFullyPaid = newRemainingBalance <= 0.009;
    const newStatus = isFullyPaid ? 'pago' : 'parcial';

    const paymentData: Payment = {
      id: paymentId,
      chargeId: charge.id,
      clientId: charge.clientId,
      clientName: charge.clientName,
      vehicleId: charge.vehicleId,
      vehiclePlate: charge.vehiclePlate,
      amount: paymentValue,
      paymentDate: now,
      paymentMethod,
      operatorId: user?.uid || 'system',
      operatorName: profile?.displayName || user?.displayName || 'Operador',
      receiptNumber,
      remainingAfterPayment: newRemainingBalance,
      notes,
      companySnapshot: { ...companySettings },
      createdAt: now,
    };

    try {
      // 1. Record immutable payment
      await setDoc(doc(db, 'payments', paymentId), cleanFirestoreData(paymentData));

      // 2. Update charge with new status & remaining balance
      await updateDoc(doc(db, 'charges', charge.id), cleanFirestoreData({
        paidAmount: newPaidAmount,
        remainingBalance: newRemainingBalance,
        status: newStatus,
        balanceHandling: isFullyPaid ? 'none' : balanceHandling,
        balanceScheduledDate: balanceScheduledDate || null,
        updatedAt: now,
      }));

      // 3. Log audit trail
      const auditDetails = isFullyPaid
        ? `Recebimento integral de R$ ${paymentValue.toFixed(2)} para ${charge.vehiclePlate} (${receiptNumber})`
        : `Recebimento parcial de R$ ${paymentValue.toFixed(2)} para ${charge.vehiclePlate}. Saldo restante: R$ ${newRemainingBalance.toFixed(2)} (${receiptNumber})`;

      await logAudit('PAYMENT', 'Payment', paymentId, auditDetails);

      return paymentData;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `payments/${paymentId}`);
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
        addPlan,
        updatePlan,
        deletePlan,
        togglePlanStatus,
        seedDefaultPlans,
        assignPlanToClient,
        addClient,
        updateClient,
        deleteClient,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        addCharge,
        updateCharge,
        deleteCharge,
        generateMonthlyCharges,
        recordPayment,
        technicalServices,
        addTechnicalService,
        updateTechnicalService,
        deleteTechnicalService,
        technicians,
        addTechnician,
        updateTechnician,
        deleteTechnician,
        toggleTechnicianStatus,
        technicianPayments,
        recordTechnicianPayment,
        cancelTechnicianPayment,
        technicalServiceTypes,
        addTechnicalServiceType,
        updateTechnicalServiceType,
        deleteTechnicalServiceType,
        toggleTechnicalServiceTypeStatus,
        companyExpenses,
        addCompanyExpense,
        updateCompanyExpense,
        deleteCompanyExpense,
        customExpenseCategories,
        addExpenseCategory,
        updateExpenseCategory,
        deleteExpenseCategory,
        toggleExpenseCategoryStatus,
        fixedExpenses,
        addFixedExpense,
        updateFixedExpense,
        pauseFixedExpense,
        resumeFixedExpense,
        closeFixedExpense,
        deleteFixedExpense,
        generateFixedExpenseOccurrences,
        selectedDetailItem,
        setSelectedDetailItem,
        selectedBillingClientId,
        setSelectedBillingClientId,
        permissionNotice,
        updateCompanySettings,
        seedDemoData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
