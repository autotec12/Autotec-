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
} from '../types';
import { useAuth } from './AuthContext';
import { getCurrentMonthStr, getTodayIsoDate } from '../lib/calculations';

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
  pixKey: '38.450.812/0001-94',
  pixKeyType: 'CNPJ',
  address: 'Atendimento e Suporte em todo o território nacional',
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
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultSettings);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync Listeners
  useEffect(() => {
    // Only attach if user is signed in
    if (!user) {
      setClients([]);
      setVehicles([]);
      setCharges([]);
      setPayments([]);
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
            console.error('Error saving default company settings:', err);
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'company_settings/default');
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
        handleFirestoreError(error, OperationType.LIST, 'clients');
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
        handleFirestoreError(error, OperationType.LIST, 'vehicles');
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
        handleFirestoreError(error, OperationType.LIST, 'charges');
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
        handleFirestoreError(error, OperationType.LIST, 'payments');
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
        handleFirestoreError(error, OperationType.LIST, 'plans');
      }
    );

    // 7. Audit Logs
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
      await updateDoc(doc(db, 'company_settings', 'default'), cleanFirestoreData({
        ...settings,
        updatedAt: now,
        updatedBy: user?.uid || '',
      }));
      await logAudit('UPDATE', 'CompanySettings', 'default', 'Atualizou configurações da empresa e recibos');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'company_settings/default');
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
        generateMonthlyCharges,
        recordPayment,
        updateCompanySettings,
        seedDemoData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
