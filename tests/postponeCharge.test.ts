import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoUndefinedDeep,
  executePostponeCharge,
  FinancialStoreAdapter,
  FinancialValidationError,
  findUndefinedPaths,
  stripUndefinedDeep,
  TransactionLike,
} from '../src/lib/financialTransactions';
import { Charge, Payment } from '../src/types';

/**
 * Store transacional simulado em memória (ZERO conexão ou escrita no Firebase real).
 * Replica a validação estrita do Firestore SDK: rejeita qualquer `undefined` em qualquer
 * profundidade (inclusive dentro de objetos em arrays como `postponementHistory`),
 * lançando o mesmo formato de erro do Firestore (`Unsupported field value: undefined`).
 */
class StrictInMemoryFirestoreStore implements FinancialStoreAdapter {
  charges = new Map<string, Record<string, any>>();
  payments = new Map<string, Record<string, any>>();
  recordedUpdates: { collection: string; id: string; payload: Record<string, any> }[] = [];

  seedCharge(charge: Charge | Record<string, any>): void {
    this.charges.set(charge.id, structuredClone(charge));
  }

  seedPayment(payment: Payment): void {
    this.payments.set(payment.id, structuredClone(payment));
  }

  private assertFirestoreSerializable(
    opName: 'setDoc' | 'updateDoc',
    collectionName: string,
    id: string,
    value: unknown
  ): void {
    const undefinedPaths = findUndefinedPaths(value);
    if (undefinedPaths.length > 0) {
      throw new Error(
        `Function ${opName}() called with invalid data. Unsupported field value: undefined (found in document ${collectionName}/${id}, field: ${undefinedPaths[0]})`
      );
    }
  }

  async runTransaction<R>(fn: (tx: TransactionLike) => Promise<R>): Promise<R> {
    const stagedCharges = new Map(
      Array.from(this.charges.entries()).map(([k, v]) => [k, structuredClone(v)])
    );
    const stagedPayments = new Map(
      Array.from(this.payments.entries()).map(([k, v]) => [k, structuredClone(v)])
    );
    const stagedUpdates: { collection: string; id: string; payload: Record<string, any> }[] = [];

    const tx: TransactionLike = {
      get: async <T = Record<string, any>>(col: 'charges' | 'payments', id: string) => {
        const map = col === 'charges' ? stagedCharges : stagedPayments;
        const found = map.get(id);
        return {
          id,
          exists: () => found !== undefined,
          data: () => (found !== undefined ? (structuredClone(found) as T) : undefined),
        };
      },
      set: (col, id, data) => {
        this.assertFirestoreSerializable('setDoc', col, id, data);
        const map = col === 'charges' ? stagedCharges : stagedPayments;
        map.set(id, structuredClone(data));
      },
      update: (col, id, data) => {
        this.assertFirestoreSerializable('updateDoc', col, id, data);
        const map = col === 'charges' ? stagedCharges : stagedPayments;
        const current = map.get(id);
        if (!current) {
          throw new Error(`No document to update: ${col}/${id}`);
        }
        stagedUpdates.push({ collection: col, id, payload: structuredClone(data) });
        map.set(id, { ...current, ...structuredClone(data) });
      },
    };

    const result = await fn(tx);
    // Commit atômico somente se a transação concluir sem erro
    this.charges = stagedCharges;
    this.payments = stagedPayments;
    this.recordedUpdates.push(...stagedUpdates);
    return result;
  }
}

function makeBaseCharge(overrides: Partial<Charge> = {}): Charge {
  return {
    id: 'chg_1794343422870_huon',
    clientId: 'cli_01',
    clientName: 'João Carlos Silva',
    vehicleId: 'veh_01',
    vehiclePlate: 'ABC1D23',
    vehicleModel: 'Fiat Strada 2024',
    referenceMonth: '2026-10',
    dueDate: '2026-10-10',
    originalMonthlyValue: 79.9,
    previousBalanceCarried: 0,
    discount: 0,
    addition: 0,
    totalAmount: 79.9,
    paidAmount: 0,
    remainingBalance: 79.9,
    status: 'pendente',
    balanceHandling: 'none',
    notes: '',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    createdBy: 'admin_uid',
    ...overrides,
  };
}

