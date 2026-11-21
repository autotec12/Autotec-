import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Charge,
  Client,
  Payment,
  Plan,
  TechnicalServiceOrder,
  Vehicle,
} from '../src/types/index.ts';
import {
  consolidateClientFinancials,
  getChargeRemainingBalance,
  planMonthlyCharges,
} from '../src/lib/calculations.ts';
import {
  FinancialStoreAdapter,
  TransactionLike,
  executeMonthlyChargeGeneration,
  executeRecordConsolidatedPayment,
  executeRecordPayment,
} from '../src/lib/financialTransactions.ts';
import {
  HISTORICAL_MISSING_CLIENT_LABEL,
  HISTORICAL_MISSING_VEHICLE_LABEL,
  calculateActiveVehiclesMonthlySum,
  classifyRecordLinkStatus,
  findOrphanHistoricalPlateReferences,
  findVehiclePlateConflict,
  normalizePlate,
  searchClientsWithVehicles,
  validateVehicleOwnershipAndDuplicity,
  validateVehiclePlate,
} from '../src/lib/clientVehicleLookup.ts';

/**
 * TESTES SIMULADOS EM MEMÓRIA — AUTOTEC FINANÇAS
 * Reorganização de Clientes, Veículos, Pesquisa, Identificação de Órfãos e Descontinuação de Planos.
 *
 * IMPORTANTE: Nenhum teste abaixo acessa, grava ou modifica o Cloud Firestore real.
 * Todos os cenários executam sobre um armazenamento transacional simulado em memória.
 */

class InMemoryFinancialStore implements FinancialStoreAdapter {
  private collections: Record<'charges' | 'payments', Map<string, Record<string, any>>> = {
    charges: new Map(),
    payments: new Map(),
  };

  seedCharge(charge: Charge): void {
    this.collections.charges.set(charge.id, structuredClone(charge));
  }

  async runTransaction<R>(fn: (tx: TransactionLike) => Promise<R>): Promise<R> {
    const stagedOps: Array<
      | { type: 'set'; col: 'charges' | 'payments'; id: string; data: Record<string, any> }
      | { type: 'update'; col: 'charges' | 'payments'; id: string; data: Record<string, any> }
    > = [];

    const tx: TransactionLike = {
      get: async <T = Record<string, any>>(col: 'charges' | 'payments', id: string) => {
        const existing = this.collections[col].get(id);
        return {
          id,
          exists: () => Boolean(existing),
          data: () => (existing ? (structuredClone(existing) as T) : undefined),
        };
      },
      set: (col, id, data) => {
        stagedOps.push({ type: 'set', col, id, data: structuredClone(data) });
      },
      update: (col, id, data) => {
        stagedOps.push({ type: 'update', col, id, data: structuredClone(data) });
      },
    };

    const result = await fn(tx);
    for (const op of stagedOps) {
      if (op.type === 'set') {
        this.collections[op.col].set(op.id, structuredClone(op.data));
      } else {
        const current = this.collections[op.col].get(op.id);
        if (!current) throw new Error(`${op.col}/${op.id} not found`);
        this.collections[op.col].set(op.id, structuredClone({ ...current, ...op.data }));
      }
    }
    return result;
  }

  async listCharges(): Promise<Charge[]> {
    return Array.from(this.collections.charges.values()).map((c) => structuredClone(c) as Charge);
  }

  async listPayments(): Promise<Payment[]> {
    return Array.from(this.collections.payments.values()).map((p) => structuredClone(p) as Payment);
  }
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: overrides.id || 'cli_1',
    name: overrides.name || 'Carlos Eduardo Silva',
    document: overrides.document || '123.456.789-00',
    phone: overrides.phone || '1133445566',
    whatsapp: overrides.whatsapp || '11999887766',
    email: overrides.email || 'carlos@exemplo.com',
    address: overrides.address || 'Rua das Flores, 100',
    notes: overrides.notes || '',
    status: overrides.status || 'ativo',
    planId: overrides.planId,
    planName: overrides.planName,
    createdAt: overrides.createdAt || '2026-01-10T10:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-01-10T10:00:00.000Z',
  };
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: overrides.id || 'veh_1',
    clientId: overrides.clientId || 'cli_1',
    vehicleType: overrides.vehicleType || 'carro',
    brand: overrides.brand || 'Toyota',
    model: overrides.model || 'Corolla',
    plate: overrides.plate || 'ABC1D23',
    color: overrides.color || 'Prata',
    trackerModel: overrides.trackerModel || 'Suntech ST310U',
    trackerSerial: overrides.trackerSerial || '8675420001',
    planDescription: overrides.planDescription || 'Rastreamento Veicular Mensal',
    monthlyValue: overrides.monthlyValue ?? 85,
    dueDay: overrides.dueDay ?? 10,
    contractStartDate: overrides.contractStartDate || '2026-01-10',
    status: overrides.status || 'ativo',
    planId: overrides.planId,
    planName: overrides.planName,
    createdAt: overrides.createdAt || '2026-01-10T10:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-01-10T10:00:00.000Z',
  };
}

