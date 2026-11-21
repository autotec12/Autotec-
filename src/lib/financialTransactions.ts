import {
  BalanceHandling,
  CarriedBalanceSourceItem,
  Charge,
  ChargePostponementRecord,
  Client,
  CompanySettings,
  ConsolidatedPaymentItem,
  Payment,
  PaymentMethod,
  Plan,
  Vehicle,
} from '../types';
import {
  getChargeEffectiveOpenBalance,
  getPostponeEligibility,
  isChargeEligibleForBalanceCarryOver,
  normalizeIsoDate,
  planMonthlyCharges,
} from './calculations';

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

function isPlainObject(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function stripUndefinedDeep<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object' || obj instanceof Date) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (!isPlainObject(obj)) {
    return obj;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) {
      continue;
    }
    if (Array.isArray(val) || isPlainObject(val)) {
      cleaned[key] = stripUndefinedDeep(val);
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned as T;
}

export function findUndefinedPaths(value: unknown, path = ''): string[] {
  if (value === undefined) {
    return [path || '<root>'];
  }
  if (Array.isArray(value)) {
    const paths: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      paths.push(...findUndefinedPaths(value[i], itemPath));
    }
    return paths;
  }
  if (isPlainObject(value)) {
    const paths: string[] = [];
    for (const [key, val] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      paths.push(...findUndefinedPaths(val, nextPath));
    }
    return paths;
  }
  return [];
}

export function assertNoUndefinedDeep(value: unknown, contextLabel = 'documento'): void {
  const invalidPaths = findUndefinedPaths(value);
  if (invalidPaths.length > 0) {
    throw new FinancialValidationError(
      `Dados inválidos para gravação em ${contextLabel}: campo(s) indefinido(s) detectado(s) (${invalidPaths.join(', ')}).`,
      'UNDEFINED_FIELD_VALUE'
    );
  }
}

function isBalanceAlreadyCarried(charge: Charge): boolean {
  return (
    charge.carriedBalanceConsumed === true ||
    (typeof charge.carriedToChargeId === 'string' && charge.carriedToChargeId.trim().length > 0)
  );
}

