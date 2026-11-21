import test from 'node:test';
import assert from 'node:assert/strict';
import { Charge, Client, Payment, Plan, Vehicle } from '../src/types/index.ts';
import {
  calculateDashboardMetrics,
  consolidateClientFinancials,
  getChargeEffectiveOpenBalance,
  getEffectiveCharges,
  planMonthlyCharges,
  roundCurrencyValue,
} from '../src/lib/calculations.ts';
import {
  FinancialStoreAdapter,
  FinancialValidationError,
  TransactionLike,
  executeCreateChargeIfAbsent,
  executeMonthlyChargeGeneration,
  executeRecordConsolidatedPayment,
  executeRecordPayment,
  isValidFirestoreDocId,
  roundCurrency,
} from '../src/lib/financialTransactions.ts';

type CollectionName = 'charges' | 'payments';

interface StoredRecord {
  version: number;
  data: Record<string, any>;
}

class ConflictError extends Error {
  constructor() {
    super('TRANSACTION_WRITE_CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * Simulador transacional fiel às regras do Cloud Firestore do projeto:
 * - Isolamento otimista com detecção de conflito por versão e retry automático (até 5 tentativas)
 * - Leitura obrigatória antes de escrita dentro da transação
 * - Imutabilidade de `payments` (allow update: if false)
 * - Campos imutáveis em `charges` (originalMonthlyValue, clientId, vehicleId)
 * - Suporte a falha simulada no commit para provar rollback atômico
 */
class InMemoryTransactionalFirestore implements FinancialStoreAdapter {
  private collections: Record<CollectionName, Map<string, StoredRecord>> = {
    charges: new Map(),
    payments: new Map(),
  };

  public failNextCommitError: Error | null = null;
  public onCommitBarrier: (() => Promise<void>) | null = null;
  public transactionRetryCount = 0;

  seedCharge(charge: Charge): void {
    this.collections.charges.set(charge.id, {
      version: 1,
      data: structuredClone(charge),
    });
  }

  getCharge(id: string): Charge | undefined {
    const entry = this.collections.charges.get(id);
    return entry ? (structuredClone(entry.data) as Charge) : undefined;
  }

  getAllCharges(): Charge[] {
    return Array.from(this.collections.charges.values()).map(
      (entry) => structuredClone(entry.data) as Charge
    );
  }

  getPayment(id: string): Payment | undefined {
    const entry = this.collections.payments.get(id);
    return entry ? (structuredClone(entry.data) as Payment) : undefined;
  }

  getAllPayments(): Payment[] {
    return Array.from(this.collections.payments.values()).map(
      (entry) => structuredClone(entry.data) as Payment
    );
  }

  async runTransaction<R>(fn: (tx: TransactionLike) => Promise<R>): Promise<R> {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const readVersions = new Map<string, number>();
      const stagedOps: Array<
        | { type: 'set'; col: CollectionName; id: string; data: Record<string, any> }
        | { type: 'update'; col: CollectionName; id: string; data: Record<string, any> }
      > = [];
      let hasWritten = false;

      const tx: TransactionLike = {
        get: async <T = Record<string, any>>(col: CollectionName, id: string) => {
          if (hasWritten) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          const key = `${col}/${id}`;
          const existing = this.collections[col].get(id);
          if (!readVersions.has(key)) {
            readVersions.set(key, existing ? existing.version : 0);
          }
          return {
            id,
            exists: () => Boolean(existing),
            data: () => (existing ? (structuredClone(existing.data) as T) : undefined),
          };
        },
        set: (col, id, data) => {
          hasWritten = true;
          stagedOps.push({ type: 'set', col, id, data: structuredClone(data) });
        },
        update: (col, id, data) => {
          hasWritten = true;
          stagedOps.push({ type: 'update', col, id, data: structuredClone(data) });
        },
      };

      try {
        const result = await fn(tx);

        if (this.onCommitBarrier) {
          await this.onCommitBarrier();
        }

        if (this.failNextCommitError) {
          const err = this.failNextCommitError;
          this.failNextCommitError = null;
          throw err;
        }

        // 1. Validate versions against live store (optimistic concurrency check)
        for (const [key, expectedVersion] of readVersions.entries()) {
          const [col, id] = key.split('/') as [CollectionName, string];
          const live = this.collections[col].get(id);
          const liveVersion = live ? live.version : 0;
          if (liveVersion !== expectedVersion) {
            throw new ConflictError();
          }
        }

        // 2. Validate Firestore Rules parity before mutating anything (ensures atomic all-or-nothing)
        for (const op of stagedOps) {
          if (!isValidFirestoreDocId(op.id)) {
            throw new Error(`PERMISSION_DENIED: invalid doc id ${op.id}`);
          }
          const existing = this.collections[op.col].get(op.id);
          if (op.col === 'payments') {
            if (op.type === 'update' || existing) {
              throw new Error(`PERMISSION_DENIED: payments/${op.id} is immutable`);
            }
          }
          if (op.col === 'charges' && op.type === 'update') {
            if (!existing) {
              throw new Error(`NOT_FOUND: charges/${op.id}`);
            }
            const next = { ...existing.data, ...op.data };
            if (
              next.originalMonthlyValue !== existing.data.originalMonthlyValue ||
              next.clientId !== existing.data.clientId ||
              next.vehicleId !== existing.data.vehicleId
            ) {
              throw new Error(`PERMISSION_DENIED: immutable charge fields modified on ${op.id}`);
            }
          }
        }

        // 3. Atomic commit
        for (const op of stagedOps) {
          const prev = this.collections[op.col].get(op.id);
          if (op.type === 'set') {
            this.collections[op.col].set(op.id, {
              version: (prev?.version || 0) + 1,
              data: op.data,
            });
          } else {
            this.collections[op.col].set(op.id, {
              version: prev!.version + 1,
              data: { ...prev!.data, ...op.data },
            });
          }
        }

        return result;
      } catch (err) {
        if (err instanceof ConflictError && attempt < maxAttempts) {
          this.transactionRetryCount++;
          continue;
        }
        throw err;
      }
    }

    throw new Error('Transaction exceeded max retries');
  }
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'cli_1',
    name: 'Carlos Silva',
    document: '12345678901',
    phone: '85999990000',
    whatsapp: '85999990000',
    status: 'ativo',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z',
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'veh_1',
    clientId: 'cli_1',
    vehicleType: 'carro',
    brand: 'Fiat',
    model: 'Uno',
    plate: 'ABC1D23',
    color: 'Branco',
    planDescription: 'Plano Padrão',
    monthlyValue: 100,
    dueDay: 10,
    contractStartDate: '2026-01-10',
    status: 'ativo',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z',
    ...overrides,
  };
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan_1',
    name: 'Plano Frota 2 Carros',
    composition: [{ vehicleType: 'carro', count: 2, unitValue: 75 }],
    totalMonthlyValue: 150,
    status: 'ativo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCharge(overrides: Partial<Charge> = {}): Charge {
  return {
    id: 'chg_veh_veh_1_2026-05',
    clientId: 'cli_1',
    clientName: 'Carlos Silva',
    vehicleId: 'veh_1',
    vehiclePlate: 'ABC1D23',
    vehicleModel: 'Fiat Uno',
    referenceMonth: '2026-05',
    originalMonthlyValue: 100,
    previousBalanceCarried: 0,
    discount: 0,
    addition: 0,
    totalAmount: 100,
    paidAmount: 0,
    remainingBalance: 100,
    dueDate: '2026-05-10',
    status: 'pendente',
    balanceHandling: 'none',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

test('Cenário 1: Gerar duas vezes a mesma competência não duplica cobranças', async () => {
  const store = new InMemoryTransactionalFirestore();
  const clients = [makeClient()];
  const vehicles = [makeVehicle()];
  const plans: Plan[] = [];

  const first = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients,
    vehicles,
    plans,
    charges: [],
    createdBy: 'admin_uid',
  });

  assert.equal(first.created, 1);
  assert.equal(store.getAllCharges().length, 1);

  // Segunda chamada com cache local sincronizado
  const secondSynced = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients,
    vehicles,
    plans,
    charges: store.getAllCharges(),
    createdBy: 'admin_uid',
  });

  assert.equal(secondSynced.created, 0);
  assert.equal(secondSynced.skipped, 1);
  assert.equal(store.getAllCharges().length, 1);

  // Terceira chamada simulando estado local defasado (charges: []) sem sobrescrever nem duplicar
  const thirdStale = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients,
    vehicles,
    plans,
    charges: [],
    createdBy: 'admin_uid',
  });

  assert.equal(thirdStale.created, 0);
  assert.equal(thirdStale.skipped, 1);
  assert.equal(store.getAllCharges().length, 1);
});

test('Cenário 2: Uma cobrança quitada não é sobrescrita', async () => {
  const store = new InMemoryTransactionalFirestore();
  const paidCharge = makeCharge({
    id: 'chg_veh_veh_1_2026-05',
    status: 'pago',
    paidAmount: 100,
    remainingBalance: 0,
    notes: 'Quitada via PIX',
  });
  store.seedCharge(paidCharge);

  // Mesmo se estado local estiver vazio (defasado), a geração não pode sobrescrever a cobrança paga
  const genRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [makeClient()],
    vehicles: [makeVehicle()],
    plans: [],
    charges: [],
    createdBy: 'admin_uid',
  });

  assert.equal(genRes.created, 0);
  assert.equal(genRes.skipped, 1);

  // Mesmo se executeCreateChargeIfAbsent (addCharge) for chamado diretamente com o mesmo customId
  const addRes = await executeCreateChargeIfAbsent(store, {
    id: 'chg_veh_veh_1_2026-05',
    data: {
      clientId: 'cli_1',
      clientName: 'Carlos Silva',
      vehicleId: 'veh_1',
      vehiclePlate: 'ABC1D23',
      vehicleModel: 'Fiat Uno',
      referenceMonth: '2026-05',
      originalMonthlyValue: 100,
      previousBalanceCarried: 0,
      discount: 0,
      addition: 0,
      totalAmount: 100,
      paidAmount: 0,
      remainingBalance: 100,
      dueDate: '2026-05-10',
      status: 'pendente',
      balanceHandling: 'none',
    },
    createdBy: 'admin_uid',
  });

  assert.equal(addRes.created, false);
  const current = store.getCharge('chg_veh_veh_1_2026-05')!;
  assert.equal(current.status, 'pago');
  assert.equal(current.paidAmount, 100);
  assert.equal(current.remainingBalance, 0);
  assert.equal(current.notes, 'Quitada via PIX');
});