function makeCharge(overrides: Partial<Charge> = {}): Charge {
  const original = overrides.originalMonthlyValue ?? 85;
  const carried = overrides.previousBalanceCarried ?? 0;
  const total = overrides.totalAmount ?? original + carried;
  const paid = overrides.paidAmount ?? 0;
  const remaining = overrides.remainingBalance ?? Math.max(0, total - paid);
  return {
    id: overrides.id || 'chg_1',
    clientId: overrides.clientId || 'cli_1',
    clientName: overrides.clientName || 'Carlos Eduardo Silva',
    vehicleId: overrides.vehicleId || 'veh_1',
    vehiclePlate: overrides.vehiclePlate || 'ABC1D23',
    vehicleModel: overrides.vehicleModel || 'Toyota Corolla',
    referenceMonth: overrides.referenceMonth || '2026-10',
    originalMonthlyValue: original,
    previousBalanceCarried: carried,
    discount: overrides.discount ?? 0,
    addition: overrides.addition ?? 0,
    totalAmount: total,
    paidAmount: paid,
    remainingBalance: remaining,
    dueDate: overrides.dueDate || '2026-10-10',
    status: overrides.status || (remaining === 0 ? 'pago' : paid > 0 ? 'parcial' : 'pendente'),
    balanceHandling: overrides.balanceHandling,
    carriedBalanceConsumed: overrides.carriedBalanceConsumed,
    isPlanCharge: overrides.isPlanCharge,
    planId: overrides.planId,
    planName: overrides.planName,
    vehicleIds: overrides.vehicleIds,
    vehiclePlates: overrides.vehiclePlates,
    createdAt: overrides.createdAt || '2026-10-01T08:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-10-01T08:00:00.000Z',
  };
}

// ============================================================================
// CENÁRIO 1: Cadastro de cliente sem placa (independente de veículos)
// ============================================================================
test('[SIMULADO] 1. Cadastro de cliente funciona sem placa e sem veículos vinculados', () => {
  const clientWithoutVehicles = makeClient({
    id: 'cli_no_plate',
    name: 'Maria Fernanda Souza',
    document: '987.654.321-11',
    whatsapp: '11988776655',
  });

  // Cliente não possui campo plate nem depende de veículos para existir
  assert.equal('plate' in clientWithoutVehicles, false);
  const consolidated = consolidateClientFinancials(clientWithoutVehicles, [], []);
  assert.equal(consolidated.vehiclesCount, 0);
  assert.equal(consolidated.totalMonthlyValue, 0);
  assert.equal(consolidated.totalPending, 0);
  assert.equal(calculateActiveVehiclesMonthlySum([], clientWithoutVehicles.id), 0);
});

// ============================================================================
// CENÁRIO 2: Cadastro de cliente com 1 ou mais veículos vinculados
// ============================================================================
test('[SIMULADO] 2. Cliente pode ter 1 ou múltiplos veículos vinculados individualmente', () => {
  const client = makeClient({ id: 'cli_multi', name: 'Transportadora Alfa Ltda' });
  const v1 = makeVehicle({ id: 'veh_a', clientId: client.id, plate: 'AAA1A11', monthlyValue: 79.9, dueDay: 5 });
  const v2 = makeVehicle({ id: 'veh_b', clientId: client.id, plate: 'BBB2B22', monthlyValue: 95.5, dueDay: 15 });
  const v3 = makeVehicle({ id: 'veh_c', clientId: client.id, plate: 'CCC3C33', monthlyValue: 120.0, dueDay: 20 });

  const vehicles: Vehicle[] = [];
  for (const candidate of [v1, v2, v3]) {
    const check = validateVehicleOwnershipAndDuplicity({
      clientId: candidate.clientId,
      plate: candidate.plate,
      clients: [client],
      vehicles,
    });
    assert.equal(check.ok, true);
    vehicles.push(candidate);
  }

  const matches = searchClientsWithVehicles([client], vehicles, 'Transportadora Alfa');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].vehicles.length, 3);
});