test('1. Adiar cobrança integral pendente com sucesso e sem alterar status/valores', async () => {
  const store = new StrictInMemoryFirestoreStore();
  store.seedCharge(makeBaseCharge());

  const result = await executePostponeCharge(store, {
    chargeId: 'chg_1794343422870_huon',
    newDueDate: '2026-11-10',
    reason: 'Cliente solicitou reagendamento para o próximo recebimento',
    operatorId: 'uid_admin',
    operatorName: 'Administrador AUTOTEC',
    now: '2026-10-15T12:00:00.000Z',
    referenceToday: '2026-10-15',
  });

  const saved = store.charges.get('chg_1794343422870_huon') as Charge;
  assert.equal(saved.dueDate, '2026-11-10');
  assert.equal(saved.originalDueDate, '2026-10-10');
  assert.equal(saved.isPostponed, true);
  assert.equal(saved.postponementCount, 1);
  assert.equal(saved.status, 'pendente');
  assert.equal(saved.paidAmount, 0);
  assert.equal(saved.remainingBalance, 79.9);
  assert.equal(saved.totalAmount, 79.9);
  assert.equal(result.record.reason, 'Cliente solicitou reagendamento para o próximo recebimento');
  assert.equal(result.record.previousDueDate, '2026-10-10');
  assert.equal(result.record.newDueDate, '2026-11-10');
});

test('2. Adiar cobrança parcialmente paga preservando status parcial, valor pago e pagamentos', async () => {
  const store = new StrictInMemoryFirestoreStore();
  store.seedCharge(
    makeBaseCharge({
      id: 'chg_partial_01',
      totalAmount: 120,
      originalMonthlyValue: 120,
      paidAmount: 50,
      remainingBalance: 70,
      status: 'parcial',
      paymentDate: '2026-10-11',
    })
  );
  const existingPayment: Payment = {
    id: 'pay_partial_01',
    chargeId: 'chg_partial_01',
    clientId: 'cli_01',
    clientName: 'João Carlos Silva',
    vehicleId: 'veh_01',
    vehiclePlate: 'ABC1D23',
    amount: 50,
    paymentDate: '2026-10-11',
    paymentMethod: 'pix',
    operatorId: 'uid_admin',
    operatorName: 'Administrador AUTOTEC',
    receiptNumber: 'REC-001',
    remainingAfterPayment: 70,
    notes: 'Entrada parcial',
    createdAt: '2026-10-11T10:00:00.000Z',
  };
  store.seedPayment(existingPayment);

  await executePostponeCharge(store, {
    chargeId: 'chg_partial_01',
    newDueDate: '2026-10-28',
    operatorId: 'uid_admin',
    operatorName: 'Administrador AUTOTEC',
    now: '2026-10-15T12:00:00.000Z',
    referenceToday: '2026-10-15',
  });

  const saved = store.charges.get('chg_partial_01') as Charge;
  assert.equal(saved.dueDate, '2026-10-28');
  assert.equal(saved.originalDueDate, '2026-10-10');
  assert.equal(saved.status, 'parcial');
  assert.equal(saved.paidAmount, 50);
  assert.equal(saved.remainingBalance, 70);
  assert.equal(saved.paymentDate, '2026-10-11');
  assert.deepEqual(store.payments.get('pay_partial_01'), existingPayment);
});