test('Cenário 3: Uma cobrança parcial mantém o valor pago e o saldo', async () => {
  const store = new InMemoryTransactionalFirestore();

  // 3A. Cobrança parcial com ID determinístico não é sobrescrita mesmo com estado local vazio
  const partialCharge = makeCharge({
    id: 'chg_veh_veh_1_2026-05',
    status: 'parcial',
    paidAmount: 40,
    remainingBalance: 60,
    balanceHandling: 'specific_date',
    balanceScheduledDate: '2026-05-20',
  });
  store.seedCharge(partialCharge);

  const res = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [makeClient()],
    vehicles: [makeVehicle()],
    plans: [],
    charges: [],
    createdBy: 'admin_uid',
  });

  assert.equal(res.created, 0);
  const after = store.getCharge('chg_veh_veh_1_2026-05')!;
  assert.equal(after.status, 'parcial');
  assert.equal(after.paidAmount, 40);
  assert.equal(after.remainingBalance, 60);
  assert.equal(after.balanceScheduledDate, '2026-05-20');

  // 3B. Mesmo que cliente possua planId legado e já haja cobrança individual parcial no mês, ela não é cancelada nem duplicada
  const planStore = new InMemoryTransactionalFirestore();
  const individualPartial = makeCharge({
    id: 'chg_ind_legacy_1',
    status: 'parcial',
    paidAmount: 50,
    remainingBalance: 50,
    isPlanCharge: false,
  });
  planStore.seedCharge(individualPartial);

  const planRes = await executeMonthlyChargeGeneration(planStore, {
    month: '2026-05',
    clients: [makeClient({ planId: 'plan_1', planName: 'Plano Frota 2 Carros' })],
    vehicles: [makeVehicle()],
    plans: [makePlan()],
    charges: planStore.getAllCharges(),
    createdBy: 'admin_uid',
  });

  assert.equal(planRes.created, 0);
  assert.equal(planRes.skipped, 1);
  assert.equal(planRes.supersededIds.length, 0);
  const keptIndividual = planStore.getCharge('chg_ind_legacy_1')!;
  assert.equal(keptIndividual.status, 'parcial');
  assert.equal(keptIndividual.paidAmount, 50);
  assert.equal(keptIndividual.remainingBalance, 50);
});

test('Cenário 4: Duas gerações simultâneas não sobrescrevem nem duplicam a cobrança', async () => {
  const store = new InMemoryTransactionalFirestore();
  let readsDone = 0;
  let releaseBarrier!: () => void;
  const barrierPromise = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  // Força ambas as transações a lerem o estado inicial antes que qualquer uma dê commit
  store.onCommitBarrier = async () => {
    readsDone++;
    if (readsDone === 2) {
      store.onCommitBarrier = null;
      releaseBarrier();
    } else if (readsDone === 1) {
      await barrierPromise;
    }
  };

  const params = {
    month: '2026-05',
    clients: [makeClient()],
    vehicles: [makeVehicle()],
    plans: [],
    charges: [],
    createdBy: 'admin_uid',
  };

  const [r1, r2] = await Promise.all([
    executeMonthlyChargeGeneration(store, params),
    executeMonthlyChargeGeneration(store, params),
  ]);

  assert.equal(r1.created + r2.created, 1);
  assert.equal(store.getAllCharges().length, 1);
  assert.ok(store.transactionRetryCount >= 1);
});

test('Cenário 5: Dois registros simultâneos não duplicam o pagamento nem deixam saldo negativo', async () => {
  const store = new InMemoryTransactionalFirestore();
  store.seedCharge(makeCharge({ id: 'chg_conc_1', totalAmount: 100, paidAmount: 0, remainingBalance: 100 }));

  let barrierHits = 0;
  let release!: () => void;
  const waitBoth = new Promise<void>((resolve) => {
    release = resolve;
  });

  // Garante que ambos os pagamentos simultâneos leiam remainingBalance = 100 antes do commit
  store.onCommitBarrier = async () => {
    barrierHits++;
    if (barrierHits === 2) {
      store.onCommitBarrier = null;
      release();
    } else if (barrierHits === 1) {
      await waitBoth;
    }
  };

  const [res1, res2] = await Promise.allSettled([
    executeRecordPayment(store, {
      chargeId: 'chg_conc_1',
      amount: 100,
      paymentMethod: 'pix',
      operatorId: 'admin_uid',
      operatorName: 'Admin',
      operationId: 'pay_concurrent_A',
    }),
    executeRecordPayment(store, {
      chargeId: 'chg_conc_1',
      amount: 100,
      paymentMethod: 'pix',
      operatorId: 'admin_uid',
      operatorName: 'Admin',
      operationId: 'pay_concurrent_B',
    }),
  ]);

  const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
  const rejected = [res1, res2].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof FinancialValidationError);
  assert.equal(rejected[0].reason.code, 'CHARGE_ALREADY_PAID');

  const finalCharge = store.getCharge('chg_conc_1')!;
  assert.equal(finalCharge.status, 'pago');
  assert.equal(finalCharge.paidAmount, 100);
  assert.equal(finalCharge.remainingBalance, 0);
  assert.equal(store.getAllPayments().length, 1);
});

test('Cenário 6: Pagamento parcial atualiza corretamente paidAmount, remainingBalance, status e preserva originalMonthlyValue', async () => {
  const store = new InMemoryTransactionalFirestore();
  store.seedCharge(
    makeCharge({
      id: 'chg_partial_1',
      originalMonthlyValue: 120,
      previousBalanceCarried: 30,
      totalAmount: 150,
      paidAmount: 0,
      remainingBalance: 150,
    })
  );

  const result = await executeRecordPayment(store, {
    chargeId: 'chg_partial_1',
    amount: 55.45,
    paymentMethod: 'pix',
    balanceHandling: 'specific_date',
    balanceScheduledDate: '2026-05-25',
    notes: 'Primeira parcela',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_part_1',
  });

  assert.equal(result.wasReplay, false);
  assert.equal(result.isFullyPaid, false);
  assert.equal(result.newRemainingBalance, 94.55);
  assert.equal(result.payment.amount, 55.45);
  assert.equal(result.payment.remainingAfterPayment, 94.55);

  const updatedCharge = store.getCharge('chg_partial_1')!;
  assert.equal(updatedCharge.status, 'parcial');
  assert.equal(updatedCharge.paidAmount, 55.45);
  assert.equal(updatedCharge.remainingBalance, 94.55);
  assert.equal(updatedCharge.originalMonthlyValue, 120);
  assert.equal(updatedCharge.totalAmount, 150);
  assert.equal(updatedCharge.balanceHandling, 'specific_date');
  assert.equal(updatedCharge.balanceScheduledDate, '2026-05-25');
});

test('Cenário 7: Último pagamento quita corretamente (status pago, saldo zero, precisão de centavos)', async () => {
  const store = new InMemoryTransactionalFirestore();
  store.seedCharge(
    makeCharge({
      id: 'chg_settle_1',
      originalMonthlyValue: 100,
      totalAmount: 100,
      paidAmount: 0,
      remainingBalance: 100,
    })
  );

  await executeRecordPayment(store, {
    chargeId: 'chg_settle_1',
    amount: 33.33,
    paymentMethod: 'dinheiro',
    balanceHandling: 'open_negotiation',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_settle_1',
  });

  await executeRecordPayment(store, {
    chargeId: 'chg_settle_1',
    amount: 33.33,
    paymentMethod: 'pix',
    balanceHandling: 'next_month',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_settle_2',
  });

  const finalRes = await executeRecordPayment(store, {
    chargeId: 'chg_settle_1',
    amount: 33.34,
    paymentMethod: 'pix',
    balanceHandling: 'specific_date',
    balanceScheduledDate: '2026-05-30',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_settle_3',
  });

  assert.equal(finalRes.isFullyPaid, true);
  assert.equal(finalRes.newRemainingBalance, 0);
  assert.equal(finalRes.payment.remainingAfterPayment, 0);

  const charge = store.getCharge('chg_settle_1')!;
  assert.equal(charge.status, 'pago');
  assert.equal(charge.paidAmount, 100);
  assert.equal(charge.remainingBalance, 0);
  assert.equal(charge.balanceHandling, 'none');
  assert.equal(charge.balanceScheduledDate, null);
  assert.equal(store.getAllPayments().length, 3);
});