function getLiveRemainingBalance(charge: Charge): number {
  return getChargeEffectiveOpenBalance(charge);
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
  carriedSourceIds: string[];
  untransferredPlanChargeIds: string[];
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
    for (const srcId of item.carryOverSourceIds || []) {
      if (!isValidFirestoreDocId(srcId)) {
        throw new FinancialValidationError(
          'Identificador de cobrança de origem inválido para transporte de saldo.',
          'INVALID_CHARGE_ID'
        );
      }
    }
  }

  let created = 0;
  let skipped = plan.skippedCount;
  const createdIds: string[] = [];
  const supersededIds: string[] = [];
  const carriedSourceIds: string[] = [];

  if (plan.chargesToCreate.length === 0) {
    return {
      created,
      skipped,
      createdIds,
      supersededIds,
      carriedSourceIds,
      untransferredPlanChargeIds: plan.untransferredPlanChargeIds,
    };
  }

  // Agrupa itens em lotes respeitando o limite de 500 operações do Firestore,
  // mantendo cada cobrança de destino e todas as suas cobranças de origem na MESMA transação atômica.
  const MAX_WRITES_PER_TX = 200;
  const chunks: typeof plan.chargesToCreate[] = [];
  let currentChunk: typeof plan.chargesToCreate = [];
  let currentChunkOps = 0;

  for (const item of plan.chargesToCreate) {
    const itemOps =
      1 + (item.carryOverSourceIds?.length || 0) + (item.supersededChargeIds?.length || 0);
    if (currentChunk.length > 0 && currentChunkOps + itemOps > MAX_WRITES_PER_TX) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChunkOps = 0;
    }
    currentChunk.push(item);
    currentChunkOps += itemOps;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  for (const chunk of chunks) {
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

      const uniqueCarrySourceIds = Array.from(
        new Set(chunk.flatMap((item) => item.carryOverSourceIds || []))
      );
      const carrySnapsList = await Promise.all(
        uniqueCarrySourceIds.map((srcId) => tx.get<Charge>('charges', srcId))
      );
      const carrySnapMap = new Map<string, DocSnapLike<Charge>>();
      uniqueCarrySourceIds.forEach((srcId, idx) => {
        carrySnapMap.set(srcId, carrySnapsList[idx]);
      });

      const localCreatedIds: string[] = [];
      const localSupersededIds: string[] = [];
      const localCarriedSourceIds: string[] = [];
      const consumedSourceIdsInTx = new Set<string>();
      let localSkipped = 0;

      // 2. Stage atomic writes only for charges that do not exist yet
      for (let idx = 0; idx < chunk.length; idx++) {
        const item = chunk[idx];
        const targetSnap = targetSnaps[idx];

        if (targetSnap.exists()) {
          localSkipped++;
          continue;
        }

        // Revalidação transacional contra o estado VIVO de cada cobrança de origem:
        // garante consumo único, atomicidade e proteção contra concorrência e pagamentos intermediários.
        const verifiedSources: CarriedBalanceSourceItem[] = [];
        const sourceUpdatesToStage: { sourceId: string; amount: number }[] = [];

        for (const srcId of item.carryOverSourceIds || []) {
          if (consumedSourceIdsInTx.has(srcId)) continue;
          const srcSnap = carrySnapMap.get(srcId);
          if (!srcSnap || !srcSnap.exists()) continue;

          const rawSrc = srcSnap.data()!;
          const liveSrc: Charge = { ...rawSrc, id: rawSrc.id || srcSnap.id };

          if (
            !isChargeEligibleForBalanceCarryOver(
              liveSrc,
              { id: item.data.vehicleId, clientId: item.data.clientId },
              month
            )
          ) {
            continue;
          }

          const liveCarryAmount = getChargeEffectiveOpenBalance(liveSrc);
          if (liveCarryAmount <= 0.009) continue;

          consumedSourceIdsInTx.add(srcId);
          verifiedSources.push({
            sourceChargeId: liveSrc.id,
            sourceReferenceMonth: liveSrc.referenceMonth,
            amount: liveCarryAmount,
          });
          sourceUpdatesToStage.push({
            sourceId: srcSnap.id,
            amount: liveCarryAmount,
          });
        }

        const liveCarriedBalance = roundCurrency(
          verifiedSources.reduce((sum, s) => sum + s.amount, 0)
        );
        const originalMonthlyValue = roundCurrency(Number(item.data.originalMonthlyValue));
        const discount = roundCurrency(Number(item.data.discount || 0));
        const addition = roundCurrency(Number(item.data.addition || 0));
        const totalAmount = Math.max(
          0,
          roundCurrency(originalMonthlyValue + liveCarriedBalance + addition - discount)
        );
        const paidAmount = roundCurrency(Number(item.data.paidAmount || 0));
        const remainingBalance = Math.max(0, roundCurrency(totalAmount - paidAmount));

        const newCharge: Charge = {
          ...item.data,
          id: item.deterministicId,
          originalMonthlyValue,
          previousBalanceCarried: liveCarriedBalance,
          carriedFromChargeIds:
            verifiedSources.length > 0
              ? verifiedSources.map((s) => s.sourceChargeId)
              : undefined,
          carriedBalanceSources:
            verifiedSources.length > 0 ? verifiedSources : undefined,
          discount,
          addition,
          totalAmount,
          paidAmount,
          remainingBalance,
          createdAt: txNow,
          updatedAt: txNow,
          createdBy,
        };

        // Escrita atômica 1: criação da cobrança de destino com vínculo explícito às origens
        tx.set('charges', item.deterministicId, stripUndefinedDeep(newCharge));
        localCreatedIds.push(item.deterministicId);

        // Escrita atômica 2: marcação de consumo na cobrança de origem sem apagar saldos históricos
        for (const srcUpd of sourceUpdatesToStage) {
          tx.update(
            'charges',
            srcUpd.sourceId,
            stripUndefinedDeep({
              carriedBalanceConsumed: true,
              carriedToChargeId: item.deterministicId,
              carriedToReferenceMonth: month,
              carriedBalanceAmount: srcUpd.amount,
              carriedBalanceAt: txNow,
              updatedAt: txNow,
            })
          );
          localCarriedSourceIds.push(srcUpd.sourceId);
        }

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
        carriedSourceIds: localCarriedSourceIds,
        skipped: localSkipped,
      };
    });

    created += chunkOutcome.createdIds.length;
    skipped += chunkOutcome.skipped;
    createdIds.push(...chunkOutcome.createdIds);
    supersededIds.push(...chunkOutcome.supersededIds);
    carriedSourceIds.push(...chunkOutcome.carriedSourceIds);
  }

  return {
    created,
    skipped,
    createdIds,
    supersededIds,
    carriedSourceIds,
    untransferredPlanChargeIds: plan.untransferredPlanChargeIds,
  };
}