test('3. Adiar cobrança com saldo transportável (balanceHandling: next_month) preservando configuração', async () => {
  const store = new StrictInMemoryFirestoreStore();
  store.seedCharge(
    makeBaseCharge({
      id: 'chg_carryable_01',
      totalAmount: 100,
      originalMonthlyValue: 100,
      paidAmount: 40,
      remainingBalance: 60,
      status: 'parcial',
      balanceHandling: 'next_month',
      balanceScheduledDate: '2026-11-10',
    })
  );

  await executePostponeCharge(store, {
    chargeId: 'chg_carryable_01',
    newDueDate: '2026-11-05',
    now: '2026-10-15T12:00:00.000Z',
    referenceToday: '2026-10-15',
  });

  const saved = store.charges.get('chg_carryable_01') as Charge;
  assert.equal(saved.dueDate, '2026-11-05');
  assert.equal(saved.balanceHandling, 'next_month');
  assert.equal(saved.balanceScheduledDate, '2026-11-10');
  assert.equal(saved.remainingBalance, 60);
  assert.equal(saved.status, 'parcial');
});

test('4. Adiar cobrança sem campos opcionais antigos (caso real chg_1794343422870_huon sem planId/reason/originalDueDate)', async () => {
  const store = new StrictInMemoryFirestoreStore();
  // Simula cobrança individual real sem planId, planName, originalDueDate, postponementHistory, vehicleModel
  const minimalLegacyCharge: Record<string, any> = {
    id: 'chg_1794343422870_huon',
    clientId: 'cli_real_01',
    clientName: 'Maria Fernanda Souza',
    vehicleId: 'veh_real_01',
    vehiclePlate: 'QWE9R87',
    vehicleModel: '',
    referenceMonth: '2026-10',
    dueDate: '2026-10-08',
    originalMonthlyValue: 69.9,
    previousBalanceCarried: 0,
    discount: 0,
    addition: 0,
    totalAmount: 69.9,
    paidAmount: 0,
    remainingBalance: 69.9,
    status: 'pendente',
    balanceHandling: 'none',
    notes: '',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    createdBy: 'uid_admin',
  };
  store.seedCharge(minimalLegacyCharge);

  // Sem motivo (espaços em branco) e sem operatorName
  const result = await executePostponeCharge(store, {
    chargeId: 'chg_1794343422870_huon',
    newDueDate: '2026-11-08',
    reason: '   ',
    now: '2026-10-20T14:00:00.000Z',
    referenceToday: '2026-10-20',
  });

  const record = result.record;
  assert.equal('planId' in record, false, 'planId não deve existir como undefined nem null');
  assert.equal('reason' in record, false, 'reason vazio não deve existir como undefined nem null');
  assert.equal('operatorId' in record, false, 'operatorId ausente não deve ser enviado');
  assert.equal('operatorName' in record, false, 'operatorName ausente não deve ser enviado');
  assert.equal(record.vehicleId, 'veh_real_01');
  assert.equal(record.targetLabel, 'QWE9R87');
  assert.equal(findUndefinedPaths(result.updatePayload).length, 0);
});

test('5. Adiar cobrança com campos da Etapa A2 (carriedFromChargeIds, carriedBalanceSources) preservando tudo', async () => {
  const store = new StrictInMemoryFirestoreStore();
  const a2Fields = {
    previousBalanceCarried: 35.5,
    carriedFromChargeIds: ['chg_2026_09_veh_01'],
    carriedBalanceSources: [
      {
        sourceChargeId: 'chg_2026_09_veh_01',
        sourceReferenceMonth: '2026-09',
        amount: 35.5,
        sourceDueDate: '2026-09-10',
      },
    ],
  };

  store.seedCharge(
    makeBaseCharge({
      id: 'chg_a2_01',
      originalMonthlyValue: 79.9,
      totalAmount: 115.4,
      remainingBalance: 115.4,
      ...a2Fields,
    })
  );

  await executePostponeCharge(store, {
    chargeId: 'chg_a2_01',
    newDueDate: '2026-11-10',
    now: '2026-10-15T12:00:00.000Z',
    referenceToday: '2026-10-15',
  });

  const saved = store.charges.get('chg_a2_01') as Charge;
  assert.equal(saved.dueDate, '2026-11-10');
  assert.equal(saved.previousBalanceCarried, 35.5);
  assert.deepEqual(saved.carriedFromChargeIds, a2Fields.carriedFromChargeIds);
  assert.deepEqual(saved.carriedBalanceSources, a2Fields.carriedBalanceSources);
  assert.equal(saved.totalAmount, 115.4);
  assert.equal(saved.remainingBalance, 115.4);
});