test('Cenário 8: Tentativa de pagar acima do saldo, em cobrança quitada/cancelada ou valor <= 0 é rejeitada sem alterar o banco', async () => {
  const store = new InMemoryTransactionalFirestore();
  const openCharge = makeCharge({
    id: 'chg_guard_open',
    totalAmount: 100,
    paidAmount: 40,
    remainingBalance: 60,
    status: 'parcial',
  });
  const paidCharge = makeCharge({
    id: 'chg_guard_paid',
    totalAmount: 100,
    paidAmount: 100,
    remainingBalance: 0,
    status: 'pago',
  });
  const cancelledCharge = makeCharge({
    id: 'chg_guard_cancelled',
    totalAmount: 100,
    paidAmount: 0,
    remainingBalance: 100,
    status: 'cancelado',
  });

  store.seedCharge(openCharge);
  store.seedCharge(paidCharge);
  store.seedCharge(cancelledCharge);

  // 8A. Acima do saldo no pagamento individual (60.01 > 60.00)
  await assert.rejects(
    () =>
      executeRecordPayment(store, {
        chargeId: 'chg_guard_open',
        amount: 60.01,
        paymentMethod: 'pix',
        operatorId: 'admin_uid',
        operatorName: 'Admin',
        operationId: 'pay_over_1',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'AMOUNT_EXCEEDS_BALANCE'
  );

  // 8B. Valor zero ou negativo
  await assert.rejects(
    () =>
      executeRecordPayment(store, {
        chargeId: 'chg_guard_open',
        amount: 0,
        paymentMethod: 'pix',
        operatorId: 'admin_uid',
        operatorName: 'Admin',
        operationId: 'pay_zero_1',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'INVALID_AMOUNT'
  );

  // 8C. Cobrança já quitada
  await assert.rejects(
    () =>
      executeRecordPayment(store, {
        chargeId: 'chg_guard_paid',
        amount: 10,
        paymentMethod: 'pix',
        operatorId: 'admin_uid',
        operatorName: 'Admin',
        operationId: 'pay_already_paid_1',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'CHARGE_ALREADY_PAID'
  );

  // 8D. Cobrança cancelada
  await assert.rejects(
    () =>
      executeRecordPayment(store, {
        chargeId: 'chg_guard_cancelled',
        amount: 50,
        paymentMethod: 'pix',
        operatorId: 'admin_uid',
        operatorName: 'Admin',
        operationId: 'pay_cancelled_1',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'CHARGE_CANCELLED'
  );

  // 8E. Recebimento consolidado acima do saldo ou com cobrança duplicada
  await assert.rejects(
    () =>
      executeRecordConsolidatedPayment(store, {
        clientId: 'cli_1',
        clientName: 'Carlos Silva',
        items: [{ charge: openCharge, amountToPay: 70 }],
        paymentDate: '2026-05-10',
        paymentMethod: 'pix',
        operatorId: 'admin_uid',
        operatorName: 'Admin',
        operationId: 'pay_cons_over',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'AMOUNT_EXCEEDS_BALANCE'
  );

  await assert.rejects(
    () =>
      executeRecordConsolidatedPayment(store, {
        clientId: 'cli_1',
        clientName: 'Carlos Silva',
        items: [
          { charge: openCharge, amountToPay: 30 },
          { charge: openCharge, amountToPay: 30 },
        ],
        paymentDate: '2026-05-10',
        paymentMethod: 'pix',
        operatorId: 'admin_uid',
        operatorName: 'Admin',
        operationId: 'pay_cons_dup',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'DUPLICATE_CHARGE_ITEM'
  );

  assert.equal(store.getAllPayments().length, 0);
  assert.equal(store.getCharge('chg_guard_open')!.remainingBalance, 60);
  assert.equal(store.getCharge('chg_guard_open')!.paidAmount, 40);
});

test('Cenário 9: Falha transacional realiza rollback completo sem deixar dados inconsistentes', async () => {
  const store = new InMemoryTransactionalFirestore();
  store.seedCharge(
    makeCharge({
      id: 'chg_rollback_1',
      totalAmount: 100,
      paidAmount: 0,
      remainingBalance: 100,
      status: 'pendente',
    })
  );

  store.failNextCommitError = new Error('UNAVAILABLE: simulated commit failure');

  await assert.rejects(
    () =>
      executeRecordPayment(store, {
        chargeId: 'chg_rollback_1',
        amount: 100,
        paymentMethod: 'pix',
        operatorId: 'admin_uid',
        operatorName: 'Admin',
        operationId: 'pay_rollback_1',
      }),
    /simulated commit failure/
  );

  // Nenhum Payment gravado e a Charge permanece intacta
  assert.equal(store.getAllPayments().length, 0);
  assert.equal(store.getPayment('pay_rollback_1'), undefined);
  const charge = store.getCharge('chg_rollback_1')!;
  assert.equal(charge.status, 'pendente');
  assert.equal(charge.paidAmount, 0);
  assert.equal(charge.remainingBalance, 100);
});

test('Cenário 10: Operação repetida com o mesmo operationId retorna o lançamento original sem duplicar nem abater duas vezes', async () => {
  const store = new InMemoryTransactionalFirestore();
  const c1 = makeCharge({
    id: 'chg_idem_1',
    totalAmount: 100,
    paidAmount: 0,
    remainingBalance: 100,
  });
  const c2 = makeCharge({
    id: 'chg_idem_2',
    vehicleId: 'veh_2',
    vehiclePlate: 'XYZ9K88',
    totalAmount: 80,
    paidAmount: 0,
    remainingBalance: 80,
  });
  store.seedCharge(c1);
  store.seedCharge(c2);

  // 10A. Replay sequencial no pagamento individual
  const firstSingle = await executeRecordPayment(store, {
    chargeId: 'chg_idem_1',
    amount: 40,
    paymentMethod: 'pix',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_idem_single',
    receiptNumber: 'REC-202605-1111',
  });
  assert.equal(firstSingle.wasReplay, false);

  const replaySingle = await executeRecordPayment(store, {
    chargeId: 'chg_idem_1',
    amount: 40,
    paymentMethod: 'pix',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_idem_single',
    receiptNumber: 'REC-202605-9999',
  });
  assert.equal(replaySingle.wasReplay, true);
  assert.equal(replaySingle.payment.id, firstSingle.payment.id);
  assert.equal(replaySingle.payment.receiptNumber, 'REC-202605-1111');
  assert.equal(store.getCharge('chg_idem_1')!.paidAmount, 40);
  assert.equal(store.getCharge('chg_idem_1')!.remainingBalance, 60);
  assert.equal(store.getAllPayments().length, 1);

  // 10B. Replay concorrente no pagamento consolidado com mesmo operationId
  const [consA, consB] = await Promise.all([
    executeRecordConsolidatedPayment(store, {
      clientId: 'cli_1',
      clientName: 'Carlos Silva',
      items: [
        { charge: c1, amountToPay: 60 },
        { charge: c2, amountToPay: 80 },
      ],
      paymentDate: '2026-05-10',
      paymentMethod: 'pix',
      operatorId: 'admin_uid',
      operatorName: 'Admin',
      operationId: 'pay_idem_cons',
      receiptNumber: 'REC-CONS-555555',
    }),
    executeRecordConsolidatedPayment(store, {
      clientId: 'cli_1',
      clientName: 'Carlos Silva',
      items: [
        { charge: c1, amountToPay: 60 },
        { charge: c2, amountToPay: 80 },
      ],
      paymentDate: '2026-05-10',
      paymentMethod: 'pix',
      operatorId: 'admin_uid',
      operatorName: 'Admin',
      operationId: 'pay_idem_cons',
      receiptNumber: 'REC-CONS-666666',
    }),
  ]);

  assert.equal(consA.payment.id, consB.payment.id);
  assert.equal([consA.wasReplay, consB.wasReplay].filter(Boolean).length, 1);
  assert.equal(store.getCharge('chg_idem_1')!.status, 'pago');
  assert.equal(store.getCharge('chg_idem_1')!.paidAmount, 100);
  assert.equal(store.getCharge('chg_idem_1')!.remainingBalance, 0);
  assert.equal(store.getCharge('chg_idem_2')!.status, 'pago');
  assert.equal(store.getCharge('chg_idem_2')!.paidAmount, 80);
  assert.equal(store.getCharge('chg_idem_2')!.remainingBalance, 0);
  assert.equal(store.getAllPayments().length, 2);
});

// ============================================================================
// SUÍTE ETAPA A — TRANSIÇÃO PARA MENSALIDADE INDIVIDUAL POR VEÍCULO (12 CENÁRIOS)
// ============================================================================

test('ETAPA A - 1: Cliente com múltiplos veículos ativos gera cobranças individuais e soma total mensal corretamente', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_multi', planId: 'plan_legacy', planName: 'Plano Antigo' });
  const vehicles: Vehicle[] = [
    makeVehicle({ id: 'veh_c1', clientId: 'cli_multi', vehicleType: 'carro', plate: 'CAR1001', monthlyValue: 100, dueDay: 5 }),
    makeVehicle({ id: 'veh_c2', clientId: 'cli_multi', vehicleType: 'carro', plate: 'CAR2002', monthlyValue: 100, dueDay: 10 }),
    makeVehicle({ id: 'veh_m1', clientId: 'cli_multi', vehicleType: 'moto', brand: 'Honda', model: 'CG 160', plate: 'MOT3003', monthlyValue: 50, dueDay: 15 }),
  ];

  const res = await executeMonthlyChargeGeneration(store, {
    month: '2026-06',
    clients: [client],
    vehicles,
    plans: [makePlan({ id: 'plan_legacy', totalMonthlyValue: 180 })],
    charges: [],
    createdBy: 'admin_uid',
  });

  assert.equal(res.created, 3);
  assert.equal(res.skipped, 0);
  assert.equal(res.supersededIds.length, 0);

  const generated = store.getAllCharges();
  assert.equal(generated.length, 3);
  assert.ok(generated.every((c) => !c.isPlanCharge));
  const sumTotal = generated.reduce((acc, c) => acc + c.totalAmount, 0);
  assert.equal(sumTotal, 250);

  const consolidated = consolidateClientFinancials(client, vehicles, generated);
  assert.equal(consolidated.totalMonthlyValue, 250);
  assert.equal(consolidated.totalPending, 250);
});

test('ETAPA A - 2: Cada veículo respeita seu próprio monthlyValue e dueDay (inclusive dias 29/30/31 em fevereiro)', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_due', createdAt: '2025-12-01T10:00:00.000Z' });
  const vehicles: Vehicle[] = [
    makeVehicle({ id: 'veh_d5', clientId: 'cli_due', plate: 'DIA0005', monthlyValue: 100, dueDay: 5 }),
    makeVehicle({ id: 'veh_d10', clientId: 'cli_due', plate: 'DIA0010', monthlyValue: 120.5, dueDay: 10 }),
    makeVehicle({ id: 'veh_d31', clientId: 'cli_due', plate: 'DIA0031', monthlyValue: 59.9, dueDay: 31 }),
  ];

  await executeMonthlyChargeGeneration(store, {
    month: '2026-02',
    clients: [client],
    vehicles,
    charges: [],
  });

  const c5 = store.getCharge('chg_veh_veh_d5_2026-02')!;
  const c10 = store.getCharge('chg_veh_veh_d10_2026-02')!;
  const c31 = store.getCharge('chg_veh_veh_d31_2026-02')!;

  assert.equal(c5.totalAmount, 100);
  assert.equal(c5.dueDate, '2026-02-05');
  assert.equal(c10.totalAmount, 120.5);
  assert.equal(c10.dueDate, '2026-02-10');
  assert.equal(c31.totalAmount, 59.9);
  assert.equal(c31.dueDate, '2026-02-28');
});

test('ETAPA A - 3: Veículo suspenso não gera nova cobrança e preserva cobranças e pagamentos anteriores', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_susp' });
  const priorPaidCharge = makeCharge({
    id: 'chg_veh_veh_susp_2026-04',
    clientId: 'cli_susp',
    vehicleId: 'veh_susp',
    referenceMonth: '2026-04',
    status: 'pago',
    paidAmount: 100,
    remainingBalance: 0,
    dueDate: '2026-04-10',
  });
  store.seedCharge(priorPaidCharge);

  const vehicles: Vehicle[] = [
    makeVehicle({ id: 'veh_susp', clientId: 'cli_susp', status: 'suspenso', monthlyValue: 100 }),
    makeVehicle({ id: 'veh_act', clientId: 'cli_susp', plate: 'ACT9999', status: 'ativo', monthlyValue: 80 }),
  ];

  const res = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles,
    charges: store.getAllCharges(),
  });

  assert.equal(res.created, 1);
  assert.equal(store.getCharge('chg_veh_veh_susp_2026-05'), undefined);
  assert.ok(store.getCharge('chg_veh_veh_act_2026-05'));
  assert.equal(store.getCharge('chg_veh_veh_susp_2026-04')!.status, 'pago');
  assert.equal(store.getCharge('chg_veh_veh_susp_2026-04')!.paidAmount, 100);

  const consolidated = consolidateClientFinancials(client, vehicles, store.getAllCharges());
  assert.equal(consolidated.totalMonthlyValue, 80);
});

test('ETAPA A - 4: Veículo cancelado não gera nova cobrança e preserva histórico financeiro anterior', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_canc' });
  const priorPendingCharge = makeCharge({
    id: 'chg_veh_veh_canc_2026-04',
    clientId: 'cli_canc',
    vehicleId: 'veh_canc',
    referenceMonth: '2026-04',
    status: 'parcial',
    paidAmount: 40,
    remainingBalance: 60,
    dueDate: '2026-04-10',
  });
  store.seedCharge(priorPendingCharge);

  const vehicles: Vehicle[] = [
    makeVehicle({ id: 'veh_canc', clientId: 'cli_canc', status: 'cancelado', monthlyValue: 100 }),
  ];

  const res = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles,
    charges: store.getAllCharges(),
  });

  assert.equal(res.created, 0);
  assert.equal(store.getCharge('chg_veh_veh_canc_2026-05'), undefined);
  const kept = store.getCharge('chg_veh_veh_canc_2026-04')!;
  assert.equal(kept.status, 'parcial');
  assert.equal(kept.paidAmount, 40);
  assert.equal(kept.remainingBalance, 60);
});

test('ETAPA A - 5: Veículo reativado volta a gerar mensalidades futuras sem cobrança retroativa pelos meses suspensos', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_reat' });
  const suspendedVehicle = makeVehicle({ id: 'veh_reat', clientId: 'cli_reat', status: 'suspenso', monthlyValue: 90, dueDay: 12 });

  // Durante suspensão em maio e junho, nada é gerado
  await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [suspendedVehicle],
    charges: store.getAllCharges(),
  });
  await executeMonthlyChargeGeneration(store, {
    month: '2026-06',
    clients: [client],
    vehicles: [suspendedVehicle],
    charges: store.getAllCharges(),
  });
  assert.equal(store.getAllCharges().length, 0);

  // Reativa em julho -> gera apenas julho, sem retroativos de maio/junho
  const reactivatedVehicle: Vehicle = { ...suspendedVehicle, status: 'ativo' };
  const julyRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-07',
    clients: [client],
    vehicles: [reactivatedVehicle],
    charges: store.getAllCharges(),
  });

  assert.equal(julyRes.created, 1);
  assert.equal(store.getAllCharges().length, 1);
  assert.equal(store.getCharge('chg_veh_veh_reat_2026-05'), undefined);
  assert.equal(store.getCharge('chg_veh_veh_reat_2026-06'), undefined);
  const julyCharge = store.getCharge('chg_veh_veh_reat_2026-07')!;
  assert.equal(julyCharge.totalAmount, 90);
  assert.equal(julyCharge.dueDate, '2026-07-12');
});

