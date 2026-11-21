/**
 * AUTOTEC FINANÇAS — Suíte Automatizada de Baixa Antecipada de Mensalidades
 *
 * IMPORTANTE: Todos os testes abaixo são SIMULADOS EM MEMÓRIA (InMemoryFinancialStore),
 * sem qualquer conexão, escrita ou alteração no banco real Firebase/Firestore de produção.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeRecordPayment,
  executeRecordConsolidatedPayment,
  FinancialStoreAdapter,
  TransactionLike,
  FinancialValidationError,
} from '../src/lib/financialTransactions';
import {
  calculateDashboardMetrics,
  calculateMonthlyReportMetrics,
  consolidateClientFinancials,
  formatDateTime,
  getChargeRemainingBalance,
  getPaymentsForCharge,
  isEarlyPaymentDate,
} from '../src/lib/calculations';
import { generateReceiptSvg } from '../src/lib/svgReceipt';
import {
  buildConsolidatedReceiptVehicleRows,
  generateMonthlyPaymentReceiptPdf,
} from '../src/lib/pdfDocuments';
import {
  classifyRecordLinkStatus,
  searchClientsWithVehicles,
} from '../src/lib/clientVehicleLookup';
import { Charge, Client, CompanySettings, Payment, Vehicle } from '../src/types';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryFinancialStore implements FinancialStoreAdapter {
  public collections: Record<string, Map<string, any>> = {
    charges: new Map(),
    payments: new Map(),
  };

  private txChain: Promise<void> = Promise.resolve();

  constructor(seed?: { charges?: Charge[]; payments?: Payment[] }) {
    for (const c of seed?.charges || []) {
      this.collections.charges.set(c.id, deepClone(c));
    }
    for (const p of seed?.payments || []) {
      this.collections.payments.set(p.id, deepClone(p));
    }
  }

  public getCollectionList<T>(name: 'charges' | 'payments'): T[] {
    return Array.from(this.collections[name].values()).map((d) => deepClone(d));
  }

  public getDoc<T>(name: 'charges' | 'payments', id: string): T | undefined {
    const val = this.collections[name].get(id);
    return val ? deepClone(val) : undefined;
  }

  async runTransaction<T>(fn: (tx: TransactionLike) => Promise<T>): Promise<T> {
    let release!: () => void;
    const prev = this.txChain;
    this.txChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;

    try {
      const staging = {
        charges: new Map(
          Array.from(this.collections.charges.entries()).map(([k, v]) => [k, deepClone(v)])
        ),
        payments: new Map(
          Array.from(this.collections.payments.entries()).map(([k, v]) => [k, deepClone(v)])
        ),
      };

      let hasWritten = false;
      const pendingOps: (() => void)[] = [];

      const tx: TransactionLike = {
        async get<D = Record<string, any>>(collectionName: 'charges' | 'payments', id: string) {
          if (hasWritten) {
            throw new Error('Firestore rule violation: reads must happen before writes');
          }
          const col = staging[collectionName];
          const doc = col?.get(id);
          return {
            id,
            exists: () => doc !== undefined,
            data: () => (doc !== undefined ? (deepClone(doc) as D) : undefined),
          };
        },
        set(collectionName: 'charges' | 'payments', id: string, data: Record<string, any>) {
          hasWritten = true;
          pendingOps.push(() => {
            staging[collectionName].set(id, deepClone(data));
          });
        },
        update(collectionName: 'charges' | 'payments', id: string, data: Record<string, any>) {
          hasWritten = true;
          pendingOps.push(() => {
            const col = staging[collectionName];
            const current = col.get(id);
            if (!current) {
              throw new Error(`Document ${collectionName}/${id} does not exist for update`);
            }
            col.set(id, { ...current, ...deepClone(data) });
          });
        },
      };

      const result = await fn(tx);
      for (const op of pendingOps) {
        op();
      }
      this.collections = staging;
      return result;
    } finally {
      release();
    }
  }
}

const TEST_COMPANY: CompanySettings = {
  id: 'default',
  companyName: 'AUTOTEC RASTREAMENTO VEICULAR',
  tradeName: 'AUTOTEC',
  cnpj: '38.450.812/0001-94',
  phone: '(85) 99999-0000',
  whatsapp: '(85) 99999-0000',
  address: 'Av. Principal, 100',
  city: 'Fortaleza',
  state: 'CE',
  zipCode: '60000-000',
  email: 'contato@autotec.com.br',
  pixKey: '38.450.812/0001-94',
  pixKeyType: 'CNPJ',
  receiptFooterMessage: 'Obrigado pela preferência!',
};

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'cli_1',
    name: 'João da Silva',
    document: '123.456.789-00',
    phone: '85999991111',
    whatsapp: '85999991111',
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
    plate: 'AAA1A11',
    brand: 'Toyota',
    model: 'Corolla',
    color: 'Prata',
    vehicleType: 'carro',
    planDescription: '',
    contractStartDate: '2026-01-10',
    monthlyValue: 80,
    dueDay: 10,
    status: 'ativo',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z',
    ...overrides,
  };
}

function makeCharge(overrides: Partial<Charge> = {}): Charge {
  return {
    id: 'chg_veh_veh_1_2026-12',
    clientId: 'cli_1',
    clientName: 'João da Silva',
    vehicleId: 'veh_1',
    vehiclePlate: 'AAA1A11',
    vehicleModel: 'Toyota Corolla',
    referenceMonth: '2026-12',
    originalMonthlyValue: 80,
    previousBalanceCarried: 0,
    discount: 0,
    addition: 0,
    totalAmount: 80,
    paidAmount: 0,
    remainingBalance: 80,
    dueDate: '2026-12-10',
    status: 'pendente',
    balanceHandling: 'none',
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// TESTE 1: Pagamento integral antes do vencimento
// ============================================================================
test('1. Pagamento integral antes do vencimento quita cobrança e registra data real do pagamento', async () => {
  const charge = makeCharge();
  const store = new InMemoryFinancialStore({ charges: [charge] });

  const result = await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 80,
    paymentMethod: 'pix',
    paymentDate: '2026-11-20',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_early_full_1',
    now: '2026-11-20T14:30:00.000Z',
    receiptNumber: 'REC-202611-1001',
  });

  assert.equal(result.wasReplay, false);
  assert.equal(result.isFullyPaid, true);
  assert.equal(result.newRemainingBalance, 0);
  assert.equal(result.payment.paymentDate, '2026-11-20');
  assert.equal(result.payment.amount, 80);
  assert.equal(result.payment.remainingAfterPayment, 0);

  const updatedCharge = store.getDoc<Charge>('charges', charge.id)!;
  assert.equal(updatedCharge.status, 'pago');
  assert.equal(updatedCharge.paidAmount, 80);
  assert.equal(updatedCharge.remainingBalance, 0);
  assert.equal(updatedCharge.paymentDate, '2026-11-20');
  assert.equal(updatedCharge.dueDate, '2026-12-10');
  assert.equal(updatedCharge.referenceMonth, '2026-12');
  assert.equal(isEarlyPaymentDate(result.payment.paymentDate, updatedCharge.dueDate), true);
});

// ============================================================================
// TESTE 2: Pagamento parcial antes do vencimento
// ============================================================================
test('2. Pagamento parcial antes do vencimento marca parcial, preserva saldo R$ 30 e não quita', async () => {
  const charge = makeCharge();
  const store = new InMemoryFinancialStore({ charges: [charge] });

  const result = await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 50,
    paymentMethod: 'pix',
    paymentDate: '2026-11-20',
    balanceHandling: 'open_negotiation',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_early_part_1',
    now: '2026-11-20T15:00:00.000Z',
    receiptNumber: 'REC-202611-2001',
  });

  assert.equal(result.isFullyPaid, false);
  assert.equal(result.newRemainingBalance, 30);
  assert.equal(result.payment.paymentDate, '2026-11-20');
  assert.equal(result.payment.remainingAfterPayment, 30);

  const updatedCharge = store.getDoc<Charge>('charges', charge.id)!;
  assert.equal(updatedCharge.status, 'parcial');
  assert.equal(updatedCharge.paidAmount, 50);
  assert.equal(updatedCharge.remainingBalance, 30);
  assert.equal(updatedCharge.dueDate, '2026-12-10');
  assert.equal(updatedCharge.referenceMonth, '2026-12');
});

// ============================================================================
// TESTE 3: Quitação do saldo restante posteriormente
// ============================================================================
test('3. Quitação do saldo restante posteriormente liquida cobrança mantendo os dois pagamentos no histórico', async () => {
  const charge = makeCharge();
  const store = new InMemoryFinancialStore({ charges: [charge] });

  const first = await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 50,
    paymentMethod: 'pix',
    paymentDate: '2026-11-20',
    balanceHandling: 'open_negotiation',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_step_1',
    now: '2026-11-20T15:00:00.000Z',
    receiptNumber: 'REC-202611-3001',
  });

  const second = await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 30,
    paymentMethod: 'dinheiro',
    paymentDate: '2026-12-08',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_step_2',
    now: '2026-12-08T10:15:00.000Z',
    receiptNumber: 'REC-202612-3002',
  });

  assert.equal(first.isFullyPaid, false);
  assert.equal(second.isFullyPaid, true);
  assert.equal(second.newRemainingBalance, 0);
  assert.equal(second.payment.paymentDate, '2026-12-08');

  const updatedCharge = store.getDoc<Charge>('charges', charge.id)!;
  assert.equal(updatedCharge.status, 'pago');
  assert.equal(updatedCharge.paidAmount, 80);
  assert.equal(updatedCharge.remainingBalance, 0);
  assert.equal(updatedCharge.dueDate, '2026-12-10');
  assert.equal(updatedCharge.referenceMonth, '2026-12');

  const allPayments = store.getCollectionList<Payment>('payments');
  assert.equal(allPayments.length, 2);
  assert.equal(getPaymentsForCharge(allPayments, charge.id).length, 2);
});

// ============================================================================
// TESTE 4: Pagamento antecipado consolidado de vários veículos
// ============================================================================
test('4. Pagamento antecipado consolidado quita vários veículos atomicamente com recibo único', async () => {
  const c1 = makeCharge({
    id: 'chg_v1_2026-12',
    vehicleId: 'veh_1',
    vehiclePlate: 'AAA1A11',
    vehicleModel: 'Toyota Corolla',
    originalMonthlyValue: 73.5,
    totalAmount: 73.5,
    remainingBalance: 73.5,
    dueDate: '2026-12-10',
  });
  const c2 = makeCharge({
    id: 'chg_v2_2026-12',
    vehicleId: 'veh_2',
    vehiclePlate: 'BBB2B22',
    vehicleModel: 'Honda Civic',
    originalMonthlyValue: 64.25,
    totalAmount: 64.25,
    remainingBalance: 64.25,
    dueDate: '2026-12-15',
  });
  const c3 = makeCharge({
    id: 'chg_v3_2026-12',
    vehicleId: 'veh_3',
    vehiclePlate: 'CCC3C33',
    vehicleModel: 'Fiat Strada',
    originalMonthlyValue: 82.25,
    totalAmount: 82.25,
    remainingBalance: 82.25,
    dueDate: '2026-12-20',
  });

  const store = new InMemoryFinancialStore({ charges: [c1, c2, c3] });

  const res = await executeRecordConsolidatedPayment(store, {
    clientId: 'cli_1',
    clientName: 'João da Silva',
    items: [
      { charge: c1, amountToPay: 73.5 },
      { charge: c2, amountToPay: 64.25 },
      { charge: c3, amountToPay: 82.25 },
    ],
    paymentDate: '2026-11-22',
    paymentMethod: 'pix',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_cons_early_1',
    now: '2026-11-22T11:00:00.000Z',
    receiptNumber: 'REC-CONS-4001',
  });

  assert.equal(res.wasReplay, false);
  assert.equal(res.payment.isConsolidated, true);
  assert.equal(res.payment.amount, 220);
  assert.equal(res.payment.remainingAfterPayment, 0);
  assert.equal(res.payment.paymentDate, '2026-11-22');
  assert.equal(res.payment.consolidatedItems?.length, 3);
  assert.equal(res.payment.consolidatedItems?.[0].dueDate, '2026-12-10');
  assert.equal(res.payment.consolidatedItems?.[1].dueDate, '2026-12-15');
  assert.equal(res.payment.consolidatedItems?.[2].dueDate, '2026-12-20');

  for (const [id, expectedDue] of [
    [c1.id, '2026-12-10'],
    [c2.id, '2026-12-15'],
    [c3.id, '2026-12-20'],
  ]) {
    const upd = store.getDoc<Charge>('charges', id)!;
    assert.equal(upd.status, 'pago');
    assert.equal(upd.remainingBalance, 0);
    assert.equal(upd.dueDate, expectedDue);
    assert.equal(upd.referenceMonth, '2026-12');
    assert.equal(upd.paymentDate, '2026-11-22');
  }

  assert.equal(store.getCollectionList<Payment>('payments').length, 1);
});

// ============================================================================
// TESTE 5: Tentativa de pagamento duplicado (idempotência + bloqueio + concorrência)
// ============================================================================
test('5. Tentativa de pagamento duplicado é bloqueada por idempotência e validação transacional', async () => {
  const charge = makeCharge();
  const store = new InMemoryFinancialStore({ charges: [charge] });

  // 5a. Execução inicial antecipada
  const first = await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 80,
    paymentMethod: 'pix',
    paymentDate: '2026-11-20',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_dup_op_1',
    now: '2026-11-20T12:00:00.000Z',
  });
  assert.equal(first.wasReplay, false);

  // 5b. Replay com mesmo operationId não duplica
  const replay = await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 80,
    paymentMethod: 'pix',
    paymentDate: '2026-11-20',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_dup_op_1',
    now: '2026-11-20T12:00:05.000Z',
  });
  assert.equal(replay.wasReplay, true);
  assert.equal(replay.payment.id, first.payment.id);
  assert.equal(store.getCollectionList<Payment>('payments').length, 1);

  // 5c. Novo operationId em cobrança já quitada antecipadamente é rejeitado
  await assert.rejects(
    () =>
      executeRecordPayment(store, {
        chargeId: charge.id,
        amount: 80,
        paymentMethod: 'pix',
        paymentDate: '2026-11-21',
        operatorId: 'op_1',
        operatorName: 'Admin',
        operationId: 'pay_dup_op_2',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'CHARGE_ALREADY_PAID'
  );

  // 5d. Concorrência simultânea em cobrança em aberto aceita apenas 1 pagamento
  const charge2 = makeCharge({ id: 'chg_concurrent_1' });
  const store2 = new InMemoryFinancialStore({ charges: [charge2] });
  const settled = await Promise.allSettled([
    executeRecordPayment(store2, {
      chargeId: charge2.id,
      amount: 80,
      paymentMethod: 'pix',
      paymentDate: '2026-11-20',
      operatorId: 'op_1',
      operatorName: 'Admin',
      operationId: 'pay_conc_a',
    }),
    executeRecordPayment(store2, {
      chargeId: charge2.id,
      amount: 80,
      paymentMethod: 'pix',
      paymentDate: '2026-11-20',
      operatorId: 'op_1',
      operatorName: 'Admin',
      operationId: 'pay_conc_b',
    }),
  ]);

  const fulfilled = settled.filter((r) => r.status === 'fulfilled');
  const rejected = settled.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(store2.getCollectionList<Payment>('payments').length, 1);
});

// ============================================================================
// TESTE 6: Tentativa de pagamento superior ao saldo
// ============================================================================
test('6. Tentativa de pagamento superior ao saldo é rejeitada sem alterar a cobrança', async () => {
  const charge = makeCharge({ totalAmount: 80, paidAmount: 50, remainingBalance: 30, status: 'parcial' });
  const store = new InMemoryFinancialStore({ charges: [charge] });

  await assert.rejects(
    () =>
      executeRecordPayment(store, {
        chargeId: charge.id,
        amount: 35,
        paymentMethod: 'pix',
        paymentDate: '2026-11-25',
        operatorId: 'op_1',
        operatorName: 'Admin',
        operationId: 'pay_over_1',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'AMOUNT_EXCEEDS_BALANCE'
  );

  const untouched = store.getDoc<Charge>('charges', charge.id)!;
  assert.equal(untouched.paidAmount, 50);
  assert.equal(untouched.remainingBalance, 30);
  assert.equal(untouched.status, 'parcial');
  assert.equal(store.getCollectionList<Payment>('payments').length, 0);
});

// ============================================================================
// TESTE 7: Preservação do vencimento original
// ============================================================================
test('7. Vencimento original (dueDate e originalDueDate) permanece intacto após baixa antecipada', async () => {
  const charge = makeCharge({
    dueDate: '2026-12-10',
    originalDueDate: '2026-12-10',
  });
  const store = new InMemoryFinancialStore({ charges: [charge] });

  await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 40,
    paymentMethod: 'pix',
    paymentDate: '2026-11-18',
    balanceHandling: 'open_negotiation',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_keep_due_1',
  });
  assert.equal(store.getDoc<Charge>('charges', charge.id)!.dueDate, '2026-12-10');
  assert.equal(store.getDoc<Charge>('charges', charge.id)!.originalDueDate, '2026-12-10');

  await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 40,
    paymentMethod: 'pix',
    paymentDate: '2026-11-25',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_keep_due_2',
  });
  const finalCharge = store.getDoc<Charge>('charges', charge.id)!;
  assert.equal(finalCharge.dueDate, '2026-12-10');
  assert.equal(finalCharge.originalDueDate, '2026-12-10');
  assert.equal(finalCharge.paymentDate, '2026-11-25');
});

// ============================================================================
// TESTE 8: Preservação da competência
// ============================================================================
test('8. Competência (referenceMonth) permanece intacta mesmo quando paga no mês anterior', async () => {
  const charge = makeCharge({ referenceMonth: '2026-12', dueDate: '2026-12-10' });
  const store = new InMemoryFinancialStore({ charges: [charge] });

  await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 80,
    paymentMethod: 'transferencia',
    paymentDate: '2026-11-19',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_keep_comp_1',
  });

  const finalCharge = store.getDoc<Charge>('charges', charge.id)!;
  assert.equal(finalCharge.referenceMonth, '2026-12');
  assert.notEqual(finalCharge.referenceMonth, '2026-11');
});

// ============================================================================
// TESTE 9: Atualização correta dos relatórios e recibos (incluindo recibo consolidado SEM valores individuais)
// ============================================================================
test('9. Recibos (SVG/PDF) e relatórios contabilizam data real do caixa e recibo consolidado oculta valores por veículo', async () => {
  // 9a. formatDateTime não desloca dia para strings YYYY-MM-DD
  assert.equal(formatDateTime('2026-11-20'), '20/11/2026');

  const client = makeClient();
  const v1 = makeVehicle({ id: 'veh_1', plate: 'AAA1A11', monthlyValue: 73.5 });
  const v2 = makeVehicle({ id: 'veh_2', plate: 'BBB2B22', model: 'Civic', brand: 'Honda', monthlyValue: 64.25 });
  const v3 = makeVehicle({ id: 'veh_3', plate: 'CCC3C33', model: 'Uno', brand: 'Fiat', monthlyValue: 90 });

  const c1 = makeCharge({
    id: 'chg_rep_1',
    vehicleId: v1.id,
    vehiclePlate: v1.plate,
    referenceMonth: '2026-12',
    dueDate: '2026-12-10',
    originalMonthlyValue: 73.5,
    totalAmount: 73.5,
    remainingBalance: 73.5,
  });
  const c2 = makeCharge({
    id: 'chg_rep_2',
    vehicleId: v2.id,
    vehiclePlate: v2.plate,
    vehicleModel: 'Honda Civic',
    referenceMonth: '2026-12',
    dueDate: '2026-12-15',
    originalMonthlyValue: 64.25,
    totalAmount: 64.25,
    remainingBalance: 64.25,
  });
  // Cobrança futura não paga (não deve antecipar receita!)
  const cUnpaidFuture = makeCharge({
    id: 'chg_rep_3',
    vehicleId: v3.id,
    vehiclePlate: v3.plate,
    vehicleModel: 'Fiat Uno',
    referenceMonth: '2026-12',
    dueDate: '2026-12-20',
    originalMonthlyValue: 90,
    totalAmount: 90,
    remainingBalance: 90,
  });

  const store = new InMemoryFinancialStore({ charges: [c1, c2, cUnpaidFuture] });

  // Pagamento consolidado antecipado em 20/11/2026 (R$ 137,75 total = 73,50 + 64,25)
  const cons = await executeRecordConsolidatedPayment(store, {
    clientId: client.id,
    clientName: client.name,
    items: [
      { charge: c1, amountToPay: 73.5 },
      { charge: c2, amountToPay: 64.25 },
    ],
    paymentDate: '2026-11-20',
    paymentMethod: 'pix',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_cons_rep_1',
    now: '2026-11-20T16:00:00.000Z',
    receiptNumber: 'REC-CONS-9001',
  });

  const liveCharges = store.getCollectionList<Charge>('charges');
  const livePayments = store.getCollectionList<Payment>('payments');

  // 9b. Recibo SVG consolidado: contém placas, competências, vencimentos originais, total consolidado (137,75)
  //     e NÃO contém valores individuais por veículo (73,50 nem 64,25)
  const consSvg = generateReceiptSvg(cons.payment, liveCharges[0], client, v1, TEST_COMPANY, liveCharges);
  assert.ok(consSvg.includes('AAA1A11'), 'SVG consolidado deve listar placa AAA1A11');
  assert.ok(consSvg.includes('BBB2B22'), 'SVG consolidado deve listar placa BBB2B22');
  assert.ok(consSvg.includes('20/11/2026'), 'SVG consolidado deve exibir data real do pagamento');
  assert.ok(consSvg.includes('10/12/2026'), 'SVG consolidado deve exibir vencimento original do veículo 1');
  assert.ok(consSvg.includes('15/12/2026'), 'SVG consolidado deve exibir vencimento original do veículo 2');
  assert.ok(consSvg.includes('137,75'), 'SVG consolidado deve exibir valor total consolidado');
  assert.ok(!consSvg.includes('73,50'), 'SVG consolidado NÃO pode exibir valor individual 73,50');
  assert.ok(!consSvg.includes('64,25'), 'SVG consolidado NÃO pode exibir valor individual 64,25');
  assert.ok(!consSvg.includes('CONSOLIDADO DE PLANO'), 'SVG consolidado não deve usar rótulo legado de Plano');

  // 9c. Recibo PDF consolidado gera Blob válido e tabela de veículos NÃO contém valores monetários individuais
  const pdfRows = buildConsolidatedReceiptVehicleRows(cons.payment, liveCharges);
  assert.equal(pdfRows.length, 2);
  const serializedPdfRows = JSON.stringify(pdfRows);
  assert.ok(serializedPdfRows.includes('AAA1A11') && serializedPdfRows.includes('10/12/2026'));
  assert.ok(serializedPdfRows.includes('BBB2B22') && serializedPdfRows.includes('15/12/2026'));
  assert.ok(!serializedPdfRows.includes('73,50') && !serializedPdfRows.includes('64,25') && !serializedPdfRows.includes('R$'));
  const consPdf = generateMonthlyPaymentReceiptPdf(
    cons.payment,
    liveCharges[0],
    client,
    v1,
    TEST_COMPANY,
    liveCharges
  );
  assert.ok(consPdf instanceof Blob && consPdf.size > 1000);

  // 9d. Recibo SVG individual mostra data real do pagamento != vencimento original + competência
  const singleStore = new InMemoryFinancialStore({ charges: [makeCharge()] });
  const singleRes = await executeRecordPayment(singleStore, {
    chargeId: 'chg_veh_veh_1_2026-12',
    amount: 80,
    paymentMethod: 'pix',
    paymentDate: '2026-11-20',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_svg_single_1',
    now: '2026-11-20T16:10:00.000Z',
    receiptNumber: 'REC-9002',
  });
  const singleCharge = singleStore.getDoc<Charge>('charges', 'chg_veh_veh_1_2026-12')!;
  const singleSvg = generateReceiptSvg(singleRes.payment, singleCharge, client, v1, TEST_COMPANY);
  assert.ok(singleSvg.includes('20/11/2026'), 'Recibo individual deve exibir data real do pagamento');
  assert.ok(singleSvg.includes('10/12/2026'), 'Recibo individual deve exibir vencimento original');
  assert.ok(singleSvg.includes('Dezembro / 2026'), 'Recibo individual deve exibir competência');
  assert.ok(singleSvg.includes('Baixa Antecipada'), 'Recibo individual deve sinalizar baixa antecipada');

  // 9e. Relatório mensal contabiliza caixa na data real (nov/2026) e NÃO antecipa cobrança futura não paga (R$ 90)
  const novReport = calculateMonthlyReportMetrics({
    charges: liveCharges,
    payments: livePayments,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    referenceToday: '2026-11-25',
  });
  assert.equal(novReport.totalReceivedInPeriod, 137.75);
  assert.equal(novReport.filteredCharges.length, 2); // somente as 2 pagas antecipadamente em nov/2026
  assert.equal(novReport.totalOverdue, 0);

  const decReport = calculateMonthlyReportMetrics({
    charges: liveCharges,
    payments: livePayments,
    startDate: '2026-12-01',
    endDate: '2026-12-31',
    referenceToday: '2026-12-05',
  });
  // Em dez/2026 o dinheiro entrou em nov/2026 -> caixa de dez/2026 = 0; pendente real = 90 (somente cUnpaidFuture)
  assert.equal(decReport.totalReceivedInPeriod, 0);
  assert.equal(decReport.totalPending, 90);

  // 9f. Dashboard em nov/2026 contabiliza exatamente R$ 137,75 recebidos no mês (não antecipa R$ 90)
  const novDash = calculateDashboardMetrics([client], [v1, v2, v3], liveCharges, livePayments, '2026-11-25');
  assert.equal(novDash.totalReceivedMonth, 137.75);
  assert.equal(novDash.totalPendingBalance, 90);
  assert.equal(novDash.totalOverdueAmount, 0);
});

// ============================================================================
// TESTE 10: Cobrança antecipadamente quitada não aparece como inadimplente
// ============================================================================
test('10. Cobrança antecipadamente quitada nunca aparece como inadimplente mesmo após o vencimento original', async () => {
  const client = makeClient();
  const vehicle = makeVehicle();
  const charge = makeCharge({ dueDate: '2026-12-10', referenceMonth: '2026-12' });
  const store = new InMemoryFinancialStore({ charges: [charge] });

  await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 80,
    paymentMethod: 'pix',
    paymentDate: '2026-11-20',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_no_overdue_1',
  });

  const liveCharges = store.getCollectionList<Charge>('charges');
  const livePayments = store.getCollectionList<Payment>('payments');

  // Avaliando após a data original de vencimento (20/12/2026 > 10/12/2026)
  const dashAfterDue = calculateDashboardMetrics([client], [vehicle], liveCharges, livePayments, '2026-12-20');
  assert.equal(dashAfterDue.overdueCharges.length, 0);
  assert.equal(dashAfterDue.totalOverdueAmount, 0);
  assert.equal(dashAfterDue.defaultingClientsCount, 0);

  const clientConsolidated = consolidateClientFinancials(client, [vehicle], liveCharges, '2026-12-20');
  assert.equal(clientConsolidated.isOverdue, false);
  assert.equal(clientConsolidated.totalOverdue, 0);
  assert.equal(clientConsolidated.totalPending, 0);

  const decReport = calculateMonthlyReportMetrics({
    charges: liveCharges,
    payments: livePayments,
    startDate: '2026-12-01',
    endDate: '2026-12-31',
    statusFilter: 'overdue',
    referenceToday: '2026-12-20',
  });
  assert.equal(decReport.filteredCharges.length, 0);
  assert.equal(decReport.totalOverdue, 0);
});

// ============================================================================
// TESTE 11: Cobrança parcial antecipada continua com saldo correto
// ============================================================================
test('11. Cobrança parcial antecipada mantém saldo exato antes e após o vencimento original', async () => {
  const client = makeClient();
  const vehicle = makeVehicle();
  const charge = makeCharge({ totalAmount: 80, remainingBalance: 80, dueDate: '2026-12-10' });
  const store = new InMemoryFinancialStore({ charges: [charge] });

  await executeRecordPayment(store, {
    chargeId: charge.id,
    amount: 50,
    paymentMethod: 'pix',
    paymentDate: '2026-11-20',
    balanceHandling: 'open_negotiation',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_partial_balance_1',
  });

  const liveCharges = store.getCollectionList<Charge>('charges');
  const livePayments = store.getCollectionList<Payment>('payments');

  assert.equal(getChargeRemainingBalance(liveCharges[0]), 30);

  // Antes do vencimento (25/11/2026): saldo R$ 30 pendente, NÃO inadimplente
  const dashBeforeDue = calculateDashboardMetrics([client], [vehicle], liveCharges, livePayments, '2026-11-25');
  assert.equal(dashBeforeDue.totalReceivedMonth, 50);
  assert.equal(dashBeforeDue.totalPartialAmount, 30);
  assert.equal(dashBeforeDue.totalPendingBalance, 30);
  assert.equal(dashBeforeDue.totalOverdueAmount, 0);
  assert.equal(dashBeforeDue.overdueCharges.length, 0);

  // Após o vencimento (15/12/2026) sem quitação do resíduo: apenas os R$ 30 ficam vencidos
  const dashAfterDue = calculateDashboardMetrics([client], [vehicle], liveCharges, livePayments, '2026-12-15');
  assert.equal(dashAfterDue.totalOverdueAmount, 30);
  assert.equal(dashAfterDue.totalPendingBalance, 30);
  assert.equal(dashAfterDue.overdueCharges.length, 1);
  assert.equal(dashAfterDue.defaultingClientsCount, 1);
});

// ============================================================================
// TESTE 12: Integridade dos registros históricos (incluindo OCB5030 órfão somente leitura)
// ============================================================================
test('12. Registros históricos (OCB5030 órfão e cobrança legada de plano) permanecem intactos e pesquisáveis', async () => {
  const client = makeClient({ id: 'cli_1', name: 'Carlos Alberto' });
  const v1 = makeVehicle({ id: 'veh_1', clientId: 'cli_1', plate: 'ABC1D23' });
  const v2 = makeVehicle({ id: 'veh_2', clientId: 'cli_1', plate: 'XYZ9K88' });

  // Registro histórico órfão OCB5030 (sem cliente ou veículo ativo correspondente)
  const orphanOcbCharge = makeCharge({
    id: 'chg_legacy_ocb5030',
    clientId: 'cli_deleted_999',
    clientName: 'Cliente Legado OCB',
    vehicleId: 'veh_deleted_999',
    vehiclePlate: 'OCB5030',
    vehicleModel: 'Veículo Histórico',
    referenceMonth: '2026-08',
    dueDate: '2026-08-10',
    status: 'pago',
    paidAmount: 75,
    remainingBalance: 0,
    totalAmount: 75,
    originalMonthlyValue: 75,
  });

  // Cobrança histórica de plano (descontinuada operacionalmente, preservada no histórico)
  const legacyPlanCharge = makeCharge({
    id: 'chg_legacy_plan_1',
    clientId: 'cli_1',
    clientName: 'Carlos Alberto',
    vehicleId: 'plan_old_1',
    vehiclePlate: 'ABC1D23, XYZ9K88',
    referenceMonth: '2026-09',
    dueDate: '2026-09-10',
    isPlanCharge: true,
    planId: 'plan_old_1',
    planName: 'Plano Frota Histórico',
    vehicleIds: ['veh_1', 'veh_2'],
    vehiclePlates: ['ABC1D23', 'XYZ9K88'],
    status: 'pago',
    paidAmount: 140,
    remainingBalance: 0,
    totalAmount: 140,
    originalMonthlyValue: 140,
  });

  const activeCharge = makeCharge({
    id: 'chg_active_dec',
    clientId: 'cli_1',
    clientName: 'Carlos Alberto',
    vehicleId: 'veh_1',
    vehiclePlate: 'ABC1D23',
    referenceMonth: '2026-12',
    dueDate: '2026-12-10',
  });

  const store = new InMemoryFinancialStore({
    charges: [orphanOcbCharge, legacyPlanCharge, activeCharge],
  });

  // Executa baixa antecipada na cobrança ativa
  await executeRecordPayment(store, {
    chargeId: activeCharge.id,
    amount: 80,
    paymentMethod: 'pix',
    paymentDate: '2026-11-20',
    operatorId: 'op_1',
    operatorName: 'Admin',
    operationId: 'pay_hist_check_1',
  });

  // Verifica que OCB5030 e cobrança histórica de plano permanecem 100% inalteradas
  assert.deepEqual(store.getDoc<Charge>('charges', orphanOcbCharge.id), orphanOcbCharge);
  assert.deepEqual(store.getDoc<Charge>('charges', legacyPlanCharge.id), legacyPlanCharge);

  // Verifica classificação somente leitura do registro órfão OCB5030
  const clientsMap = new Map([[client.id, client]]);
  const vehiclesMap = new Map([
    [v1.id, v1],
    [v2.id, v2],
  ]);
  const linkStatus = classifyRecordLinkStatus({
    clientId: orphanOcbCharge.clientId,
    vehicleId: orphanOcbCharge.vehicleId,
    clientsMap,
    vehiclesMap,
  });
  assert.equal(linkStatus.isOrphan, true);

  // Verifica busca por placa (reorganização recente preservada)
  const searchByPlate = searchClientsWithVehicles([client], [v1, v2], 'XYZ9K88');
  assert.equal(searchByPlate.length, 1);
  assert.equal(searchByPlate[0].client.id, client.id);
});