test('6. Nenhum objeto enviado ao Firestore (nem em arrays como postponementHistory) contém undefined', async () => {
  // 6a. Verificar stripUndefinedDeep em arrays aninhados de objetos
  const dirty = {
    topLevelUndefined: undefined,
    valid: 'ok',
    nested: { a: 1, b: undefined },
    postponementHistory: [
      {
        id: 'post_legacy_1',
        planId: undefined,
        reason: undefined,
        newDueDate: '2026-10-20',
      },
      undefined,
    ],
  };
  const cleaned = stripUndefinedDeep(dirty);
  assert.equal(findUndefinedPaths(cleaned).length, 0);
  assert.equal(cleaned.postponementHistory.length, 1);
  assert.equal('planId' in (cleaned.postponementHistory[0] as Record<string, any>), false);
  assert.equal('reason' in (cleaned.postponementHistory[0] as Record<string, any>), false);

  // 6b. Verificar assertNoUndefinedDeep detectando undefined aninhado em array
  assert.throws(
    () =>
      assertNoUndefinedDeep(
        { postponementHistory: [{ id: 'p1', planId: undefined }] },
        'charges/test'
      ),
    (err: any) =>
      err instanceof FinancialValidationError &&
      err.code === 'UNDEFINED_FIELD_VALUE' &&
      err.message.includes('postponementHistory[0].planId')
  );

  // 6c. Verificar que histórico legado contaminado com undefined é limpo no update real
  const store = new StrictInMemoryFirestoreStore();
  store.seedCharge({
    ...makeBaseCharge({
      id: 'chg_dirty_history',
      dueDate: '2026-10-12',
      originalDueDate: '2026-10-05',
      isPostponed: true,
      postponementCount: 1,
    }),
    postponementHistory: [
      {
        id: 'post_old',
        originalDueDate: '2026-10-05',
        previousDueDate: '2026-10-05',
        newDueDate: '2026-10-12',
        referenceMonth: '2026-10',
        clientId: 'cli_01',
        clientName: 'João Carlos Silva',
        targetType: 'veiculo',
        targetLabel: 'ABC1D23 — Fiat Strada 2024',
        planId: undefined,
        reason: undefined,
        postponedAt: '2026-10-06T10:00:00.000Z',
      },
    ],
  });

  await executePostponeCharge(store, {
    chargeId: 'chg_dirty_history',
    newDueDate: '2026-11-12',
    now: '2026-10-18T12:00:00.000Z',
    referenceToday: '2026-10-18',
  });

  assert.equal(store.recordedUpdates.length, 1);
  assert.equal(findUndefinedPaths(store.recordedUpdates[0].payload).length, 0);
});