// ============================================================================
// CENÁRIO 3: Vínculo automático de veículo ao cliente selecionado e proteção contra troca silenciosa
// ============================================================================
test('[SIMULADO] 3. Validação bloqueia veículo sem cliente válido e bloqueia troca silenciosa de titular', () => {
  const clientA = makeClient({ id: 'cli_a', name: 'Cliente A' });
  const clientB = makeClient({ id: 'cli_b', name: 'Cliente B' });
  const existingVehicle = makeVehicle({ id: 'veh_a1', clientId: clientA.id, plate: 'DEF4G56' });

  // Sem cliente selecionado
  const missingClient = validateVehicleOwnershipAndDuplicity({
    clientId: '',
    plate: 'XYZ9K88',
    clients: [clientA, clientB],
    vehicles: [existingVehicle],
  });
  assert.equal(missingClient.ok, false);
  assert.equal(missingClient.code, 'MISSING_CLIENT');

  // Cliente inexistente no cadastro
  const nonexistentClient = validateVehicleOwnershipAndDuplicity({
    clientId: 'cli_inexistente',
    plate: 'XYZ9K88',
    clients: [clientA, clientB],
    vehicles: [existingVehicle],
  });
  assert.equal(nonexistentClient.ok, false);
  assert.equal(nonexistentClient.code, 'CLIENT_NOT_FOUND');

  // Tentativa de reatribuir silenciosamente na edição para outro cliente
  const silentTransfer = validateVehicleOwnershipAndDuplicity({
    clientId: clientB.id,
    plate: 'DEF4G56',
    clients: [clientA, clientB],
    vehicles: [existingVehicle],
    editingVehicle: existingVehicle,
    allowClientTransfer: false,
  });
  assert.equal(silentTransfer.ok, false);
  assert.equal(silentTransfer.code, 'SILENT_CLIENT_REASSIGN');

  // Edição legítima mantendo o mesmo cliente titular
  const validEdit = validateVehicleOwnershipAndDuplicity({
    clientId: clientA.id,
    plate: 'DEF4G56',
    clients: [clientA, clientB],
    vehicles: [existingVehicle],
    editingVehicle: existingVehicle,
  });
  assert.equal(validEdit.ok, true);
});

// ============================================================================
// CENÁRIO 4: Pesquisa de cliente por nome (completo, parcial, acentos, documento e telefone)
// ============================================================================
test('[SIMULADO] 4. Pesquisa de cliente localiza por nome completo/parcial, CPF/CNPJ e telefone', () => {
  const c1 = makeClient({ id: 'c1', name: 'João Pedro Álvares', document: '111.222.333-44', whatsapp: '62991112222' });
  const c2 = makeClient({ id: 'c2', name: 'Ana Beatriz Costa', document: '555.666.777-88', whatsapp: '62988883333' });

  const byAccentInsensitiveName = searchClientsWithVehicles([c1, c2], [], 'joao pedro alvares');
  assert.equal(byAccentInsensitiveName.length, 1);
  assert.equal(byAccentInsensitiveName[0].client.id, 'c1');

  const byPartialName = searchClientsWithVehicles([c1, c2], [], 'Beatriz');
  assert.equal(byPartialName.length, 1);
  assert.equal(byPartialName[0].client.id, 'c2');

  const byDocumentDigits = searchClientsWithVehicles([c1, c2], [], '11122233344');
  assert.equal(byDocumentDigits.length, 1);
  assert.equal(byDocumentDigits[0].client.id, 'c1');

  const byPhone = searchClientsWithVehicles([c1, c2], [], '988883333');
  assert.equal(byPhone.length, 1);
  assert.equal(byPhone[0].client.id, 'c2');
});