test('ETAPA A - 6: Primeira mensalidade gerada somente no mês seguinte ao cadastro do cliente', async () => {
  const store = new InMemoryTransactionalFirestore();
  const newClient = makeClient({ id: 'cli_novo', createdAt: '2026-05-02T14:30:00.000Z' });
  const vehicle = makeVehicle({ id: 'veh_novo', clientId: 'cli_novo', monthlyValue: 110, dueDay: 20 });

  // Mesmo mês do cadastro (2026-05) -> bloqueado (mesmo se dueDay > dia do cadastro)
  const mayRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [newClient],
    vehicles: [vehicle],
    charges: [],
  });
  assert.equal(mayRes.created, 0);
  assert.equal(mayRes.skipped, 1);
  assert.equal(store.getAllCharges().length, 0);

  // Mês seguinte ao cadastro (2026-06) -> elegível e gerado normalmente
  const juneRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-06',
    clients: [newClient],
    vehicles: [vehicle],
    charges: [],
  });
  assert.equal(juneRes.created, 1);
  assert.equal(store.getCharge('chg_veh_veh_novo_2026-06')!.dueDate, '2026-06-20');
});

test('ETAPA A - 7: Geração repetida e concorrente para múltiplos veículos é idempotente sem duplicidade nem sobrescrita', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_idem_multi' });
  const vehicles = [
    makeVehicle({ id: 'veh_mA', clientId: 'cli_idem_multi', plate: 'AAA1111', monthlyValue: 100 }),
    makeVehicle({ id: 'veh_mB', clientId: 'cli_idem_multi', plate: 'BBB2222', monthlyValue: 75 }),
  ];

  const [run1, run2] = await Promise.all([
    executeMonthlyChargeGeneration(store, { month: '2026-08', clients: [client], vehicles, charges: [] }),
    executeMonthlyChargeGeneration(store, { month: '2026-08', clients: [client], vehicles, charges: [] }),
  ]);

  assert.equal(run1.created + run2.created, 2);
  assert.equal(store.getAllCharges().length, 2);

  // Altera valor do veículo posteriormente e regera mesmo mês: não pode sobrescrever cobrança existente
  const updatedVehicles = vehicles.map((v) => ({ ...v, monthlyValue: 999 }));
  const run3 = await executeMonthlyChargeGeneration(store, {
    month: '2026-08',
    clients: [client],
    vehicles: updatedVehicles,
    charges: [],
  });

  assert.equal(run3.created, 0);
  assert.equal(store.getCharge('chg_veh_veh_mA_2026-08')!.totalAmount, 100);
  assert.equal(store.getCharge('chg_veh_veh_mB_2026-08')!.totalAmount, 75);
});

test('ETAPA A - 8: Cobranças históricas de plano (isPlanCharge) protegem veículos contra duplicidade e não são canceladas nem alteradas', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_hist_plan', planId: 'plan_1', planName: 'Plano Frota' });
  const v1 = makeVehicle({ id: 'veh_hp1', clientId: 'cli_hist_plan', plate: 'PL10001', monthlyValue: 100 });
  const v2 = makeVehicle({ id: 'veh_hp2', clientId: 'cli_hist_plan', plate: 'PL20002', monthlyValue: 100 });
  const v3 = makeVehicle({ id: 'veh_hp3', clientId: 'cli_hist_plan', plate: 'PL30003', monthlyValue: 60 });

  // 8A. Cobrança histórica de plano cobrindo v1 e v2 na competência 2026-05 (pendente/parcial)
  const legacyPlanMay = makeCharge({
    id: 'chg_plan_cli_hist_plan_plan_1_2026-05',
    clientId: 'cli_hist_plan',
    vehicleId: 'veh_hp1',
    vehicleIds: ['veh_hp1', 'veh_hp2'],
    vehiclePlate: 'PL10001, PL20002',
    vehiclePlates: ['PL10001', 'PL20002'],
    referenceMonth: '2026-05',
    originalMonthlyValue: 150,
    totalAmount: 150,
    paidAmount: 50,
    remainingBalance: 100,
    status: 'parcial',
    isPlanCharge: true,
    planId: 'plan_1',
    planName: 'Plano Frota',
    isPostponed: true,
    originalDueDate: '2026-05-10',
    dueDate: '2026-06-15',
  });
  store.seedCharge(legacyPlanMay);

  // Ao gerar 2026-05: v1 e v2 estão protegidos pelo isPlanCharge; v3 (não incluído no plano histórico) gera individual
  const mayRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [v1, v2, v3],
    plans: [makePlan()],
    charges: store.getAllCharges(),
  });

  assert.equal(mayRes.created, 1);
  assert.deepEqual(mayRes.createdIds, ['chg_veh_veh_hp3_2026-05']);
  assert.equal(mayRes.skipped, 2);
  assert.equal(mayRes.supersededIds.length, 0);

  // Ao gerar 2026-06: adiamento aberto da cobrança histórica de plano (2026-05 -> 2026-06-15) também bloqueia duplicidade em v1 e v2
  const juneRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-06',
    clients: [client],
    vehicles: [v1, v2, v3],
    plans: [makePlan()],
    charges: store.getAllCharges(),
  });
  assert.equal(juneRes.created, 1);
  assert.deepEqual(juneRes.createdIds, ['chg_veh_veh_hp3_2026-06']);

  // Histórico da cobrança de plano permanece intacto
  const planChargeAfter = store.getCharge('chg_plan_cli_hist_plan_plan_1_2026-05')!;
  assert.equal(planChargeAfter.status, 'parcial');
  assert.equal(planChargeAfter.paidAmount, 50);
  assert.equal(planChargeAfter.remainingBalance, 100);
  assert.equal(planChargeAfter.isPlanCharge, true);
});

test('ETAPA A - 9: Cobranças pagas, parciais e pendentes existentes permanecem intactas após nova geração', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_preserve' });
  const vPaid = makeVehicle({ id: 'veh_p1', clientId: 'cli_preserve', plate: 'AAA0001', monthlyValue: 100 });
  const vPartial = makeVehicle({ id: 'veh_p2', clientId: 'cli_preserve', plate: 'BBB0002', monthlyValue: 120 });
  const vPending = makeVehicle({ id: 'veh_p3', clientId: 'cli_preserve', plate: 'CCC0003', monthlyValue: 80 });

  store.seedCharge(makeCharge({ id: 'chg_veh_veh_p1_2026-05', clientId: 'cli_preserve', vehicleId: 'veh_p1', vehiclePlate: 'AAA0001', totalAmount: 100, paidAmount: 100, remainingBalance: 0, status: 'pago', notes: 'Pago total' }));
  store.seedCharge(makeCharge({ id: 'chg_manual_partial', clientId: 'cli_preserve', vehicleId: 'veh_p2', vehiclePlate: 'BBB0002', totalAmount: 120, paidAmount: 30, remainingBalance: 90, status: 'parcial', notes: 'Entrada' }));
  store.seedCharge(makeCharge({ id: 'chg_manual_pending', clientId: 'cli_preserve', vehicleId: 'veh_p3', vehiclePlate: 'CCC0003', totalAmount: 80, paidAmount: 0, remainingBalance: 80, status: 'pendente', notes: 'Aguardando' }));

  const res = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [vPaid, vPartial, vPending],
    charges: store.getAllCharges(),
  });

  assert.equal(res.created, 0);
  assert.equal(res.skipped, 3);
  assert.equal(store.getAllCharges().length, 3);
  assert.equal(store.getCharge('chg_veh_veh_p1_2026-05')!.status, 'pago');
  assert.equal(store.getCharge('chg_manual_partial')!.remainingBalance, 90);
  assert.equal(store.getCharge('chg_manual_pending')!.status, 'pendente');
});