test('7. Preservação integral de pagamentos, valores financeiros e descontos/acréscimos', async () => {
  const store = new StrictInMemoryFirestoreStore();
  const initialCharge = makeBaseCharge({
    id: 'chg_values_01',
    originalMonthlyValue: 90,
    previousBalanceCarried: 20,
    discount: 5,
    addition: 2.5,
    totalAmount: 107.5,
    paidAmount: 30,
    remainingBalance: 77.5,
    status: 'parcial',
    paymentDate: '2026-10-11',
    notes: 'Observação original importante',
  });
  store.seedCharge(initialCharge);

  await executePostponeCharge(store, {
    chargeId: 'chg_values_01',
    newDueDate: '2026-11-15',
    now: '2026-10-15T12:00:00.000Z',
    referenceToday: '2026-10-15',
  });

  const saved = store.charges.get('chg_values_01') as Charge;
  assert.equal(saved.originalMonthlyValue, 90);
  assert.equal(saved.previousBalanceCarried, 20);
  assert.equal(saved.discount, 5);
  assert.equal(saved.addition, 2.5);
  assert.equal(saved.totalAmount, 107.5);
  assert.equal(saved.paidAmount, 30);
  assert.equal(saved.remainingBalance, 77.5);
  assert.equal(saved.status, 'parcial');
  assert.equal(saved.paymentDate, '2026-10-11');
  assert.equal(saved.notes, 'Observação original importante');

  // O payload enviado no update NÃO tenta sobrescrever campos financeiros imutáveis
  const sentKeys = Object.keys(store.recordedUpdates[0].payload).sort();
  assert.deepEqual(sentKeys, [
    'dueDate',
    'isPostponed',
    'originalDueDate',
    'postponedAt',
    'postponementCount',
    'postponementHistory',
    'updatedAt',
  ]);
});

test('8. Preservação integral da competência (referenceMonth) mesmo cruzando mês e ano', async () => {
  const store = new StrictInMemoryFirestoreStore();
  store.seedCharge(
    makeBaseCharge({
      id: 'chg_comp_01',
      referenceMonth: '2026-12',
      dueDate: '2026-12-10',
    })
  );

  await executePostponeCharge(store, {
    chargeId: 'chg_comp_01',
    newDueDate: '2027-01-20',
    now: '2026-12-15T10:00:00.000Z',
    referenceToday: '2026-12-15',
  });

  const saved = store.charges.get('chg_comp_01') as Charge;
  assert.equal(saved.referenceMonth, '2026-12');
  assert.equal(saved.dueDate, '2027-01-20');
  assert.equal(saved.originalDueDate, '2026-12-10');
});

test('9. Registro correto do adiamento em múltiplos adiamentos consecutivos preservando originalDueDate', async () => {
  const store = new StrictInMemoryFirestoreStore();
  store.seedCharge(
    makeBaseCharge({
      id: 'chg_multi_01',
      dueDate: '2026-10-10',
    })
  );

  // 1º adiamento
  await executePostponeCharge(store, {
    chargeId: 'chg_multi_01',
    newDueDate: '2026-10-25',
    reason: 'Primeiro acordo',
    operatorId: 'uid_1',
    operatorName: 'Operador A',
    now: '2026-10-12T09:00:00.000Z',
    referenceToday: '2026-10-12',
  });

  // 2º adiamento (após vencer o primeiro)
  await executePostponeCharge(store, {
    chargeId: 'chg_multi_01',
    newDueDate: '2026-11-10',
    operatorId: 'uid_2',
    operatorName: 'Operador B',
    now: '2026-10-26T09:00:00.000Z',
    referenceToday: '2026-10-26',
  });

  const saved = store.charges.get('chg_multi_01') as Charge;
  assert.equal(saved.dueDate, '2026-11-10');
  assert.equal(saved.originalDueDate, '2026-10-10');
  assert.equal(saved.isPostponed, true);
  assert.equal(saved.postponedAt, '2026-10-26T09:00:00.000Z');
  assert.equal(saved.postponementCount, 2);
  assert.equal(saved.postponementHistory?.length, 2);

  const [first, second] = saved.postponementHistory!;
  assert.equal(first.originalDueDate, '2026-10-10');
  assert.equal(first.previousDueDate, '2026-10-10');
  assert.equal(first.newDueDate, '2026-10-25');
  assert.equal(first.reason, 'Primeiro acordo');

  assert.equal(second.originalDueDate, '2026-10-10');
  assert.equal(second.previousDueDate, '2026-10-25');
  assert.equal(second.newDueDate, '2026-11-10');
  assert.equal('reason' in second, false);
});