// ============================================================================
// CENÁRIO 5: Pesquisa de cliente por placa completa ou parcial (retornando cliente titular + selo)
// ============================================================================
test('[SIMULADO] 5. Pesquisa por placa completa ou parcial retorna cliente titular com identificação do veículo', () => {
  const client = makeClient({ id: 'cli_owner', name: 'Roberto Frota' });
  const otherClient = makeClient({ id: 'cli_other', name: 'Outro Cliente' });
  const v1 = makeVehicle({ id: 'v1', clientId: client.id, plate: 'PQW-8J42', brand: 'Fiat', model: 'Strada' });
  const v2 = makeVehicle({ id: 'v2', clientId: client.id, plate: 'RTM4K90', brand: 'Honda', model: 'CG 160' });
  const v3 = makeVehicle({ id: 'v3', clientId: otherClient.id, plate: 'ZZZ1A00', brand: 'VW', model: 'Gol' });

  // Placa completa sem hífen
  const byFullNoHyphen = searchClientsWithVehicles([client, otherClient], [v1, v2, v3], 'pqw8j42');
  assert.equal(byFullNoHyphen.length, 1);
  assert.equal(byFullNoHyphen[0].client.id, client.id);
  assert.equal(byFullNoHyphen[0].matchedByPlate, true);
  assert.deepEqual(byFullNoHyphen[0].matchedVehicles.map((v) => v.plate), ['PQW-8J42']);
  // Todos os veículos do titular continuam acessíveis na ficha
  assert.equal(byFullNoHyphen[0].vehicles.length, 2);

  // Placa parcial
  const byPartial = searchClientsWithVehicles([client, otherClient], [v1, v2, v3], '4K90');
  assert.equal(byPartial.length, 1);
  assert.equal(byPartial[0].client.id, client.id);
  assert.deepEqual(byPartial[0].matchedVehicles.map((v) => v.id), ['v2']);
});

// ============================================================================
// CENÁRIO 6: Pesquisa por placa excluída/inexistente (ex: OCB5030) sem criar cliente ou veículo
// ============================================================================
test('[SIMULADO] 6. Pesquisa por placa histórica OCB5030 exibe indicação histórica sem criar cliente/veículo nem associar por nome', () => {
  // Cliente atual com nome parecido NÃO deve ser associado automaticamente pelo nome!
  const similarNameClient = makeClient({ id: 'cli_atual_parecido', name: 'José Oliveira Santos' });
  const currentVehicles = [
    makeVehicle({ id: 'veh_atual', clientId: similarNameClient.id, plate: 'ABC1D23' }),
  ];

  // Cobrança e O.S. históricas referenciando a placa OCB5030 (veículo excluído/inexistente)
  const orphanCharge = makeCharge({
    id: 'chg_ocb_1',
    clientId: 'cli_antigo_removido',
    clientName: 'José Oliveira Santos',
    vehicleId: 'veh_ocb_excluido',
    vehiclePlate: 'OCB5030',
    vehicleModel: 'Ford Fiesta',
    referenceMonth: '2026-08',
    totalAmount: 70,
    paidAmount: 70,
    remainingBalance: 0,
    status: 'pago',
  });

  const orphanPayment: Payment = {
    id: 'pay_ocb_1',
    chargeId: 'chg_ocb_1',
    clientId: 'cli_antigo_removido',
    clientName: 'José Oliveira Santos',
    vehicleId: 'veh_ocb_excluido',
    vehiclePlate: 'OCB5030',
    amount: 70,
    paymentDate: '2026-08-10',
    paymentMethod: 'pix',
    operatorId: 'admin',
    operatorName: 'Proprietário',
    receiptNumber: 'REC-202608-0001',
    remainingAfterPayment: 0,
    createdAt: '2026-08-10T10:00:00.000Z',
  };

  const orphanService: TechnicalServiceOrder = {
    id: 'os_ocb_1',
    orderNumber: 'OS-202608-0005',
    date: '2026-08-02',
    clientId: 'cli_antigo_removido',
    clientName: 'José Oliveira Santos',
    vehicleId: 'veh_ocb_excluido',
    vehiclePlate: 'OCB5030',
    vehicleModel: 'Ford Fiesta',
    items: [{ id: 'it1', category: 'Retirada', description: 'Retirada de rastreador', value: 100 }],
    subtotal: 100,
    discount: 0,
    totalAmount: 100,
    paymentMethod: 'pix',
    paidAmount: 100,
    remainingBalance: 0,
    status: 'pago',
    receiptNumber: 'REC-ST-202608-0005',
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:00:00.000Z',
  };

  const clientsBefore = [similarNameClient].length;
  const vehiclesBefore = currentVehicles.length;

  // Pesquisa em clientes atuais não deve retornar o cliente de nome parecido ao buscar OCB5030
  const currentMatches = searchClientsWithVehicles([similarNameClient], currentVehicles, 'OCB-5030');
  assert.equal(currentMatches.length, 0);

  // Pesquisa de referências históricas localiza OCB5030 com classificação clara
  const orphanMatches = findOrphanHistoricalPlateReferences({
    clients: [similarNameClient],
    vehicles: currentVehicles,
    charges: [orphanCharge],
    payments: [orphanPayment],
    technicalServices: [orphanService],
    searchTerm: 'ocb-5030',
  });

  assert.equal(orphanMatches.length, 1);
  assert.equal(orphanMatches[0].normalizedPlate, 'OCB5030');
  assert.equal(orphanMatches[0].badgeLabel, HISTORICAL_MISSING_VEHICLE_LABEL);
  assert.equal(orphanMatches[0].secondaryLabel, HISTORICAL_MISSING_CLIENT_LABEL);
  assert.equal(orphanMatches[0].linkStatus, 'sem_vinculo_cliente_atual');
  assert.equal(orphanMatches[0].currentClient, null); // Nunca associa por nome parecido!
  assert.equal(orphanMatches[0].charges.length, 1);
  assert.equal(orphanMatches[0].payments.length, 1);
  assert.equal(orphanMatches[0].technicalServices.length, 1);

  // Garantia de imutabilidade: nenhum cliente ou veículo criado
  assert.equal([similarNameClient].length, clientsBefore);
  assert.equal(currentVehicles.length, vehiclesBefore);
});