test('ETAPA A - 10: Pagamentos consolidados sobre cobranças individuais mantêm itens, saldos e vínculos preservados', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_cons_ind' });
  const vehicles = [
    makeVehicle({ id: 'veh_ci1', clientId: 'cli_cons_ind', plate: 'CAR1111', monthlyValue: 100, dueDay: 5 }),
    makeVehicle({ id: 'veh_ci2', clientId: 'cli_cons_ind', plate: 'CAR2222', monthlyValue: 100, dueDay: 10 }),
    makeVehicle({ id: 'veh_ci3', clientId: 'cli_cons_ind', plate: 'MOT3333', monthlyValue: 50, dueDay: 15 }),
  ];

  await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles,
    charges: [],
  });

  const c1 = store.getCharge('chg_veh_veh_ci1_2026-05')!;
  const c2 = store.getCharge('chg_veh_veh_ci2_2026-05')!;
  const c3 = store.getCharge('chg_veh_veh_ci3_2026-05')!;

  const consRes = await executeRecordConsolidatedPayment(store, {
    clientId: client.id,
    clientName: client.name,
    items: [
      { charge: c1, amountToPay: 100 },
      { charge: c2, amountToPay: 60 },
      { charge: c3, amountToPay: 50 },
    ],
    paymentDate: '2026-05-10',
    paymentMethod: 'pix',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_cons_etapa_a',
  });

  assert.equal(consRes.wasReplay, false);
  assert.equal(consRes.payment.amount, 210);
  assert.equal(consRes.payment.isConsolidated, true);
  assert.equal(consRes.payment.consolidatedItems?.length, 3);
  assert.equal(consRes.payment.remainingAfterPayment, 40);

  assert.equal(store.getCharge(c1.id)!.status, 'pago');
  assert.equal(store.getCharge(c2.id)!.status, 'parcial');
  assert.equal(store.getCharge(c2.id)!.remainingBalance, 40);
  assert.equal(store.getCharge(c3.id)!.status, 'pago');

  // Nova geração na mesma competência não recria nem altera os vínculos pagos/parciais
  const regen = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles,
    charges: store.getAllCharges(),
  });
  assert.equal(regen.created, 0);
  assert.equal(store.getPayment('pay_cons_etapa_a')!.consolidatedItems?.length, 3);
});

test('ETAPA A - 11: Falha durante a geração em lote realiza rollback completo sem documentos parcialmente gravados', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_fail' });
  const vehicles = [
    makeVehicle({ id: 'veh_f1', clientId: 'cli_fail', plate: 'FAL0001', monthlyValue: 100 }),
    makeVehicle({ id: 'veh_f2', clientId: 'cli_fail', plate: 'FAL0002', monthlyValue: 150 }),
    makeVehicle({ id: 'veh_f3', clientId: 'cli_fail', plate: 'FAL0003', monthlyValue: 50 }),
  ];

  store.failNextCommitError = new Error('DEADLINE_EXCEEDED: falha simulada no commit da geração');

  await assert.rejects(
    () =>
      executeMonthlyChargeGeneration(store, {
        month: '2026-09',
        clients: [client],
        vehicles,
        charges: [],
      }),
    /falha simulada no commit/
  );

  // Nenhum dos 3 veículos pode ter ficado parcialmente gravado
  assert.equal(store.getAllCharges().length, 0);
});

test('ETAPA A - 12: Valores financeiros são tratados com precisão em centavos sem erro de ponto flutuante', async () => {
  assert.equal(roundCurrency(0.1 + 0.2), 0.3);
  assert.equal(roundCurrencyValue(33.33 + 33.33 + 33.34), 100);

  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_cents' });
  const vehicles = [
    makeVehicle({ id: 'veh_c_01', clientId: 'cli_cents', plate: 'CNT0001', monthlyValue: 33.33, dueDay: 5 }),
    makeVehicle({ id: 'veh_c_02', clientId: 'cli_cents', plate: 'CNT0002', monthlyValue: 33.33, dueDay: 10 }),
    makeVehicle({ id: 'veh_c_03', clientId: 'cli_cents', plate: 'CNT0003', monthlyValue: 33.34, dueDay: 15 }),
  ];

  // Inclui saldo transportado com dízima binária em 1 dos veículos (19.99 + 0.01 = 20.00)
  store.seedCharge(
    makeCharge({
      id: 'chg_prev_cents',
      clientId: 'cli_cents',
      vehicleId: 'veh_c_01',
      referenceMonth: '2026-04',
      totalAmount: 33.33,
      paidAmount: 13.34,
      remainingBalance: 19.99,
      status: 'parcial',
      balanceHandling: 'next_month',
      dueDate: '2026-04-05',
    })
  );

  const planned = planMonthlyCharges({
    month: '2026-05',
    clients: [client],
    vehicles,
    charges: store.getAllCharges(),
  });
  assert.equal(planned.chargesToCreate[0].data.totalAmount, 53.32);

  await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles,
    charges: store.getAllCharges(),
  });

  const c1 = store.getCharge('chg_veh_veh_c_01_2026-05')!;
  const c2 = store.getCharge('chg_veh_veh_c_02_2026-05')!;
  const c3 = store.getCharge('chg_veh_veh_c_03_2026-05')!;
  assert.equal(c1.totalAmount, 53.32);
  assert.equal(c2.totalAmount, 33.33);
  assert.equal(c3.totalAmount, 33.34);

  const consolidated = consolidateClientFinancials(client, vehicles, store.getAllCharges());
  assert.equal(consolidated.totalMonthlyValue, 100);
  // Etapa A2: R$ 19,99 de abril foi incorporado em c1 (R$ 53,32) e marcado como consumido na origem,
  // eliminando dupla contagem (saldo real em aberto = 53,32 + 33,33 + 33,34 = 119,99).
  assert.equal(consolidated.totalPending, 119.99);
  const srcApril = store.getCharge('chg_prev_cents')!;
  assert.equal(srcApril.carriedBalanceConsumed, true);
  assert.equal(srcApril.carriedToChargeId, c1.id);
  assert.equal(srcApril.carriedBalanceAmount, 19.99);
  assert.equal(srcApril.remainingBalance, 19.99);
  assert.deepEqual(c1.carriedFromChargeIds, ['chg_prev_cents']);
});

// ============================================================================
// SUÍTE ETAPA A2 — CORREÇÃO DOS DOIS ACHADOS DE GRAVIDADE ALTA (12 CENÁRIOS)
// ============================================================================

test('ETAPA A2 - 1: Plano antigo cobre dois veículos (A e B) e não oculta a cobrança individual do terceiro (C)', () => {
  const planChargeAB = makeCharge({
    id: 'chg_plan_ab_2026-05',
    clientId: 'cli_a2_1',
    vehicleId: 'veh_A',
    vehicleIds: ['veh_A', 'veh_B'],
    vehiclePlate: 'AAA1111, BBB2222',
    vehiclePlates: ['AAA1111', 'BBB2222'],
    referenceMonth: '2026-05',
    originalMonthlyValue: 150,
    totalAmount: 150,
    paidAmount: 0,
    remainingBalance: 150,
    status: 'pendente',
    isPlanCharge: true,
    planId: 'plan_ab',
    planName: 'Plano 2 Carros',
  });

  const individualC = makeCharge({
    id: 'chg_veh_veh_C_2026-05',
    clientId: 'cli_a2_1',
    vehicleId: 'veh_C',
    vehiclePlate: 'CCC3333',
    referenceMonth: '2026-05',
    originalMonthlyValue: 80,
    totalAmount: 80,
    paidAmount: 0,
    remainingBalance: 80,
    status: 'pendente',
    isPlanCharge: false,
  });

  const effective = getEffectiveCharges([planChargeAB, individualC]);
  assert.equal(effective.length, 2);
  assert.ok(effective.some((c) => c.id === 'chg_plan_ab_2026-05'));
  assert.ok(effective.some((c) => c.id === 'chg_veh_veh_C_2026-05'));

  // Também valida quando a cobertura legada do plano está registrada apenas via vehiclePlate (CSV) sem vehicleIds
  const planChargePlatesOnly = makeCharge({
    ...planChargeAB,
    id: 'chg_plan_plates_2026-05',
    vehicleId: 'plan_legacy_holder',
    vehicleIds: undefined,
    vehiclePlates: undefined,
    vehiclePlate: 'AAA1111, BBB2222',
  });
  const effectivePlates = getEffectiveCharges([planChargePlatesOnly, individualC]);
  assert.equal(effectivePlates.length, 2);
  assert.ok(effectivePlates.some((c) => c.id === 'chg_veh_veh_C_2026-05'));

  // Indicadores financeiros dependentes de getEffectiveCharges refletem corretamente R$ 150 + R$ 80 = R$ 230
  const client = makeClient({ id: 'cli_a2_1' });
  const vehicles = [
    makeVehicle({ id: 'veh_A', clientId: 'cli_a2_1', plate: 'AAA1111', monthlyValue: 75 }),
    makeVehicle({ id: 'veh_B', clientId: 'cli_a2_1', plate: 'BBB2222', monthlyValue: 75 }),
    makeVehicle({ id: 'veh_C', clientId: 'cli_a2_1', plate: 'CCC3333', monthlyValue: 80 }),
  ];
  const consolidated = consolidateClientFinancials(client, vehicles, [planChargeAB, individualC]);
  assert.equal(consolidated.totalPending, 230);
  const dashboard = calculateDashboardMetrics([client], vehicles, [planChargeAB, individualC], []);
  assert.equal(dashboard.totalPendingBalance, 230);
});