test('10. Falha segura sem gravação quando faltar campo obrigatório ou violar regra de elegibilidade', async () => {
  const store = new StrictInMemoryFirestoreStore();

  // 10a. chargeId vazio
  await assert.rejects(
    () =>
      executePostponeCharge(store, {
        chargeId: '',
        newDueDate: '2026-11-10',
        referenceToday: '2026-10-15',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'INVALID_CHARGE_ID'
  );

  // 10b. Cobrança inexistente
  await assert.rejects(
    () =>
      executePostponeCharge(store, {
        chargeId: 'chg_inexistente',
        newDueDate: '2026-11-10',
        referenceToday: '2026-10-15',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'CHARGE_NOT_FOUND'
  );

  // 10c. Nova data de calendário inexistente (30 de fevereiro)
  store.seedCharge(makeBaseCharge({ id: 'chg_valid' }));
  await assert.rejects(
    () =>
      executePostponeCharge(store, {
        chargeId: 'chg_valid',
        newDueDate: '2026-02-30',
        referenceToday: '2026-10-15',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'INVALID_NEW_DUE_DATE'
  );

  // 10d. Cobrança sem clientId obrigatório
  store.seedCharge(makeBaseCharge({ id: 'chg_no_client', clientId: '' }));
  await assert.rejects(
    () =>
      executePostponeCharge(store, {
        chargeId: 'chg_no_client',
        newDueDate: '2026-11-10',
        referenceToday: '2026-10-15',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'MISSING_REQUIRED_FIELD'
  );

  // 10e. Cobrança sem clientName obrigatório
  store.seedCharge(makeBaseCharge({ id: 'chg_no_client_name', clientName: '   ' }));
  await assert.rejects(
    () =>
      executePostponeCharge(store, {
        chargeId: 'chg_no_client_name',
        newDueDate: '2026-11-10',
        referenceToday: '2026-10-15',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'MISSING_REQUIRED_FIELD'
  );

  // 10f. Cobrança sem referenceMonth válido
  store.seedCharge(makeBaseCharge({ id: 'chg_no_ref', referenceMonth: '' }));
  await assert.rejects(
    () =>
      executePostponeCharge(store, {
        chargeId: 'chg_no_ref',
        newDueDate: '2026-11-10',
        referenceToday: '2026-10-15',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'MISSING_REQUIRED_FIELD'
  );

  // 10g. Cobrança sem dueDate válido
  store.seedCharge(makeBaseCharge({ id: 'chg_no_due', dueDate: '' }));
  await assert.rejects(
    () =>
      executePostponeCharge(store, {
        chargeId: 'chg_no_due',
        newDueDate: '2026-11-10',
        referenceToday: '2026-10-15',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'MISSING_REQUIRED_FIELD'
  );

  // 10h. Mesma data de vencimento atual
  await assert.rejects(
    () =>
      executePostponeCharge(store, {
        chargeId: 'chg_valid',
        newDueDate: '2026-10-10',
        referenceToday: '2026-10-15',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'SAME_DUE_DATE'
  );

  // 10i. Cobrança já quitada não pode ser adiada
  store.seedCharge(
    makeBaseCharge({
      id: 'chg_paid',
      status: 'pago',
      paidAmount: 79.9,
      remainingBalance: 0,
    })
  );
  await assert.rejects(
    () =>
      executePostponeCharge(store, {
        chargeId: 'chg_paid',
        newDueDate: '2026-11-10',
        referenceToday: '2026-10-15',
      }),
    (err: any) => err instanceof FinancialValidationError && err.code === 'POSTPONE_NOT_ALLOWED'
  );

  // Confirma que NENHUMA escrita foi realizada durante todas as tentativas inválidas
  assert.equal(store.recordedUpdates.length, 0);
  assert.equal((store.charges.get('chg_valid') as Charge).dueDate, '2026-10-10');
});