export interface RecordPaymentExecutionResult {
  payment: Payment;
  wasReplay: boolean;
  isFullyPaid: boolean;
  newRemainingBalance: number;
}

function isValidCalendarDateString(dateStr: string): boolean {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/**
 * Valida a data real do pagamento (aceita YYYY-MM-DD ou timestamp ISO válido).
 * Regra de baixa antecipada: NUNCA bloqueia datas anteriores ao vencimento (`dueDate`).
 */
export function resolveValidPaymentDate(
  paymentDate: string | undefined,
  fallbackNowIso: string
): string {
  if (paymentDate === undefined || paymentDate === null || paymentDate.trim() === '') {
    return fallbackNowIso;
  }
  const trimmed = paymentDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    if (!isValidCalendarDateString(trimmed)) {
      throw new FinancialValidationError(
        'Informe uma data de pagamento válida no formato AAAA-MM-DD.',
        'INVALID_PAYMENT_DATE'
      );
    }
    return trimmed;
  }
  // Aceita timestamp ISO completo (ex: 2026-11-20T14:30:00.000Z)
  const isoPrefix = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed) && isValidCalendarDateString(isoPrefix)) {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return trimmed;
    }
  }
  throw new FinancialValidationError(
    'Informe uma data de pagamento válida.',
    'INVALID_PAYMENT_DATE'
  );
}