test('ETAPA A2 - 2: Plano antigo cobre efetivamente um veículo e impede duplicidade para esse veículo', () => {
  const planChargeAB = makeCharge({
    id: 'chg_plan_cov_2026-05',
    clientId: 'cli_a2_2',
    vehicleId: 'veh_A',
    vehicleIds: ['veh_A', 'veh_B'],
    vehiclePlate: 'AAA1111, BBB2222',
    vehiclePlates: ['AAA1111', 'BBB2222'],
    referenceMonth: '2026-05',
    totalAmount: 150,
    remainingBalance: 150,
    status: 'pendente',
    isPlanCharge: true,
  });

  const dupA = makeCharge({
    id: 'chg_veh_veh_A_2026-05',
    clientId: 'cli_a2_2',
    vehicleId: 'veh_A',
    vehiclePlate: 'AAA1111',
    referenceMonth: '2026-05',
    totalAmount: 80,
    paidAmount: 0,
    remainingBalance: 80,
    status: 'pendente',
    isPlanCharge: false,
  });

  const dupBByPlate = makeCharge({
    id: 'chg_veh_veh_B_legacy_2026-05',
    clientId: 'cli_a2_2',
    vehicleId: 'veh_B_legacy_id',
    vehiclePlate: 'bbb2222',
    referenceMonth: '2026-05',
    totalAmount: 80,
    paidAmount: 0,
    remainingBalance: 80,
    status: 'pendente',
    isPlanCharge: false,
  });

  const uncoveredC = makeCharge({
    id: 'chg_veh_veh_C_2026-05',
    clientId: 'cli_a2_2',
    vehicleId: 'veh_C',
    vehiclePlate: 'CCC3333',
    referenceMonth: '2026-05',
    totalAmount: 60,
    paidAmount: 0,
    remainingBalance: 60,
    status: 'pendente',
    isPlanCharge: false,
  });

  const effective = getEffectiveCharges([planChargeAB, dupA, dupBByPlate, uncoveredC]);
  assert.deepEqual(
    effective.map((c) => c.id),
    ['chg_plan_cov_2026-05', 'chg_veh_veh_C_2026-05']
  );

  // Fallback conservador: plano legado sem vehicleIds nem vehiclePlates/vehiclePlate continua protegendo contra duplicidade
  const legacyNoListPlan = makeCharge({
    id: 'chg_plan_nolist_2026-05',
    clientId: 'cli_a2_2',
    vehicleId: 'plan_generic',
    vehicleIds: undefined,
    vehiclePlates: undefined,
    vehiclePlate: '',
    referenceMonth: '2026-05',
    isPlanCharge: true,
    status: 'pendente',
  });
  const effectiveLegacy = getEffectiveCharges([legacyNoListPlan, uncoveredC]);
  assert.deepEqual(
    effectiveLegacy.map((c) => c.id),
    ['chg_plan_nolist_2026-05']
  );

  // Plano cancelado NÃO oculta cobrança individual
  const cancelledPlan = makeCharge({ ...planChargeAB, status: 'cancelado' });
  const effectiveWithCancelled = getEffectiveCharges([cancelledPlan, dupA]);
  assert.equal(effectiveWithCancelled.length, 2);
});

test('ETAPA A2 - 3: Cobranças individuais de competências diferentes não são ocultadas', () => {
  const planMay = makeCharge({
    id: 'chg_plan_may',
    clientId: 'cli_a2_3',
    vehicleId: 'veh_A',
    vehicleIds: ['veh_A', 'veh_B'],
    vehiclePlate: 'AAA1111, BBB2222',
    vehiclePlates: ['AAA1111', 'BBB2222'],
    referenceMonth: '2026-05',
    status: 'pendente',
    isPlanCharge: true,
  });

  const indJuneA = makeCharge({
    id: 'chg_veh_veh_A_2026-06',
    clientId: 'cli_a2_3',
    vehicleId: 'veh_A',
    vehiclePlate: 'AAA1111',
    referenceMonth: '2026-06',
    status: 'pendente',
    paidAmount: 0,
    isPlanCharge: false,
  });

  const indAprilB = makeCharge({
    id: 'chg_veh_veh_B_2026-04',
    clientId: 'cli_a2_3',
    vehicleId: 'veh_B',
    vehiclePlate: 'BBB2222',
    referenceMonth: '2026-04',
    status: 'pendente',
    paidAmount: 0,
    isPlanCharge: false,
  });

  const effective = getEffectiveCharges([planMay, indJuneA, indAprilB]);
  assert.equal(effective.length, 3);
  assert.ok(effective.some((c) => c.id === 'chg_veh_veh_A_2026-06'));
  assert.ok(effective.some((c) => c.id === 'chg_veh_veh_B_2026-04'));
});

test('ETAPA A2 - 4: Cobranças parciais, pagas e adiadas continuam visíveis mesmo com plano na mesma competência', () => {
  const planMay = makeCharge({
    id: 'chg_plan_vis_2026-05',
    clientId: 'cli_a2_4',
    vehicleId: 'veh_A',
    vehicleIds: ['veh_A', 'veh_B', 'veh_C'],
    vehiclePlate: 'AAA1111, BBB2222, CCC3333',
    vehiclePlates: ['AAA1111', 'BBB2222', 'CCC3333'],
    referenceMonth: '2026-05',
    status: 'pendente',
    isPlanCharge: true,
  });

  const partialA = makeCharge({
    id: 'chg_ind_partial_A',
    clientId: 'cli_a2_4',
    vehicleId: 'veh_A',
    vehiclePlate: 'AAA1111',
    referenceMonth: '2026-05',
    status: 'parcial',
    paidAmount: 40,
    remainingBalance: 60,
    isPlanCharge: false,
  });

  const paidB = makeCharge({
    id: 'chg_ind_paid_B',
    clientId: 'cli_a2_4',
    vehicleId: 'veh_B',
    vehiclePlate: 'BBB2222',
    referenceMonth: '2026-05',
    status: 'pago',
    paidAmount: 100,
    remainingBalance: 0,
    isPlanCharge: false,
  });

  const postponedC = makeCharge({
    id: 'chg_ind_postponed_C',
    clientId: 'cli_a2_4',
    vehicleId: 'veh_C',
    vehiclePlate: 'CCC3333',
    referenceMonth: '2026-05',
    status: 'pendente',
    paidAmount: 0,
    remainingBalance: 100,
    isPostponed: true,
    originalDueDate: '2026-05-10',
    dueDate: '2026-05-25',
    isPlanCharge: false,
  });

  const effective = getEffectiveCharges([planMay, partialA, paidB, postponedC]);
  assert.equal(effective.length, 4);
  assert.ok(effective.some((c) => c.id === 'chg_ind_partial_A'));
  assert.ok(effective.some((c) => c.id === 'chg_ind_paid_B'));
  assert.ok(effective.some((c) => c.id === 'chg_ind_postponed_C'));
});

test('ETAPA A2 - 5: Saldo parcial é transportado uma única vez com rastreabilidade explícita, preservação histórica e sem dupla contagem', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_a2_5' });
  const vCarry = makeVehicle({ id: 'veh_carry', clientId: 'cli_a2_5', plate: 'CAR0001', monthlyValue: 100, dueDay: 10 });
  const vSpecDate = makeVehicle({ id: 'veh_spec', clientId: 'cli_a2_5', plate: 'SPC0002', monthlyValue: 90, dueDay: 12 });
  const vNegot = makeVehicle({ id: 'veh_neg', clientId: 'cli_a2_5', plate: 'NEG0003', monthlyValue: 80, dueDay: 15 });

  // Origem com next_month -> deve transportar R$ 60,00
  store.seedCharge(
    makeCharge({
      id: 'chg_src_carry_apr',
      clientId: 'cli_a2_5',
      vehicleId: 'veh_carry',
      vehiclePlate: 'CAR0001',
      referenceMonth: '2026-04',
      originalMonthlyValue: 100,
      totalAmount: 100,
      paidAmount: 40,
      remainingBalance: 60,
      status: 'parcial',
      balanceHandling: 'next_month',
      dueDate: '2026-04-10',
    })
  );

  // Origem com specific_date -> NÃO deve transportar automaticamente
  store.seedCharge(
    makeCharge({
      id: 'chg_src_spec_apr',
      clientId: 'cli_a2_5',
      vehicleId: 'veh_spec',
      vehiclePlate: 'SPC0002',
      referenceMonth: '2026-04',
      originalMonthlyValue: 90,
      totalAmount: 90,
      paidAmount: 30,
      remainingBalance: 60,
      status: 'parcial',
      balanceHandling: 'specific_date',
      balanceScheduledDate: '2026-04-28',
      dueDate: '2026-04-12',
    })
  );

  // Origem com open_negotiation -> NÃO deve transportar automaticamente
  store.seedCharge(
    makeCharge({
      id: 'chg_src_neg_apr',
      clientId: 'cli_a2_5',
      vehicleId: 'veh_neg',
      vehiclePlate: 'NEG0003',
      referenceMonth: '2026-04',
      originalMonthlyValue: 80,
      totalAmount: 80,
      paidAmount: 20,
      remainingBalance: 60,
      status: 'parcial',
      balanceHandling: 'open_negotiation',
      dueDate: '2026-04-15',
    })
  );

  const res = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [vCarry, vSpecDate, vNegot],
    charges: store.getAllCharges(),
    createdBy: 'admin_uid',
    now: '2026-05-01T10:00:00.000Z',
  });

  assert.equal(res.created, 3);
  assert.deepEqual(res.carriedSourceIds, ['chg_src_carry_apr']);

  // Destino recebe exatamente R$ 60,00 e mantém vínculo explícito com a origem
  const destCarry = store.getCharge('chg_veh_veh_carry_2026-05')!;
  assert.equal(destCarry.originalMonthlyValue, 100);
  assert.equal(destCarry.previousBalanceCarried, 60);
  assert.equal(destCarry.totalAmount, 160);
  assert.equal(destCarry.remainingBalance, 160);
  assert.deepEqual(destCarry.carriedFromChargeIds, ['chg_src_carry_apr']);
  assert.deepEqual(destCarry.carriedBalanceSources, [
    { sourceChargeId: 'chg_src_carry_apr', sourceReferenceMonth: '2026-04', amount: 60 },
  ]);

  // Origem é marcada como consumida com vínculo explícito ao destino, preservando histórico intacto
  const srcCarry = store.getCharge('chg_src_carry_apr')!;
  assert.equal(srcCarry.carriedBalanceConsumed, true);
  assert.equal(srcCarry.carriedToChargeId, 'chg_veh_veh_carry_2026-05');
  assert.equal(srcCarry.carriedToReferenceMonth, '2026-05');
  assert.equal(srcCarry.carriedBalanceAmount, 60);
  assert.equal(srcCarry.carriedBalanceAt, '2026-05-01T10:00:00.000Z');
  assert.equal(srcCarry.originalMonthlyValue, 100);
  assert.equal(srcCarry.paidAmount, 40);
  assert.equal(srcCarry.remainingBalance, 60);
  assert.equal(srcCarry.status, 'parcial');
  assert.equal(getChargeEffectiveOpenBalance(srcCarry), 0);

  // specific_date e open_negotiation permanecem preservados sem transporte automático
  const destSpec = store.getCharge('chg_veh_veh_spec_2026-05')!;
  const destNeg = store.getCharge('chg_veh_veh_neg_2026-05')!;
  assert.equal(destSpec.previousBalanceCarried, 0);
  assert.equal(destSpec.totalAmount, 90);
  assert.equal(destNeg.previousBalanceCarried, 0);
  assert.equal(destNeg.totalAmount, 80);
  assert.equal(store.getCharge('chg_src_spec_apr')!.carriedBalanceConsumed, undefined);
  assert.equal(store.getCharge('chg_src_neg_apr')!.carriedBalanceConsumed, undefined);

  // Sem dupla contagem: saldo total em aberto = 160 (vCarry) + 60+90 (vSpec) + 60+80 (vNeg) = 450
  const consolidated = consolidateClientFinancials(client, [vCarry, vSpecDate, vNegot], store.getAllCharges());
  assert.equal(consolidated.totalPending, 450);
  const metrics = calculateDashboardMetrics([client], [vCarry, vSpecDate, vNegot], store.getAllCharges(), []);
  assert.equal(metrics.totalPendingBalance, 450);
});

