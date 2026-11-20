import {
  BalanceHandling,
  Charge,
  Client,
  CompanySettings,
  ConsolidatedPaymentItem,
  Payment,
  PaymentMethod,
  Plan,
  Vehicle,
} from '../types';
import { planMonthlyCharges } from './calculations';

export class FinancialValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = 'FINANCIAL_VALIDATION_ERROR') {
    super(message);
    this.name = 'FinancialValidationError';
    this.code = code;
  }
}

export interface DocSnapLike<T = Record<string, any>> {
  id: string;
  exists(): boolean;
  data(): T | undefined;
}

export interface TransactionLike {
  get<T = Record<string, any>>(
    collectionName: 'charges' | 'payments',
    id: string
  ): Promise<DocSnapLike<T>>;
  set(collectionName: 'charges' | 'payments', id: string, data: Record<string, any>): void;
  update(collectionName: 'charges' | 'payments', id: string, data: Record<string, any>): void;
}

export interface FinancialStoreAdapter {
  runTransaction<R>(fn: (tx: TransactionLike) => Promise<R>): Promise<R>;
}

export function roundCurrency(value: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Math.sign(num) * 1e-10) * 100) / 100;
}

export function isValidFirestoreDocId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(id)
  );
}

export function createOperationId(prefix = 'op'): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_') || 'op';
  return `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeOperationId(rawId?: string, prefix = 'pay'): string {
  if (rawId === undefined || rawId === null || rawId === '') {
    return createOperationId(prefix);
  }
  const trimmed = String(rawId).trim();
  if (!isValidFirestoreDocId(trimmed)) {
    throw new FinancialValidationError(
      'Identificador de operação inválido.',
      'INVALID_OPERATION_ID'
    );
  }
  return trimmed;
}

export function stripUndefinedDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj) || obj instanceof Date) {
    return obj;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj as Record<string, any>)) {
    if (val === undefined) {
      continue;
    }
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      cleaned[key] = stripUndefinedDeep(val);
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned as T;
}

function getLiveRemainingBalance(charge: Charge): number {
  const raw = charge.remainingBalance as unknown;
  if (raw !== undefined && raw !== null && raw !== '' && !Number.isNaN(Number(raw))) {
    return Math.max(0, roundCurrency(Number(raw)));
  }
  const total = roundCurrency(Number(charge.totalAmount) || 0);
  const paid = roundCurrency(Number(charge.paidAmount) || 0);
  return Math.max(0, roundCurrency(total - paid));
}

export interface CreateChargeIfAbsentResult {
  created: boolean;
  id: string;
  charge: Charge;
}

export async function executeCreateChargeIfAbsent(
  store: FinancialStoreAdapter,
  params: {
    id: string;
    data: Omit<Charge, 'id' | 'createdAt' | 'updatedAt'>;
    createdBy?: string;
    now?: string;
  }
): Promise<CreateChargeIfAbsentResult> {
  const { id, data, createdBy = '', now } = params;

  if (!isValidFirestoreDocId(id)) {
    throw new FinancialValidationError('ID de cobrança inválido.', 'INVALID_CHARGE_ID');
  }

  const originalMonthlyValue = roundCurrency(Number(data.originalMonthlyValue));
  const previousBalanceCarried = roundCurrency(Number(data.previousBalanceCarried || 0));
  const discount = roundCurrency(Number(data.discount || 0));
  const addition = roundCurrency(Number(data.addition || 0));
  const totalAmount = roundCurrency(Number(data.totalAmount));
  const paidAmount = roundCurrency(Number(data.paidAmount || 0));
  const remainingBalance = roundCurrency(Number(data.remainingBalance));

  if (
    !Number.isFinite(originalMonthlyValue) ||
    originalMonthlyValue < 0 ||
    !Number.isFinite(totalAmount) ||
    totalAmount < 0 ||
    !Number.isFinite(paidAmount) ||
    paidAmount < 0 ||
    !Number.isFinite(remainingBalance) ||
    remainingBalance < 0
  ) {
    throw new FinancialValidationError(
      'Valores financeiros inválidos para criação de cobrança.',
      'INVALID_CHARGE_VALUES'
    );
  }

  return store.runTransaction(async (tx) => {
    const existingSnap = await tx.get<Charge>('charges', id);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data()!;
      return {
        created: false,
        id,
        charge: { ...existingData, id: existingData.id || id },
      };
    }

    const txNow = now || new Date().toISOString();
    const newCharge: Charge = {
      ...data,
      id,
      originalMonthlyValue,
      previousBalanceCarried,
      discount,
      addition,
      totalAmount,
      paidAmount,
      remainingBalance,
      createdAt: txNow,
      updatedAt: txNow,
      createdBy,
    };

    tx.set('charges', id, stripUndefinedDeep(newCharge));

    return {
      created: true,
      id,
      charge: newCharge,
    };
  });
}

export interface GenerateMonthlyChargesResult {
  created: number;
  skipped: number;
  createdIds: string[];
  supersededIds: string[];
}

export async function executeMonthlyChargeGeneration(
  store: FinancialStoreAdapter,
  params: {
    month: string;
    clients: Client[];
    vehicles: Vehicle[];
    plans?: Plan[];
    charges: Charge[];
    fetchServerCharges?: () => Promise<Charge[]>;
    createdBy?: string;
    now?: string;
  }
): Promise<GenerateMonthlyChargesResult> {
  const {
    month,
    clients,
    vehicles,
    plans = [],
    charges,
    fetchServerCharges,
    createdBy = '',
    now,
  } = params;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new FinancialValidationError(
      'Competência inválida para geração de mensalidades.',
      'INVALID_MONTH'
    );
  }

  const authoritativeCharges = fetchServerCharges ? await fetchServerCharges() : charges;

  const plan = planMonthlyCharges({
    month,
    clients,
    vehicles,
    plans,
    charges: authoritativeCharges,
  });

  // Validação prévia antes de iniciar qualquer transação
  for (const item of plan.chargesToCreate) {
    if (!isValidFirestoreDocId(item.deterministicId)) {
      throw new FinancialValidationError(
        'Identificador determinístico de cobrança inválido.',
        'INVALID_CHARGE_ID'
      );
    }
    const originalMonthlyValue = roundCurrency(Number(item.data.originalMonthlyValue));
    const totalAmount = roundCurrency(Number(item.data.totalAmount));
    const remainingBalance = roundCurrency(Number(item.data.remainingBalance));
    if (
      !Number.isFinite(originalMonthlyValue) ||
      originalMonthlyValue < 0 ||
      !Number.isFinite(totalAmount) ||
      totalAmount < 0 ||
      !Number.isFinite(remainingBalance) ||
      remainingBalance < 0
    ) {
      throw new FinancialValidationError(
        `Valores financeiros inválidos para geração da cobrança do veículo ${item.data.vehiclePlate}.`,
        'INVALID_CHARGE_VALUES'
      );
    }
  }

  let created = 0;
  let skipped = plan.skippedCount;
  const createdIds: string[] = [];
  const supersededIds: string[] = [];

  if (plan.chargesToCreate.length === 0) {
    return {
      created,
      skipped,
      createdIds,
      supersededIds,
    };
  }

  // Até 200 itens por transação mantém leitura+escrita dentro do limite de 500 operações do Firestore
  // e garante rollback atômico integral em lotes convencionais se houver falha no commit.
  const TX_CHUNK_SIZE = 200;

  for (let i = 0; i < plan.chargesToCreate.length; i += TX_CHUNK_SIZE) {
    const chunk = plan.chargesToCreate.slice(i, i + TX_CHUNK_SIZE);
    const txNow = now || new Date().toISOString();

    const chunkOutcome = await store.runTransaction(async (tx) => {
      // 1. All reads MUST happen before any writes
      const targetSnaps = await Promise.all(
        chunk.map((item) => tx.get<Charge>('charges', item.deterministicId))
      );

      const uniqueSupIds = Array.from(
        new Set(chunk.flatMap((item) => item.supersededChargeIds || []))
      );
      const supSnapsList = await Promise.all(
        uniqueSupIds.map((supId) => tx.get<Charge>('charges', supId))
      );
      const supSnapMap = new Map<string, DocSnapLike<Charge>>();
      uniqueSupIds.forEach((supId, idx) => {
        supSnapMap.set(supId, supSnapsList[idx]);
      });

      const localCreatedIds: string[] = [];
      const localSupersededIds: string[] = [];
      let localSkipped = 0;

      // 2. Stage atomic writes only for charges that do not exist yet
      for (let idx = 0; idx < chunk.length; idx++) {
        const item = chunk[idx];
        const targetSnap = targetSnaps[idx];

        if (targetSnap.exists()) {
          localSkipped++;
          continue;
        }

        const newCharge: Charge = {
          ...item.data,
          id: item.deterministicId,
          originalMonthlyValue: roundCurrency(Number(item.data.originalMonthlyValue)),
          previousBalanceCarried: roundCurrency(Number(item.data.previousBalanceCarried || 0)),
          discount: roundCurrency(Number(item.data.discount || 0)),
          addition: roundCurrency(Number(item.data.addition || 0)),
          totalAmount: roundCurrency(Number(item.data.totalAmount)),
          paidAmount: roundCurrency(Number(item.data.paidAmount || 0)),
          remainingBalance: roundCurrency(Number(item.data.remainingBalance)),
          createdAt: txNow,
          updatedAt: txNow,
          createdBy,
        };

        tx.set('charges', item.deterministicId, stripUndefinedDeep(newCharge));
        localCreatedIds.push(item.deterministicId);

        for (const supId of item.supersededChargeIds || []) {
          const supSnap = supSnapMap.get(supId);
          if (!supSnap || !supSnap.exists()) continue;
          const sc = supSnap.data()!;
          const scPaid = roundCurrency(Number(sc.paidAmount) || 0);
          if (
            !sc.isPlanCharge &&
            sc.referenceMonth === month &&
            sc.status === 'pendente' &&
            scPaid === 0
          ) {
            tx.update(
              'charges',
              supSnap.id,
              stripUndefinedDeep({
                status: 'cancelado',
                notes: `Substituída - Ref: ${item.deterministicId}`,
                updatedAt: txNow,
              })
            );
            localSupersededIds.push(supSnap.id);
          }
        }
      }

      return {
        createdIds: localCreatedIds,
        supersededIds: localSupersededIds,
        skipped: localSkipped,
      };
    });

    created += chunkOutcome.createdIds.length;
    skipped += chunkOutcome.skipped;
    createdIds.push(...chunkOutcome.createdIds);
    supersededIds.push(...chunkOutcome.supersededIds);
  }

  return {
    created,
    skipped,
    createdIds,
    supersededIds,
  };
}

export interface RecordPaymentExecutionResult {
  payment: Payment;
  wasReplay: boolean;
  isFullyPaid: boolean;
  newRemainingBalance: number;
}

export async function executeRecordPayment(
  store: FinancialStoreAdapter,
  params: {
    chargeId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    balanceHandling?: BalanceHandling;
    balanceScheduledDate?: string;
    operatorId: string;
    operatorName: string;
    companySnapshot?: Partial<CompanySettings>;
    operationId?: string;
    now?: string;
    receiptNumber?: string;
  }
): Promise<RecordPaymentExecutionResult> {
  const {
    chargeId,
    amount,
    paymentMethod,
    notes,
    balanceHandling = 'none',
    balanceScheduledDate,
    operatorId,
    operatorName,
    companySnapshot,
    operationId,
    now,
    receiptNumber,
  } = params;

  if (!isValidFirestoreDocId(chargeId)) {
    throw new FinancialValidationError('Cobrança inválida para pagamento.', 'INVALID_CHARGE_ID');
  }

  const paymentValue = roundCurrency(Number(amount));
  if (!Number.isFinite(paymentValue) || paymentValue <= 0) {
    throw new FinancialValidationError(
      'Informe um valor de recebimento válido maior que zero.',
      'INVALID_AMOUNT'
    );
  }

  const paymentId = normalizeOperationId(operationId, 'pay');

  return store.runTransaction(async (tx) => {
    // 1. All reads MUST happen before any writes
    const [paymentSnap, chargeSnap] = await Promise.all([
      tx.get<Payment>('payments', paymentId),
      tx.get<Charge>('charges', chargeId),
    ]);

    // 2. Idempotency check: exact replay returns original committed Payment without duplicating
    if (paymentSnap.exists()) {
      const existingPayment = paymentSnap.data()!;
      const existingRemaining = roundCurrency(Number(existingPayment.remainingAfterPayment) || 0);
      return {
        payment: { ...existingPayment, id: existingPayment.id || paymentId },
        wasReplay: true,
        isFullyPaid: existingRemaining <= 0.009,
        newRemainingBalance: existingRemaining,
      };
    }

    // 3. Validate live charge state from Firestore
    if (!chargeSnap.exists()) {
      throw new FinancialValidationError('Cobrança não encontrada.', 'CHARGE_NOT_FOUND');
    }

    const liveCharge = chargeSnap.data()!;

    if (liveCharge.status === 'cancelado') {
      throw new FinancialValidationError(
        'Não é possível registrar pagamento em uma mensalidade cancelada.',
        'CHARGE_CANCELLED'
      );
    }

    const totalAmount = roundCurrency(Number(liveCharge.totalAmount) || 0);
    const currentPaid = roundCurrency(Number(liveCharge.paidAmount) || 0);
    const currentRemaining = getLiveRemainingBalance(liveCharge);

    if (liveCharge.status === 'pago' || currentRemaining <= 0.009) {
      throw new FinancialValidationError(
        'Esta mensalidade já está quitada.',
        'CHARGE_ALREADY_PAID'
      );
    }

    if (paymentValue > currentRemaining + 0.009) {
      throw new FinancialValidationError(
        `O valor informado ultrapassa o saldo pendente (${currentRemaining.toFixed(2)}).`,
        'AMOUNT_EXCEEDS_BALANCE'
      );
    }

    const newPaidAmount = roundCurrency(currentPaid + paymentValue);
    const rawRemaining = roundCurrency(totalAmount - newPaidAmount);
    const isFullyPaid = rawRemaining <= 0.009;
    const newRemainingBalance = isFullyPaid ? 0 : Math.max(0, rawRemaining);
    const newStatus: Charge['status'] = isFullyPaid ? 'pago' : 'parcial';

    const txNow = now || new Date().toISOString();
    const txReceiptNumber =
      receiptNumber ||
      `REC-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const paymentData: Payment = {
      id: paymentId,
      chargeId: liveCharge.id || chargeId,
      clientId: liveCharge.clientId,
      clientName: liveCharge.clientName,
      vehicleId: liveCharge.vehicleId,
      vehiclePlate: liveCharge.vehiclePlate,
      amount: paymentValue,
      paymentDate: txNow,
      paymentMethod,
      operatorId,
      operatorName,
      receiptNumber: txReceiptNumber,
      remainingAfterPayment: newRemainingBalance,
      notes,
      companySnapshot: companySnapshot ? { ...companySnapshot } : undefined,
      createdAt: txNow,
    };

    // 4. Atomic writes (Payment creation + Charge balance/status update)
    tx.set('payments', paymentId, stripUndefinedDeep(paymentData));
    tx.update(
      'charges',
      chargeId,
      stripUndefinedDeep({
        paidAmount: newPaidAmount,
        remainingBalance: newRemainingBalance,
        status: newStatus,
        balanceHandling: isFullyPaid ? 'none' : balanceHandling,
        balanceScheduledDate: isFullyPaid ? null : balanceScheduledDate || null,
        updatedAt: txNow,
      })
    );

    return {
      payment: paymentData,
      wasReplay: false,
      isFullyPaid,
      newRemainingBalance,
    };
  });
}