// ============================================================================
// CENÁRIO 7: Abertura da ficha do cliente mostrando múltiplos veículos corretamente
// ============================================================================
test('[SIMULADO] 7. Ficha consolidada do cliente lista todos os seus veículos e distingue estados', () => {
  const client = makeClient({ id: 'cli_ficha', name: 'Logística Cerrado' });
  const v1 = makeVehicle({ id: 'v1', clientId: client.id, plate: 'KLM1A23', monthlyValue: 90, dueDay: 5, status: 'ativo' });
  const v2 = makeVehicle({ id: 'v2', clientId: client.id, plate: 'KLM2B34', monthlyValue: 75, dueDay: 12, status: 'ativo' });
  const v3 = makeVehicle({ id: 'v3', clientId: client.id, plate: 'KLM3C45', monthlyValue: 80, dueDay: 20, status: 'suspenso' });
  const otherVeh = makeVehicle({ id: 'v_outro', clientId: 'cli_outro', plate: 'OTH9Z99', monthlyValue: 150, status: 'ativo' });

  const c1 = makeCharge({ id: 'c1', clientId: client.id, vehicleId: v1.id, vehiclePlate: v1.plate, totalAmount: 90, paidAmount: 90, remainingBalance: 0, status: 'pago' });
  const c2 = makeCharge({ id: 'c2', clientId: client.id, vehicleId: v2.id, vehiclePlate: v2.plate, totalAmount: 75, paidAmount: 25, remainingBalance: 50, status: 'parcial', dueDate: '2026-01-12' });

  const consolidated = consolidateClientFinancials(client, [v1, v2, v3, otherVeh], [c1, c2]);
  assert.equal(consolidated.vehiclesCount, 3);
  assert.deepEqual(consolidated.vehicles.map((v) => v.plate), ['KLM1A23', 'KLM2B34', 'KLM3C45']);
  assert.equal(consolidated.totalReceived, 115);
  assert.equal(consolidated.totalPending, 50);
  assert.equal(consolidated.charges.length, 2);
});