test('ETAPA A2 - 6: Repetir a geração mensal na mesma competência não transporta novamente o mesmo saldo', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_a2_6' });
  const vehicle = makeVehicle({ id: 'veh_a2_6', clientId: 'cli_a2_6', monthlyValue: 100 });
  const aprilCharge = makeCharge({
    id: 'chg_apr_a2_6',
    clientId: 'cli_a2_6',
    vehicleId: 'veh_a2_6',
    referenceMonth: '2026-04',
    totalAmount: 100,
    paidAmount: 25,
    remainingBalance: 75,
    status: 'parcial',
    balanceHandling: 'next_month',
    dueDate: '2026-04-10',
  });
  store.seedCharge(aprilCharge);

  const run1 = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [vehicle],
    charges: store.getAllCharges(),
  });
  assert.equal(run1.created, 1);
  assert.deepEqual(run1.carriedSourceIds, ['chg_apr_a2_6']);

  // Repetição com estado sincronizado
  const run2 = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [vehicle],
    charges: store.getAllCharges(),
  });
  assert.equal(run2.created, 0);
  assert.equal(run2.skipped, 1);
  assert.equal(run2.carriedSourceIds.length, 0);

  // Repetição com cache local defasado (passando a origem ainda sem flag de consumo)
  const run3Stale = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [vehicle],
    charges: [aprilCharge],
  });
  assert.equal(run3Stale.created, 0);
  assert.equal(run3Stale.skipped, 1);
  assert.equal(run3Stale.carriedSourceIds.length, 0);

  assert.equal(store.getAllCharges().length, 2);
  assert.equal(store.getCharge('chg_veh_veh_a2_6_2026-05')!.totalAmount, 175);
});

test('ETAPA A2 - 7: Gerar duas competências consecutivas não duplica o saldo original', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_a2_7' });
  const vehicle = makeVehicle({ id: 'veh_a2_7', clientId: 'cli_a2_7', monthlyValue: 100 });
  const aprilCharge = makeCharge({
    id: 'chg_apr_a2_7',
    clientId: 'cli_a2_7',
    vehicleId: 'veh_a2_7',
    referenceMonth: '2026-04',
    totalAmount: 100,
    paidAmount: 45,
    remainingBalance: 55,
    status: 'parcial',
    balanceHandling: 'next_month',
    dueDate: '2026-04-10',
  });
  store.seedCharge(aprilCharge);

  // Competência 1: Maio recebe os R$ 55,00
  const mayRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [vehicle],
    charges: store.getAllCharges(),
  });
  assert.equal(mayRes.created, 1);
  assert.equal(store.getCharge('chg_veh_veh_a2_7_2026-05')!.previousBalanceCarried, 55);
  assert.equal(store.getCharge('chg_veh_veh_a2_7_2026-05')!.totalAmount, 155);

  // Competência 2: Junho NÃO pode transportar os R$ 55,00 de abril novamente (nem mesmo com cache defasado!)
  const juneRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-06',
    clients: [client],
    vehicles: [vehicle],
    charges: [aprilCharge], // simula snapshot desatualizado onde abril ainda parecia não consumido
  });
  assert.equal(juneRes.created, 1);
  assert.equal(juneRes.carriedSourceIds.length, 0);

  const juneCharge = store.getCharge('chg_veh_veh_a2_7_2026-06')!;
  assert.equal(juneCharge.previousBalanceCarried, 0);
  assert.equal(juneCharge.totalAmount, 100);
  assert.equal(juneCharge.carriedFromChargeIds, undefined);

  // Competência 3: Julho também não re-transporta abril
  const julyRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-07',
    clients: [client],
    vehicles: [vehicle],
    charges: store.getAllCharges(),
  });
  assert.equal(julyRes.created, 1);
  assert.equal(store.getCharge('chg_veh_veh_a2_7_2026-07')!.previousBalanceCarried, 0);
  assert.equal(store.getCharge('chg_veh_veh_a2_7_2026-07')!.totalAmount, 100);

  // Origem continua apontando exclusivamente para Maio
  assert.equal(store.getCharge('chg_apr_a2_7')!.carriedToChargeId, 'chg_veh_veh_a2_7_2026-05');
  assert.equal(
    consolidateClientFinancials(client, [vehicle], store.getAllCharges()).totalPending,
    355 // 155 (mai) + 100 (jun) + 100 (jul), zero dupla contagem de abril
  );
});

test('ETAPA A2 - 8: Duas operações concorrentes não transportam o mesmo saldo duas vezes', async () => {
  // 8A. Concorrência na mesma competência (2026-05)
  const storeSame = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_a2_8' });
  const vehicle = makeVehicle({ id: 'veh_a2_8', clientId: 'cli_a2_8', monthlyValue: 100 });
  const aprilCharge = makeCharge({
    id: 'chg_apr_a2_8',
    clientId: 'cli_a2_8',
    vehicleId: 'veh_a2_8',
    referenceMonth: '2026-04',
    totalAmount: 100,
    paidAmount: 30,
    remainingBalance: 70,
    status: 'parcial',
    balanceHandling: 'next_month',
    dueDate: '2026-04-10',
  });
  storeSame.seedCharge(aprilCharge);

  let hitsSame = 0;
  let releaseSame!: () => void;
  const barrierSame = new Promise<void>((resolve) => {
    releaseSame = resolve;
  });
  storeSame.onCommitBarrier = async () => {
    hitsSame++;
    if (hitsSame === 2) {
      storeSame.onCommitBarrier = null;
      releaseSame();
    } else if (hitsSame === 1) {
      await barrierSame;
    }
  };

  const [same1, same2] = await Promise.all([
    executeMonthlyChargeGeneration(storeSame, {
      month: '2026-05',
      clients: [client],
      vehicles: [vehicle],
      charges: [aprilCharge],
    }),
    executeMonthlyChargeGeneration(storeSame, {
      month: '2026-05',
      clients: [client],
      vehicles: [vehicle],
      charges: [aprilCharge],
    }),
  ]);

  assert.equal(same1.created + same2.created, 1);
  assert.equal(same1.carriedSourceIds.length + same2.carriedSourceIds.length, 1);
  assert.equal(storeSame.getCharge('chg_veh_veh_a2_8_2026-05')!.previousBalanceCarried, 70);
  assert.equal(storeSame.getCharge('chg_apr_a2_8')!.carriedBalanceConsumed, true);

  // 8B. Concorrência entre duas competências diferentes (2026-05 e 2026-06) partindo do mesmo snapshot inicial!
  const storeDiff = new InMemoryTransactionalFirestore();
  storeDiff.seedCharge(aprilCharge);

  let hitsDiff = 0;
  let releaseDiff!: () => void;
  const barrierDiff = new Promise<void>((resolve) => {
    releaseDiff = resolve;
  });
  storeDiff.onCommitBarrier = async () => {
    hitsDiff++;
    if (hitsDiff === 2) {
      storeDiff.onCommitBarrier = null;
      releaseDiff();
    } else if (hitsDiff === 1) {
      await barrierDiff;
    }
  };

  const [resMay, resJune] = await Promise.all([
    executeMonthlyChargeGeneration(storeDiff, {
      month: '2026-05',
      clients: [client],
      vehicles: [vehicle],
      charges: [aprilCharge],
    }),
    executeMonthlyChargeGeneration(storeDiff, {
      month: '2026-06',
      clients: [client],
      vehicles: [vehicle],
      charges: [aprilCharge],
    }),
  ]);

  assert.equal(resMay.created, 1);
  assert.equal(resJune.created, 1);
  assert.equal(resMay.carriedSourceIds.length + resJune.carriedSourceIds.length, 1);
  assert.ok(storeDiff.transactionRetryCount >= 1);

  const mayCharge = storeDiff.getCharge('chg_veh_veh_a2_8_2026-05')!;
  const juneCharge = storeDiff.getCharge('chg_veh_veh_a2_8_2026-06')!;
  const totalCarriedAcrossBoth = roundCurrency(
    mayCharge.previousBalanceCarried + juneCharge.previousBalanceCarried
  );
  assert.equal(totalCarriedAcrossBoth, 70);

  const srcAfter = storeDiff.getCharge('chg_apr_a2_8')!;
  assert.equal(srcAfter.carriedBalanceConsumed, true);
  assert.equal(srcAfter.carriedBalanceAmount, 70);
  assert.ok(
    srcAfter.carriedToChargeId === mayCharge.id || srcAfter.carriedToChargeId === juneCharge.id
  );
});

test('ETAPA A2 - 9: Falha durante a transação não deixa origem consumida sem destino', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_a2_9' });
  const vehicle = makeVehicle({ id: 'veh_a2_9', clientId: 'cli_a2_9', monthlyValue: 100 });
  store.seedCharge(
    makeCharge({
      id: 'chg_apr_a2_9',
      clientId: 'cli_a2_9',
      vehicleId: 'veh_a2_9',
      referenceMonth: '2026-04',
      totalAmount: 100,
      paidAmount: 20,
      remainingBalance: 80,
      status: 'parcial',
      balanceHandling: 'next_month',
      dueDate: '2026-04-10',
    })
  );

  store.failNextCommitError = new Error('UNAVAILABLE: falha simulada durante transporte de saldo');

  await assert.rejects(
    () =>
      executeMonthlyChargeGeneration(store, {
        month: '2026-05',
        clients: [client],
        vehicles: [vehicle],
        charges: store.getAllCharges(),
      }),
    /falha simulada durante transporte/
  );

  // Rollback completo: destino NÃO existe e origem continua intacta e NÃO consumida
  assert.equal(store.getCharge('chg_veh_veh_a2_9_2026-05'), undefined);
  const srcAfterFail = store.getCharge('chg_apr_a2_9')!;
  assert.equal(srcAfterFail.carriedBalanceConsumed, undefined);
  assert.equal(srcAfterFail.carriedToChargeId, undefined);
  assert.equal(srcAfterFail.carriedBalanceAmount, undefined);
  assert.equal(srcAfterFail.remainingBalance, 80);
  assert.equal(getChargeEffectiveOpenBalance(srcAfterFail), 80);
});