export interface RecordConsolidatedPaymentExecutionResult {
  payment: Payment;
  wasReplay: boolean;
}

export async function executeRecordConsolidatedPayment(
  store: FinancialStoreAdapter,
  params: {
    clientId: string;
    clientName: string;
    items: { charge: Pick<Charge, 'id' | 'vehicleId' | 'vehiclePlate'>; amountToPay: number }[];
    paymentDate: string;
    paymentMethod: PaymentMethod;
    notes?: string;
    operatorId: string;
    operatorName: string;
    companySnapshot?: Partial<CompanySettings>;
    operationId?: string;
    now?: string;
    receiptNumber?: string;
  }
): Promise<RecordConsolidatedPaymentExecutionResult> {
  const {
    clientId,
    clientName,
    items,
    paymentDate,
    paymentMethod,
    notes = '',
    operatorId,
    operatorName,
    companySnapshot,
    operationId,
    now,
    receiptNumber,
  } = params;

  if (!items || items.length === 0) {
    throw new FinancialValidationError(
      'Selecione ao menos uma mensalidade para registrar o recebimento.',
      'EMPTY_ITEMS'
    );
  }

  const seenChargeIds = new Set<string>();
  const normalizedItems = items.map((it) => {
    const cId = it.charge?.id;
    if (!isValidFirestoreDocId(cId)) {
      throw new FinancialValidationError('Cobrança inválida no recebimento consolidado.', 'INVALID_CHARGE_ID');
    }
    if (seenChargeIds.has(cId)) {
      throw new FinancialValidationError(
        'Não é permitido incluir a mesma mensalidade duplicada no recebimento consolidado.',
        'DUPLICATE_CHARGE_ITEM'
      );
    }
    seenChargeIds.add(cId);

    const amountToPay = roundCurrency(Number(it.amountToPay));
    if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
      throw new FinancialValidationError(
        'Todos os itens do recebimento consolidado devem ter valor maior que zero.',
        'INVALID_AMOUNT'
      );
    }
    return {
      chargeId: cId,
      chargeFallback: it.charge,
      amountToPay,
    };
  });

  const totalAmount = roundCurrency(
    normalizedItems.reduce((acc, it) => acc + it.amountToPay, 0)
  );
  if (totalAmount <= 0) {
    throw new FinancialValidationError(
      'O valor total do recebimento deve ser maior que zero.',
      'INVALID_AMOUNT'
    );
  }

  const paymentId = normalizeOperationId(operationId, 'pay_cons');

  return store.runTransaction(async (tx) => {
    // 1. All reads MUST happen before any writes
    const [paymentSnap, ...chargeDocs] = await Promise.all([
      tx.get<Payment>('payments', paymentId),
      ...normalizedItems.map((it) => tx.get<Charge>('charges', it.chargeId)),
    ]);

    // 2. Idempotency check
    if (paymentSnap.exists()) {
      const existingPayment = paymentSnap.data()!;
      return {
        payment: { ...existingPayment, id: existingPayment.id || paymentId },
        wasReplay: true,
      };
    }

    const txNow = now || new Date().toISOString();
    const txReceiptNumber = receiptNumber || `REC-CONS-${Date.now().toString().slice(-6)}`;
    const consolidatedItems: ConsolidatedPaymentItem[] = [];
    const chargeUpdates: { chargeId: string; updateData: Record<string, any> }[] = [];
    const vehiclePlates: string[] = [];
    let firstLiveCharge: Charge | null = null;
    let totalRemainingAfter = 0;

    // 3. Validate all charges first before queuing updates
    for (let i = 0; i < normalizedItems.length; i++) {
      const snap = chargeDocs[i];
      const { chargeId, chargeFallback, amountToPay } = normalizedItems[i];

      if (!snap.exists()) {
        throw new FinancialValidationError(
          `Cobrança ${chargeFallback.vehiclePlate || chargeId} não encontrada.`,
          'CHARGE_NOT_FOUND'
        );
      }

      const currentData = snap.data()!;
      if (!firstLiveCharge) {
        firstLiveCharge = currentData;
      }

      if (currentData.status === 'cancelado') {
        throw new FinancialValidationError(
          `A mensalidade do veículo ${currentData.vehiclePlate} (${currentData.referenceMonth}) está cancelada.`,
          'CHARGE_CANCELLED'
        );
      }

      const currentRemaining = getLiveRemainingBalance(currentData);

      if (currentData.status === 'pago' || currentRemaining <= 0.009) {
        throw new FinancialValidationError(
          `A mensalidade do veículo ${currentData.vehiclePlate} (${currentData.referenceMonth}) já está quitada.`,
          'CHARGE_ALREADY_PAID'
        );
      }

      if (amountToPay > currentRemaining + 0.009) {
        throw new FinancialValidationError(
          `O valor informado para ${currentData.vehiclePlate} ultrapassa o saldo pendente.`,
          'AMOUNT_EXCEEDS_BALANCE'
        );
      }

      const currentPaid = roundCurrency(Number(currentData.paidAmount) || 0);
      const totalChargeAmount = roundCurrency(Number(currentData.totalAmount) || 0);
      const newPaid = roundCurrency(currentPaid + amountToPay);
      const rawRemaining = roundCurrency(totalChargeAmount - newPaid);
      const isFullyPaid = rawRemaining <= 0.009;
      const newRemaining = isFullyPaid ? 0 : Math.max(0, rawRemaining);
      const newStatus: Charge['status'] = isFullyPaid ? 'pago' : 'parcial';

      totalRemainingAfter = roundCurrency(totalRemainingAfter + newRemaining);
      vehiclePlates.push(currentData.vehiclePlate);

      consolidatedItems.push({
        chargeId: currentData.id || chargeId,
        vehicleId: currentData.vehicleId,
        vehiclePlate: currentData.vehiclePlate,
        vehicleModel: currentData.vehicleModel || '',
        referenceMonth: currentData.referenceMonth,
        originalAmount: totalChargeAmount,
        previousPaidAmount: currentPaid,
        paidInThisOperation: amountToPay,
        remainingAfterOperation: newRemaining,
        statusAfterOperation: newStatus,
      });

      chargeUpdates.push({
        chargeId,
        updateData: stripUndefinedDeep({
          paidAmount: newPaid,
          remainingBalance: newRemaining,
          status: newStatus,
          balanceHandling: isFullyPaid ? 'none' : currentData.balanceHandling || 'none',
          paymentDate,
          updatedAt: txNow,
        }),
      });
    }

    // 4. Atomic writes
    for (const upd of chargeUpdates) {
      tx.update('charges', upd.chargeId, upd.updateData);
    }

    const consolidatedPayment: Payment = {
      id: paymentId,
      chargeId: firstLiveCharge!.id || normalizedItems[0].chargeId,
      clientId,
      clientName,
      vehicleId: firstLiveCharge!.vehicleId,
      vehiclePlate: vehiclePlates.join(', '),
      amount: totalAmount,
      paymentDate,
      paymentMethod,
      operatorId,
      operatorName,
      receiptNumber: txReceiptNumber,
      remainingAfterPayment: totalRemainingAfter,
      notes:
        notes.trim() ||
        `Recebimento consolidado de ${normalizedItems.length} mensalidade(s)`,
      companySnapshot,
      isConsolidated: true,
      consolidatedItems,
      createdAt: txNow,
    };

    tx.set('payments', paymentId, stripUndefinedDeep(consolidatedPayment));

    return {
      payment: consolidatedPayment,
      wasReplay: false,
    };
  });
}