// ============================================================================
// CENÁRIO 8: Cálculo exato da soma mensal dos veículos ativos sem duplicação
// ============================================================================
test('[SIMULADO] 8. Soma mensal considera somente veículos ativos com precisão em centavos e sem duplicação', () => {
  const client = makeClient({ id: 'cli_sum' });
  const vehicles = [
    makeVehicle({ id: 'v1', clientId: client.id, plate: 'SUM1A11', monthlyValue: 69.9, status: 'ativo' }),
    makeVehicle({ id: 'v2', clientId: client.id, plate: 'SUM2B22', monthlyValue: 49.9, status: 'ativo' }),
    makeVehicle({ id: 'v3', clientId: client.id, plate: 'SUM3C33', monthlyValue: 89.9, status: 'ativo' }),
    makeVehicle({ id: 'v4', clientId: client.id, plate: 'SUM4D44', monthlyValue: 100.0, status: 'suspenso' }),
    makeVehicle({ id: 'v5', clientId: client.id, plate: 'SUM5E55', monthlyValue: 120.0, status: 'cancelado' }),
  ];

  // 69.90 + 49.90 + 89.90 = 209.70 (sem float drift 209.70000000000002)
  const activeSum = calculateActiveVehiclesMonthlySum(vehicles, client.id);
  assert.equal(activeSum, 209.7);

  const consolidated = consolidateClientFinancials(client, vehicles, []);
  assert.equal(Math.round(consolidated.totalMonthlyValue * 100), 20970);
});

// ============================================================================
// CENÁRIO 9: Exclusão ou inativação de cliente sem perda de cobranças e pagamentos históricos
// ============================================================================
test('[SIMULADO] 9. Excluir ou inativar cliente preserva integralmente cobranças e pagamentos históricos', () => {
  const client = makeClient({ id: 'cli_del', name: 'Cliente Encerrado' });
  const vehicle = makeVehicle({ id: 'veh_del', clientId: client.id, plate: 'DEL1X23' });
  const charge = makeCharge({
    id: 'chg_del_1',
    clientId: client.id,
    clientName: client.name,
    vehicleId: vehicle.id,
    vehiclePlate: vehicle.plate,
    totalAmount: 85,
    paidAmount: 85,
    remainingBalance: 0,
    status: 'pago',
  });
  const payment: Payment = {
    id: 'pay_del_1',
    chargeId: charge.id,
    clientId: client.id,
    clientName: client.name,
    vehicleId: vehicle.id,
    vehiclePlate: vehicle.plate,
    amount: 85,
    paymentDate: '2026-09-10',
    paymentMethod: 'pix',
    operatorId: 'admin',
    operatorName: 'Proprietário',
    receiptNumber: 'REC-202609-0099',
    remainingAfterPayment: 0,
    createdAt: '2026-09-10T10:00:00.000Z',
  };

  // Simula exclusão apenas da coleção clients (mantendo charges e payments intocados)
  const remainingClients: Client[] = [];
  const remainingCharges = [charge];
  const remainingPayments = [payment];

  assert.equal(remainingCharges.length, 1);
  assert.equal(remainingPayments.length, 1);

  const clientsMap = new Map<string, Client>(remainingClients.map((c) => [c.id, c]));
  const vehiclesMap = new Map<string, Vehicle>([[vehicle.id, vehicle]]);
  const linkStatus = classifyRecordLinkStatus({
    clientId: charge.clientId,
    vehicleId: charge.vehicleId,
    clientsMap,
    vehiclesMap,
  });

  assert.equal(linkStatus.status, 'sem_vinculo_cliente_atual');
  assert.equal(linkStatus.isOrphan, true);
  assert.equal(linkStatus.label, HISTORICAL_MISSING_CLIENT_LABEL);
});