test('ETAPA A2 - 10: Falha seguida de nova tentativa não perde nem duplica o transporte', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_a2_10' });
  const vehicle = makeVehicle({ id: 'veh_a2_10', clientId: 'cli_a2_10', monthlyValue: 100 });
  store.seedCharge(
    makeCharge({
      id: 'chg_apr_a2_10',
      clientId: 'cli_a2_10',
      vehicleId: 'veh_a2_10',
      referenceMonth: '2026-04',
      totalAmount: 100,
      paidAmount: 65,
      remainingBalance: 35,
      status: 'parcial',
      balanceHandling: 'next_month',
      dueDate: '2026-04-10',
    })
  );

  // Tentativa 1 falha no commit
  store.failNextCommitError = new Error('DEADLINE_EXCEEDED: erro temporário');
  await assert.rejects(
    () =>
      executeMonthlyChargeGeneration(store, {
        month: '2026-05',
        clients: [client],
        vehicles: [vehicle],
        charges: store.getAllCharges(),
      }),
    /erro temporário/
  );
  assert.equal(store.getCharge('chg_veh_veh_a2_10_2026-05'), undefined);
  assert.equal(store.getCharge('chg_apr_a2_10')!.carriedBalanceConsumed, undefined);

  // Tentativa 2 (retomada) sucede atomicamente
  const retryRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [vehicle],
    charges: store.getAllCharges(),
  });
  assert.equal(retryRes.created, 1);
  assert.deepEqual(retryRes.carriedSourceIds, ['chg_apr_a2_10']);
  assert.equal(store.getCharge('chg_veh_veh_a2_10_2026-05')!.totalAmount, 135);
  assert.equal(store.getCharge('chg_apr_a2_10')!.carriedBalanceConsumed, true);
  assert.equal(store.getCharge('chg_apr_a2_10')!.carriedToChargeId, 'chg_veh_veh_a2_10_2026-05');

  // Tentativa 3 (replay após sucesso) é idempotente e não duplica
  const replayRes = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [vehicle],
    charges: store.getAllCharges(),
  });
  assert.equal(replayRes.created, 0);
  assert.equal(replayRes.skipped, 1);
  assert.equal(replayRes.carriedSourceIds.length, 0);
  assert.equal(store.getCharge('chg_veh_veh_a2_10_2026-05')!.totalAmount, 135);
});

test('ETAPA A2 - 11: Saldo de cobrança antiga de plano (isPlanCharge) não é atribuído automaticamente a um único veículo', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_a2_11', planId: 'plan_old', planName: 'Plano Frota' });
  const v1 = makeVehicle({ id: 'veh_p11_1', clientId: 'cli_a2_11', plate: 'PLA1111', monthlyValue: 100 });
  const v2 = makeVehicle({ id: 'veh_p11_2', clientId: 'cli_a2_11', plate: 'PLA2222', monthlyValue: 80 });

  const legacyPlanPartial = makeCharge({
    id: 'chg_plan_old_apr',
    clientId: 'cli_a2_11',
    vehicleId: 'veh_p11_1', // Mesmo possuindo vehicleId principal, é cobrança de plano!
    vehicleIds: ['veh_p11_1', 'veh_p11_2'],
    vehiclePlate: 'PLA1111, PLA2222',
    vehiclePlates: ['PLA1111', 'PLA2222'],
    referenceMonth: '2026-04',
    originalMonthlyValue: 150,
    totalAmount: 150,
    paidAmount: 50,
    remainingBalance: 100,
    status: 'parcial',
    balanceHandling: 'next_month',
    isPlanCharge: true,
    planId: 'plan_old',
    planName: 'Plano Frota',
    dueDate: '2026-04-10',
  });
  store.seedCharge(legacyPlanPartial);

  const res = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [v1, v2],
    charges: store.getAllCharges(),
  });

  assert.equal(res.created, 2);
  assert.equal(res.carriedSourceIds.length, 0);
  assert.deepEqual(res.untransferredPlanChargeIds, ['chg_plan_old_apr']);

  // Nenhum dos veículos recebeu o saldo de R$ 100,00 do plano antigo
  const c1 = store.getCharge('chg_veh_veh_p11_1_2026-05')!;
  const c2 = store.getCharge('chg_veh_veh_p11_2_2026-05')!;
  assert.equal(c1.previousBalanceCarried, 0);
  assert.equal(c1.totalAmount, 100);
  assert.equal(c1.carriedFromChargeIds, undefined);
  assert.equal(c2.previousBalanceCarried, 0);
  assert.equal(c2.totalAmount, 80);
  assert.equal(c2.carriedFromChargeIds, undefined);

  // Saldo legado do plano permanece preservado e cobrável (não foi perdido nem consumido)
  const planAfter = store.getCharge('chg_plan_old_apr')!;
  assert.equal(planAfter.remainingBalance, 100);
  assert.equal(planAfter.carriedBalanceConsumed, undefined);
  assert.equal(getChargeEffectiveOpenBalance(planAfter), 100);

  // Total pendente consolidado = 100 (plano abril preservado) + 100 (v1 maio) + 80 (v2 maio) = 280
  const consolidated = consolidateClientFinancials(client, [v1, v2], store.getAllCharges());
  assert.equal(consolidated.totalPending, 280);
});

test('ETAPA A2 - 12: Saldo parcial permanece correto após pagamentos posteriores (antes e depois do transporte)', async () => {
  const store = new InMemoryTransactionalFirestore();
  const client = makeClient({ id: 'cli_a2_12' });
  const vehicle = makeVehicle({ id: 'veh_a2_12', clientId: 'cli_a2_12', plate: 'PAG1212', monthlyValue: 100 });

  store.seedCharge(
    makeCharge({
      id: 'chg_apr_a2_12',
      clientId: 'cli_a2_12',
      vehicleId: 'veh_a2_12',
      vehiclePlate: 'PAG1212',
      referenceMonth: '2026-04',
      originalMonthlyValue: 100,
      totalAmount: 100,
      paidAmount: 0,
      remainingBalance: 100,
      status: 'pendente',
      balanceHandling: 'none',
      dueDate: '2026-04-10',
    })
  );

  // 1. Primeiro pagamento parcial em abril (R$ 40,00 -> resta R$ 60,00 marcado para next_month)
  await executeRecordPayment(store, {
    chargeId: 'chg_apr_a2_12',
    amount: 40,
    paymentMethod: 'pix',
    balanceHandling: 'next_month',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_a2_12_1',
  });

  // 2. Segundo pagamento parcial em abril ANTES da geração de maio (R$ 25,00 -> saldo vivo reduz para R$ 35,00)
  await executeRecordPayment(store, {
    chargeId: 'chg_apr_a2_12',
    amount: 25,
    paymentMethod: 'pix',
    balanceHandling: 'next_month',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_a2_12_2',
  });

  // 3. Geração de maio transporta exatamente o saldo vivo restante (R$ 35,00)
  const mayGen = await executeMonthlyChargeGeneration(store, {
    month: '2026-05',
    clients: [client],
    vehicles: [vehicle],
    charges: store.getAllCharges(),
  });
  assert.equal(mayGen.created, 1);
  assert.deepEqual(mayGen.carriedSourceIds, ['chg_apr_a2_12']);

  const mayCharge = store.getCharge('chg_veh_veh_a2_12_2026-05')!;
  assert.equal(mayCharge.previousBalanceCarried, 35);
  assert.equal(mayCharge.totalAmount, 135);
  assert.equal(mayCharge.remainingBalance, 135);

  // 4. Tentar pagar novamente a origem já consumida (abril) é rejeitado para impedir dupla cobrança
  await assert.rejects(
    () =>
      executeRecordPayment(store, {
        chargeId: 'chg_apr_a2_12',
        amount: 35,
        paymentMethod: 'pix',
        operatorId: 'admin_uid',
        operatorName: 'Admin',
        operationId: 'pay_a2_12_dup_origin',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'BALANCE_ALREADY_CARRIED'
  );

  // 5. Pagamento parcial na cobrança de destino (maio): paga R$ 50,00 -> resta R$ 85,00
  const mayPay1 = await executeRecordPayment(store, {
    chargeId: mayCharge.id,
    amount: 50,
    paymentMethod: 'pix',
    balanceHandling: 'open_negotiation',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_a2_12_3',
  });
  assert.equal(mayPay1.isFullyPaid, false);
  assert.equal(mayPay1.newRemainingBalance, 85);
  assert.equal(
    consolidateClientFinancials(client, [vehicle], store.getAllCharges()).totalPending,
    85
  );

  // 6. Quitação final da cobrança de destino (maio): paga R$ 85,00 -> saldo zero e status pago
  const mayPay2 = await executeRecordPayment(store, {
    chargeId: mayCharge.id,
    amount: 85,
    paymentMethod: 'dinheiro',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_a2_12_4',
  });
  assert.equal(mayPay2.isFullyPaid, true);
  assert.equal(mayPay2.newRemainingBalance, 0);
  assert.equal(store.getCharge(mayCharge.id)!.status, 'pago');
  assert.equal(store.getCharge(mayCharge.id)!.paidAmount, 135);

  // Total recebido = 40 + 25 + 50 + 85 = 200 (exatamente abril R$ 100 + maio R$ 100) e saldo pendente = 0
  const finalConsolidated = consolidateClientFinancials(client, [vehicle], store.getAllCharges());
  assert.equal(finalConsolidated.totalReceived, 200);
  assert.equal(finalConsolidated.totalPending, 0);

  // 7. Subcenário adicional: quitação integral antes da geração do mês seguinte -> nada é transportado
  const storePaidBefore = new InMemoryTransactionalFirestore();
  storePaidBefore.seedCharge(
    makeCharge({
      id: 'chg_apr_paid_before',
      clientId: 'cli_a2_12',
      vehicleId: 'veh_a2_12',
      vehiclePlate: 'PAG1212',
      referenceMonth: '2026-04',
      totalAmount: 100,
      paidAmount: 40,
      remainingBalance: 60,
      status: 'parcial',
      balanceHandling: 'next_month',
      dueDate: '2026-04-10',
    })
  );
  await executeRecordPayment(storePaidBefore, {
    chargeId: 'chg_apr_paid_before',
    amount: 60,
    paymentMethod: 'pix',
    operatorId: 'admin_uid',
    operatorName: 'Admin',
    operationId: 'pay_settle_before_gen',
  });
  const mayAfterSettle = await executeMonthlyChargeGeneration(storePaidBefore, {
    month: '2026-05',
    clients: [client],
    vehicles: [vehicle],
    charges: storePaidBefore.getAllCharges(),
  });
  assert.equal(mayAfterSettle.created, 1);
  assert.equal(mayAfterSettle.carriedSourceIds.length, 0);
  assert.equal(storePaidBefore.getCharge('chg_veh_veh_a2_12_2026-05')!.previousBalanceCarried, 0);
  assert.equal(storePaidBefore.getCharge('chg_veh_veh_a2_12_2026-05')!.totalAmount, 100);
});