export async function executeRecordPayment(
  store: FinancialStoreAdapter,
  params: {
    chargeId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate?: string;
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
    paymentDate,
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

  // Pré-validação de formato de data (permite livremente pagamento antecipado antes do vencimento)
  const preValidatedDate = paymentDate !== undefined ? resolveValidPaymentDate(paymentDate, '') : undefined;

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

    if (isBalanceAlreadyCarried(liveCharge) && currentRemaining <= 0.009) {
      throw new FinancialValidationError(
        `O saldo restante desta mensalidade já foi transportado para a competência ${liveCharge.carriedToReferenceMonth || liveCharge.carriedToChargeId}. Registre o pagamento na cobrança de destino.`,
        'BALANCE_ALREADY_CARRIED'
      );
    }

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
    const effectivePaymentDate = preValidatedDate || txNow;
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
      paymentDate: effectivePaymentDate,
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
    // Preserva integralmente dueDate, originalDueDate e referenceMonth originais da cobrança.
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
        paymentDate: effectivePaymentDate,
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

  // Valida formato de data de pagamento (nunca bloqueia baixa antecipada antes do vencimento)
  const effectiveConsolidatedPaymentDate = resolveValidPaymentDate(
    paymentDate,
    now || new Date().toISOString()
  );

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

      if (isBalanceAlreadyCarried(currentData) && currentRemaining <= 0.009) {
        throw new FinancialValidationError(
          `O saldo restante da mensalidade do veículo ${currentData.vehiclePlate} (${currentData.referenceMonth}) já foi transportado para ${currentData.carriedToReferenceMonth || currentData.carriedToChargeId}.`,
          'BALANCE_ALREADY_CARRIED'
        );
      }

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
        dueDate: currentData.dueDate,
        originalAmount: totalChargeAmount,
        previousPaidAmount: currentPaid,
        paidInThisOperation: amountToPay,
        remainingAfterOperation: newRemaining,
        statusAfterOperation: newStatus,
      });

      // Preserva integralmente dueDate, originalDueDate e referenceMonth originais de cada cobrança.
      chargeUpdates.push({
        chargeId,
        updateData: stripUndefinedDeep({
          paidAmount: newPaid,
          remainingBalance: newRemaining,
          status: newStatus,
          balanceHandling: isFullyPaid ? 'none' : currentData.balanceHandling || 'none',
          paymentDate: effectiveConsolidatedPaymentDate,
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
      paymentDate: effectiveConsolidatedPaymentDate,
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

export interface PostponeChargeParams {
  chargeId: string;
  newDueDate: string;
  reason?: string;
  operatorId?: string;
  operatorName?: string;
  now?: string;
  referenceToday?: string;
}

export interface PostponeChargeResult {
  record: ChargePostponementRecord;
  charge: Charge;
  updatePayload: Record<string, any>;
}

/**
 * Adiamento transacional de mensalidade (leitura ao vivo + validação estrita + payload livre de undefined).
 * Preserva integralmente competência (referenceMonth), valores, pagamentos, status e campos da Etapa A2.
 */
export async function executePostponeCharge(
  store: FinancialStoreAdapter,
  params: PostponeChargeParams
): Promise<PostponeChargeResult> {
  const { chargeId, newDueDate, reason, operatorId, operatorName, now, referenceToday } = params;

  if (!isValidFirestoreDocId(chargeId)) {
    throw new FinancialValidationError(
      'Identificador da mensalidade ausente ou inválido para adiamento.',
      'INVALID_CHARGE_ID'
    );
  }

  const normalizedNewDate = normalizeIsoDate(newDueDate);
  if (!normalizedNewDate || !isValidCalendarDateString(normalizedNewDate)) {
    throw new FinancialValidationError(
      'Informe uma nova data de vencimento válida para o adiamento (dia, mês e ano).',
      'INVALID_NEW_DUE_DATE'
    );
  }

  return store.runTransaction(async (tx) => {
    const chargeSnap = await tx.get<Charge>('charges', chargeId);
    if (!chargeSnap.exists()) {
      throw new FinancialValidationError(
        'Mensalidade não encontrada para adiamento.',
        'CHARGE_NOT_FOUND'
      );
    }

    const liveCharge = { ...chargeSnap.data()!, id: chargeSnap.data()!.id || chargeId };

    // Validação rigorosa dos campos obrigatórios da cobrança (nunca inventar valores falsos)
    const liveClientId =
      typeof liveCharge.clientId === 'string' ? liveCharge.clientId.trim() : '';
    if (!liveClientId) {
      throw new FinancialValidationError(
        'A mensalidade está sem identificador do cliente (clientId) e não pode ser adiada.',
        'MISSING_REQUIRED_FIELD'
      );
    }

    const liveClientName =
      typeof liveCharge.clientName === 'string' ? liveCharge.clientName.trim() : '';
    if (!liveClientName) {
      throw new FinancialValidationError(
        'A mensalidade está sem nome do cliente cadastrado e não pode ser adiada.',
        'MISSING_REQUIRED_FIELD'
      );
    }

    const liveReferenceMonth =
      typeof liveCharge.referenceMonth === 'string' ? liveCharge.referenceMonth.trim() : '';
    if (!/^\d{4}-\d{2}$/.test(liveReferenceMonth)) {
      throw new FinancialValidationError(
        'A mensalidade está sem competência válida (referenceMonth) e não pode ser adiada.',
        'MISSING_REQUIRED_FIELD'
      );
    }

    const currentDueDate = normalizeIsoDate(liveCharge.dueDate);
    if (!currentDueDate || !isValidCalendarDateString(currentDueDate)) {
      throw new FinancialValidationError(
        'A mensalidade não possui data de vencimento válida (dueDate) para adiamento.',
        'MISSING_REQUIRED_FIELD'
      );
    }

    const eligibility = getPostponeEligibility(liveCharge, referenceToday);
    if (!eligibility.allowed) {
      throw new FinancialValidationError(
        eligibility.reason || 'Esta mensalidade não pode ser adiada.',
        'POSTPONE_NOT_ALLOWED'
      );
    }

    if (normalizedNewDate === currentDueDate) {
      throw new FinancialValidationError(
        'A nova data de vencimento precisa ser diferente da data atual.',
        'SAME_DUE_DATE'
      );
    }

    const txNow = now || new Date().toISOString();
    const existingOriginalDue = normalizeIsoDate(liveCharge.originalDueDate);
    const originalDueDate =
      existingOriginalDue && isValidCalendarDateString(existingOriginalDue)
        ? existingOriginalDue
        : currentDueDate;

    const targetType: 'plano' | 'veiculo' = liveCharge.isPlanCharge ? 'plano' : 'veiculo';
    const trimmedPlate =
      typeof liveCharge.vehiclePlate === 'string' ? liveCharge.vehiclePlate.trim() : '';
    const trimmedModel =
      typeof liveCharge.vehicleModel === 'string' ? liveCharge.vehicleModel.trim() : '';
    const trimmedPlanName =
      typeof liveCharge.planName === 'string' ? liveCharge.planName.trim() : '';

    const targetLabel = liveCharge.isPlanCharge
      ? [trimmedPlanName || 'Plano', trimmedPlate ? `(${trimmedPlate})` : '']
          .filter(Boolean)
          .join(' ')
      : [trimmedPlate, trimmedModel].filter(Boolean).join(' — ') || 'Veículo';

    // Montagem limpa do registro de adiamento: campos opcionais só entram quando definidos e válidos
    const postponementRecord: ChargePostponementRecord = {
      id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      originalDueDate,
      previousDueDate: currentDueDate,
      newDueDate: normalizedNewDate,
      referenceMonth: liveReferenceMonth,
      clientId: liveClientId,
      clientName: liveClientName,
      targetType,
      targetLabel,
      postponedAt: txNow,
    };

    const trimmedPlanId =
      typeof liveCharge.planId === 'string' ? liveCharge.planId.trim() : '';
    if (trimmedPlanId) {
      postponementRecord.planId = trimmedPlanId;
    }

    const trimmedVehicleId =
      typeof liveCharge.vehicleId === 'string' ? liveCharge.vehicleId.trim() : '';
    if (trimmedVehicleId) {
      postponementRecord.vehicleId = trimmedVehicleId;
    }

    const trimmedOperatorId =
      typeof operatorId === 'string' ? operatorId.trim() : '';
    if (trimmedOperatorId) {
      postponementRecord.operatorId = trimmedOperatorId;
    }

    const trimmedOperatorName =
      typeof operatorName === 'string' ? operatorName.trim() : '';
    if (trimmedOperatorName) {
      postponementRecord.operatorName = trimmedOperatorName;
    }

    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (trimmedReason) {
      postponementRecord.reason = trimmedReason;
    }

    const sanitizedExistingHistory: ChargePostponementRecord[] = Array.isArray(
      liveCharge.postponementHistory
    )
      ? liveCharge.postponementHistory
          .filter((entry): entry is ChargePostponementRecord => Boolean(entry && typeof entry === 'object'))
          .map((entry) => stripUndefinedDeep(entry))
      : [];

    const nextHistory = [...sanitizedExistingHistory, postponementRecord];

    const updatePayload = stripUndefinedDeep({
      dueDate: normalizedNewDate,
      originalDueDate,
      isPostponed: true,
      postponedAt: txNow,
      postponementCount: nextHistory.length,
      postponementHistory: nextHistory,
      updatedAt: txNow,
    });

    assertNoUndefinedDeep(updatePayload, `charges/${chargeId}`);

    tx.update('charges', chargeId, updatePayload);

    const updatedCharge: Charge = {
      ...liveCharge,
      dueDate: normalizedNewDate,
      originalDueDate,
      isPostponed: true,
      postponedAt: txNow,
      postponementCount: nextHistory.length,
      postponementHistory: nextHistory,
      updatedAt: txNow,
    };

    return {
      record: postponementRecord,
      charge: updatedCharge,
      updatePayload,
    };
  });
}