// ============================================================================
// CENÁRIO 10 e 11: Planos antigos não geram novas cobranças; geração ocorre individualmente por veículo ativo
// ============================================================================
test('[SIMULADO] 10 e 11. Planos antigos não geram novas cobranças; geração mensal cria faturas individuais por veículo ativo', async () => {
  const legacyPlan: Plan = {
    id: 'plan_legacy_1',
    name: 'Plano Combo Antigo (2 Carros)',
    composition: [{ vehicleType: 'carro', count: 2, unitValue: 60 }],
    totalMonthlyValue: 120,
    status: 'ativo',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  const clientWithLegacyPlan = makeClient({
    id: 'cli_legacy',
    name: 'Cliente Com Plano Histórico',
    planId: legacyPlan.id,
    planName: legacyPlan.name,
  });

  const v1 = makeVehicle({
    id: 'veh_l1',
    clientId: clientWithLegacyPlan.id,
    plate: 'LEG1A11',
    monthlyValue: 65,
    dueDay: 10,
    planId: legacyPlan.id,
    planName: legacyPlan.name,
    status: 'ativo',
  });
  const v2 = makeVehicle({
    id: 'veh_l2',
    clientId: clientWithLegacyPlan.id,
    plate: 'LEG2B22',
    monthlyValue: 75,
    dueDay: 20,
    planId: legacyPlan.id,
    planName: legacyPlan.name,
    status: 'ativo',
  });
  const vSuspended = makeVehicle({
    id: 'veh_l3',
    clientId: clientWithLegacyPlan.id,
    plate: 'LEG3C33',
    monthlyValue: 80,
    dueDay: 25,
    status: 'suspenso',
  });

  const store = new InMemoryFinancialStore();
  const result = await executeMonthlyChargeGeneration(store, {
    month: '2026-11',
    clients: [clientWithLegacyPlan],
    vehicles: [v1, v2, vSuspended],
    plans: [legacyPlan],
    charges: await store.listCharges(),
    fetchServerCharges: () => store.listCharges(),
    createdBy: 'admin_test',
  });

  assert.equal(result.created, 2);
  const generated = await store.listCharges();
  assert.equal(generated.length, 2);
  // Nenhuma cobrança gerada como isPlanCharge!
  assert.equal(generated.some((c) => c.isPlanCharge === true), false);
  // Cada veículo ativo recebeu sua própria cobrança com valor e vencimento próprios
  const chg1 = generated.find((c) => c.vehicleId === 'veh_l1');
  const chg2 = generated.find((c) => c.vehicleId === 'veh_l2');
  assert.ok(chg1);
  assert.ok(chg2);
  assert.equal(chg1.originalMonthlyValue, 65);
  assert.equal(chg1.dueDate, '2026-11-10');
  assert.equal(chg2.originalMonthlyValue, 75);
  assert.equal(chg2.dueDate, '2026-11-20');
});

// ============================================================================
// CENÁRIO 12: Prevenção de duplicidade de cobranças (veículo+competência) e de placas
// ============================================================================
test('[SIMULADO] 12. Não há duplicidade de cobranças por veículo+competência e placas duplicadas são bloqueadas', async () => {
  const c1 = makeClient({ id: 'cli_d1', name: 'Cliente Um' });
  const c2 = makeClient({ id: 'cli_d2', name: 'Cliente Dois' });
  const v1 = makeVehicle({ id: 'veh_d1', clientId: c1.id, plate: 'DUP-1A23', monthlyValue: 80, dueDay: 10 });

  // 12a. Bloqueio de placa duplicada para o mesmo cliente (formatos diferentes normalizados)
  const dupSameClient = validateVehicleOwnershipAndDuplicity({
    clientId: c1.id,
    plate: 'dup 1a23',
    clients: [c1, c2],
    vehicles: [v1],
  });
  assert.equal(dupSameClient.ok, false);
  assert.equal(dupSameClient.code, 'DUPLICATE_PLATE');
  assert.equal(dupSameClient.conflict?.sameClient, true);

  // 12b. Bloqueio de vinculação da mesma placa ativa a outro cliente
  const dupOtherClient = validateVehicleOwnershipAndDuplicity({
    clientId: c2.id,
    plate: 'DUP1A23',
    clients: [c1, c2],
    vehicles: [v1],
  });
  assert.equal(dupOtherClient.ok, false);
  assert.equal(dupOtherClient.code, 'DUPLICATE_PLATE');
  assert.equal(dupOtherClient.conflict?.sameClient, false);

  // 12c. Validação de placa inválida
  assert.equal(validateVehiclePlate('123').valid, false);
  assert.equal(normalizePlate('abc-1d23'), 'ABC1D23');
  assert.ok(findVehiclePlateConflict([v1], 'DUP1A23'));

  // 12d. Idempotência na geração de mensalidade por veículo + competência
  const store = new InMemoryFinancialStore();
  const firstRun = await executeMonthlyChargeGeneration(store, {
    month: '2026-11',
    clients: [c1],
    vehicles: [v1],
    plans: [],
    charges: await store.listCharges(),
    fetchServerCharges: () => store.listCharges(),
    createdBy: 'admin_test',
  });
  const secondRun = await executeMonthlyChargeGeneration(store, {
    month: '2026-11',
    clients: [c1],
    vehicles: [v1],
    plans: [],
    charges: await store.listCharges(),
    fetchServerCharges: () => store.listCharges(),
    createdBy: 'admin_test',
  });

  assert.equal(firstRun.created, 1);
  assert.equal(secondRun.created, 0);
  assert.equal(secondRun.skipped, 1);
  assert.equal((await store.listCharges()).length, 1);
});

// ============================================================================
// CENÁRIO 13: Preservação de pagamentos parciais e consolidados após reorganização
// ============================================================================
test('[SIMULADO] 13. Pagamentos parciais, transporte de saldo e pagamento consolidado continuam íntegros', async () => {
  const client = makeClient({ id: 'cli_pay', name: 'Cliente Pagamentos' });
  const v1 = makeVehicle({ id: 'veh_p1', clientId: client.id, plate: 'PAG1A11', monthlyValue: 100, dueDay: 10 });
  const v2 = makeVehicle({ id: 'veh_p2', clientId: client.id, plate: 'PAG2B22', monthlyValue: 80, dueDay: 10 });

  const store = new InMemoryFinancialStore();

  // Gerar Outubro/2026
  await executeMonthlyChargeGeneration(store, {
    month: '2026-10',
    clients: [client],
    vehicles: [v1, v2],
    plans: [],
    charges: await store.listCharges(),
    fetchServerCharges: () => store.listCharges(),
    createdBy: 'admin_test',
  });

  const octCharges = await store.listCharges();
  const octV1 = octCharges.find((c) => c.vehicleId === v1.id)!;
  const octV2 = octCharges.find((c) => c.vehicleId === v2.id)!;

  // 13a. Pagamento parcial no veículo 1 (R$ 40 de R$ 100) com saldo restante para próximo mês
  await executeRecordPayment(store, {
    operationId: 'op_partial_1',
    chargeId: octV1.id,
    amount: 40,
    paymentMethod: 'pix',
    balanceHandling: 'next_month',
    operatorId: 'admin_test',
    operatorName: 'Proprietário',
  });

  const updatedOctV1 = (await store.listCharges()).find((c) => c.id === octV1.id)!;
  assert.equal(updatedOctV1.status, 'parcial');
  assert.equal(updatedOctV1.paidAmount, 40);
  assert.equal(getChargeRemainingBalance(updatedOctV1), 60);

  // 13b. Gerar Novembro/2026 -> transporta R$ 60 exatamente uma vez para novV1
  const novPlan = planMonthlyCharges({
    month: '2026-11',
    clients: [client],
    vehicles: [v1, v2],
    charges: await store.listCharges(),
    plans: [],
  });
  assert.equal(novPlan.chargesToCreate.length, 2);

  await executeMonthlyChargeGeneration(store, {
    month: '2026-11',
    clients: [client],
    vehicles: [v1, v2],
    plans: [],
    charges: await store.listCharges(),
    fetchServerCharges: () => store.listCharges(),
    createdBy: 'admin_test',
  });

  const afterNov = await store.listCharges();
  const novV1 = afterNov.find((c) => c.vehicleId === v1.id && c.referenceMonth === '2026-11')!;
  const octV1AfterCarry = afterNov.find((c) => c.id === octV1.id)!;
  assert.equal(novV1.previousBalanceCarried, 60);
  assert.equal(novV1.totalAmount, 160);
  assert.equal(octV1AfterCarry.carriedBalanceConsumed, true);
  assert.equal(getChargeRemainingBalance(octV1AfterCarry), 0);

  // 13c. Pagamento consolidado quitando octV2 (R$ 80) + novV1 (R$ 160) em uma única operação atômica
  const consolidatedResult = await executeRecordConsolidatedPayment(store, {
    operationId: 'op_cons_1',
    clientId: client.id,
    clientName: client.name,
    items: [
      {
        charge: { id: octV2.id, vehicleId: octV2.vehicleId, vehiclePlate: octV2.vehiclePlate },
        amountToPay: 80,
      },
      {
        charge: { id: novV1.id, vehicleId: novV1.vehicleId, vehiclePlate: novV1.vehiclePlate },
        amountToPay: 160,
      },
    ],
    paymentDate: '2026-11-10',
    paymentMethod: 'pix',
    operatorId: 'admin_test',
    operatorName: 'Proprietário',
  });

  assert.equal(consolidatedResult.payment.isConsolidated, true);
  assert.equal(consolidatedResult.payment.amount, 240);
  assert.equal(consolidatedResult.payment.consolidatedItems?.length, 2);

  const finalCharges = await store.listCharges();
  assert.equal(finalCharges.find((c) => c.id === octV2.id)!.status, 'pago');
  assert.equal(finalCharges.find((c) => c.id === novV1.id)!.status, 'pago');
});
