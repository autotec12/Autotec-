import { Charge, Client, Payment, TechnicalServiceOrder, Vehicle } from '../types';
import { getChargeRemainingBalance } from './calculations';

export const HISTORICAL_MISSING_VEHICLE_LABEL =
  'REGISTRO HISTÓRICO — VEÍCULO NÃO ENCONTRADO NO CADASTRO ATUAL';

export const HISTORICAL_MISSING_CLIENT_LABEL =
  'REGISTRO HISTÓRICO — SEM VÍNCULO COM CLIENTE ATUAL';

export type HistoricalLinkStatus =
  | 'cadastrado_vinculado'
  | 'veiculo_historico_excluido'
  | 'referencia_veiculo_inexistente'
  | 'sem_vinculo_cliente_atual';

export interface PlateValidationResult {
  valid: boolean;
  normalized: string;
  formatted: string;
  error?: string;
}

export interface VehiclePlateConflict {
  vehicle: Vehicle;
  normalizedPlate: string;
  sameClient: boolean;
  ownerClientName: string;
  message: string;
}

export interface VehicleOwnershipValidationResult {
  ok: boolean;
  error?: string;
  code?: 'MISSING_CLIENT' | 'CLIENT_NOT_FOUND' | 'SILENT_CLIENT_REASSIGN' | 'INVALID_PLATE' | 'DUPLICATE_PLATE';
  normalizedPlate?: string;
  formattedPlate?: string;
  ownerClient?: Client;
  conflict?: VehiclePlateConflict;
}

export interface RecordLinkClassification {
  status: HistoricalLinkStatus;
  vehicleExists: boolean;
  clientExists: boolean;
  isOrphan: boolean;
  label: string | null;
  secondaryLabel: string | null;
}

export interface ClientVehicleSearchMatch {
  client: Client;
  vehicles: Vehicle[];
  matchedVehicles: Vehicle[];
  matchedByPlate: boolean;
  matchedByClientData: boolean;
}

export interface OrphanHistoricalReferenceGroup {
  key: string;
  normalizedPlate: string;
  displayPlate: string;
  vehicleModel: string;
  vehicleId: string;
  clientId: string;
  recordedClientName: string;
  currentClient: Client | null;
  linkStatus: HistoricalLinkStatus;
  badgeLabel: string;
  secondaryLabel: string | null;
  charges: Charge[];
  payments: Payment[];
  technicalServices: TechnicalServiceOrder[];
  totalBilled: number;
  totalPaid: number;
  totalRemaining: number;
}

/**
 * Normalizes text for accent-insensitive, case-insensitive comparison.
 */
export function normalizeSearchText(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Extracts only numeric digits (useful for CPF/CNPJ and phone matching).
 */
export function normalizeDigits(value?: string | null): string {
  return (value || '').replace(/\D+/g, '');
}

/**
 * Normalizes a vehicle plate for comparison (uppercase, removing hyphens, spaces, and symbols).
 * Examples: "ocb-5030" -> "OCB5030", "ABC 1D23" -> "ABC1D23".
 */
export function normalizePlate(plate?: string | null): string {
  return (plate || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Formats a plate cleanly for storage (uppercase, trimmed, no extra internal spaces).
 */
export function formatPlateForStorage(plate: string): string {
  return (plate || '').toUpperCase().trim().replace(/\s+/g, '');
}

/**
 * Validates a vehicle plate before saving.
 * Accepts standard Brazilian old plates (ABC1234), Mercosul (ABC1D23), and valid alphanumeric identifiers (5-8 chars).
 */
export function validateVehiclePlate(plate: string): PlateValidationResult {
  const formatted = formatPlateForStorage(plate);
  const normalized = normalizePlate(plate);

  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      formatted: '',
      error: 'A placa do veículo é obrigatória para identificação.',
    };
  }

  if (normalized.length < 5 || normalized.length > 8) {
    return {
      valid: false,
      normalized,
      formatted,
      error: 'Informe uma placa válida (ex: ABC1D23 ou ABC-1234).',
    };
  }

  const hasLetter = /[A-Z]/.test(normalized);
  const hasDigit = /[0-9]/.test(normalized);
  if (!hasLetter || !hasDigit) {
    return {
      valid: false,
      normalized,
      formatted,
      error: 'A placa deve conter letras e números válidos (ex: ABC1D23 ou ABC-1234).',
    };
  }

  return {
    valid: true,
    normalized,
    formatted,
  };
}

/**
 * Checks whether a normalized plate already exists in the vehicles collection.
 * Prevents duplicate plates within the same client or silent linking to another client.
 */
export function findVehiclePlateConflict(
  vehicles: Vehicle[],
  plate: string,
  options?: {
    excludeVehicleId?: string;
    targetClientId?: string;
    clients?: Client[];
  }
): VehiclePlateConflict | null {
  const normalized = normalizePlate(plate);
  if (!normalized) return null;

  const excludeId = options?.excludeVehicleId;
  const matching = vehicles.filter(
    (v) => v.id !== excludeId && normalizePlate(v.plate) === normalized
  );

  if (matching.length === 0) return null;

  // Prefer active conflict if multiple historical duplicates already exist
  const conflictVehicle = matching.find((v) => v.status === 'ativo') || matching[0];
  const sameClient = Boolean(
    options?.targetClientId && conflictVehicle.clientId === options.targetClientId
  );

  const ownerClient = options?.clients?.find((c) => c.id === conflictVehicle.clientId);
  const ownerClientName = ownerClient?.name || 'Cliente não localizado no cadastro atual';

  const message = sameClient
    ? `A placa ${normalized} já está cadastrada para este cliente (${conflictVehicle.brand} ${conflictVehicle.model} — status: ${conflictVehicle.status}). Edite o veículo existente em vez de duplicar o cadastro.`
    : `A placa ${normalized} já está cadastrada e vinculada ao cliente "${ownerClientName}" (status: ${conflictVehicle.status}). Não é permitido duplicar a placa nem vinculá-la silenciosamente a outro cliente.`;

  return {
    vehicle: conflictVehicle,
    normalizedPlate: normalized,
    sameClient,
    ownerClientName,
    message,
  };
}

/**
 * Pure validation guard for adding or updating a vehicle.
 * Guarantees:
 * 1) Vehicle always belongs to an existing clientId in clients.
 * 2) Editing a vehicle cannot silently reassign it to another client.
 * 3) Plate format is valid.
 * 4) Plate does not duplicate an existing vehicle plate.
 */
export function validateVehicleOwnershipAndDuplicity(params: {
  clientId: string;
  plate: string;
  clients: Client[];
  vehicles: Vehicle[];
  editingVehicle?: Vehicle | null;
  allowClientTransfer?: boolean;
}): VehicleOwnershipValidationResult {
  const { clientId, plate, clients, vehicles, editingVehicle, allowClientTransfer = false } = params;

  if (!clientId || !clientId.trim()) {
    return {
      ok: false,
      code: 'MISSING_CLIENT',
      error: 'Selecione um cliente cadastrado antes de salvar o veículo.',
    };
  }

  const ownerClient = clients.find((c) => c.id === clientId);
  if (!ownerClient) {
    return {
      ok: false,
      code: 'CLIENT_NOT_FOUND',
      error: 'O cliente selecionado não foi encontrado no cadastro atual. Cadastre ou selecione um cliente válido.',
    };
  }

  if (editingVehicle && editingVehicle.clientId && editingVehicle.clientId !== clientId && !allowClientTransfer) {
    const previousOwner = clients.find((c) => c.id === editingVehicle.clientId);
    const prevName = previousOwner?.name || editingVehicle.clientId;
    return {
      ok: false,
      code: 'SILENT_CLIENT_REASSIGN',
      error: `Este veículo está vinculado ao cliente "${prevName}". Não é permitido transferir silenciosamente a titularidade durante a edição.`,
    };
  }

  const plateCheck = validateVehiclePlate(plate);
  if (!plateCheck.valid) {
    return {
      ok: false,
      code: 'INVALID_PLATE',
      error: plateCheck.error,
    };
  }

  const conflict = findVehiclePlateConflict(vehicles, plateCheck.formatted, {
    excludeVehicleId: editingVehicle?.id,
    targetClientId: clientId,
    clients,
  });

  if (conflict) {
    return {
      ok: false,
      code: 'DUPLICATE_PLATE',
      error: conflict.message,
      conflict,
    };
  }

  return {
    ok: true,
    normalizedPlate: plateCheck.normalized,
    formattedPlate: plateCheck.formatted,
    ownerClient,
  };
}

/**
 * Classifies a charge, payment, or technical service order into one of the 4 explicit states:
 * 1) cadastrado_vinculado
 * 2) veiculo_historico_excluido
 * 3) referencia_veiculo_inexistente
 * 4) sem_vinculo_cliente_atual
 *
 * Strictly checks IDs in clientsMap and vehiclesMap. NEVER matches by similar names.
 */
export function classifyRecordLinkStatus(params: {
  clientId?: string;
  vehicleId?: string;
  isPlanCharge?: boolean;
  vehicleIds?: string[];
  clientsMap: Map<string, Client>;
  vehiclesMap: Map<string, Vehicle>;
}): RecordLinkClassification {
  const { clientId, vehicleId, isPlanCharge, vehicleIds, clientsMap, vehiclesMap } = params;

  const clientExists = Boolean(clientId && clientsMap.has(clientId));

  let vehicleExists = false;
  if (isPlanCharge && Array.isArray(vehicleIds) && vehicleIds.length > 0) {
    vehicleExists = vehicleIds.every((vid) => vehiclesMap.has(vid));
  } else if (vehicleId) {
    vehicleExists = vehiclesMap.has(vehicleId);
  }

  if (!clientExists && !vehicleExists) {
    return {
      status: 'sem_vinculo_cliente_atual',
      vehicleExists: false,
      clientExists: false,
      isOrphan: true,
      label: HISTORICAL_MISSING_VEHICLE_LABEL,
      secondaryLabel: HISTORICAL_MISSING_CLIENT_LABEL,
    };
  }

  if (!clientExists && vehicleExists) {
    return {
      status: 'sem_vinculo_cliente_atual',
      vehicleExists: true,
      clientExists: false,
      isOrphan: true,
      label: HISTORICAL_MISSING_CLIENT_LABEL,
      secondaryLabel: null,
    };
  }

  if (clientExists && !vehicleExists) {
    // Distinguish explicit deleted vehicle ID vs missing/empty/unreferenced vehicle ID
    const hasExplicitVehicleId = Boolean(vehicleId && vehicleId.trim() && !isPlanCharge);
    return {
      status: hasExplicitVehicleId ? 'veiculo_historico_excluido' : 'referencia_veiculo_inexistente',
      vehicleExists: false,
      clientExists: true,
      isOrphan: true,
      label: HISTORICAL_MISSING_VEHICLE_LABEL,
      secondaryLabel: null,
    };
  }

  return {
    status: 'cadastrado_vinculado',
    vehicleExists: true,
    clientExists: true,
    isOrphan: false,
    label: null,
    secondaryLabel: null,
  };
}

/**
 * Searches clients by name, CPF/CNPJ, phone/WhatsApp, AND linked vehicle plates (full or partial).
 * Returns the owner client accompanied by the vehicles that matched the plate search.
 */
export function searchClientsWithVehicles(
  clients: Client[],
  vehicles: Vehicle[],
  searchTerm: string
): ClientVehicleSearchMatch[] {
  const rawTerm = (searchTerm || '').trim();
  const normText = normalizeSearchText(rawTerm);
  const normPlateQuery = normalizePlate(rawTerm);
  const normDigitsQuery = normalizeDigits(rawTerm);

  const vehiclesByClient = new Map<string, Vehicle[]>();
  vehicles.forEach((v) => {
    const list = vehiclesByClient.get(v.clientId) || [];
    list.push(v);
    vehiclesByClient.set(v.clientId, list);
  });

  if (!normText) {
    return clients.map((client) => ({
      client,
      vehicles: vehiclesByClient.get(client.id) || [],
      matchedVehicles: [],
      matchedByPlate: false,
      matchedByClientData: true,
    }));
  }

  const results: ClientVehicleSearchMatch[] = [];

  for (const client of clients) {
    const clientVehicles = vehiclesByClient.get(client.id) || [];

    const matchedByName = normalizeSearchText(client.name).includes(normText);
    const matchedByDocument =
      normalizeSearchText(client.document).includes(normText) ||
      (normDigitsQuery.length >= 2 && normalizeDigits(client.document).includes(normDigitsQuery));
    const matchedByPhone =
      normalizeSearchText(client.phone).includes(normText) ||
      normalizeSearchText(client.whatsapp).includes(normText) ||
      (normDigitsQuery.length >= 3 &&
        (normalizeDigits(client.phone).includes(normDigitsQuery) ||
          normalizeDigits(client.whatsapp).includes(normDigitsQuery)));

    const matchedByClientData = matchedByName || matchedByDocument || matchedByPhone;

    const matchedVehicles =
      normPlateQuery.length >= 2
        ? clientVehicles.filter((v) => {
            const normVPlate = normalizePlate(v.plate);
            return normVPlate.includes(normPlateQuery);
          })
        : [];

    const matchedByPlate = matchedVehicles.length > 0;

    if (matchedByClientData || matchedByPlate) {
      results.push({
        client,
        vehicles: clientVehicles,
        matchedVehicles,
        matchedByPlate,
        matchedByClientData,
      });
    }
  }

  return results;
}

/**
 * Locates historical orphan references (e.g., deleted vehicle plate like OCB5030 or deleted client)
 * across charges and technical service orders WITHOUT creating clients/vehicles, WITHOUT modifying data,
 * and WITHOUT guessing ownership by similar names.
 */
export function findOrphanHistoricalPlateReferences(params: {
  clients: Client[];
  vehicles: Vehicle[];
  charges: Charge[];
  payments: Payment[];
  technicalServices: TechnicalServiceOrder[];
  searchTerm?: string;
}): OrphanHistoricalReferenceGroup[] {
  const { clients, vehicles, charges, payments, technicalServices, searchTerm = '' } = params;

  const clientsMap = new Map<string, Client>();
  clients.forEach((c) => clientsMap.set(c.id, c));

  const vehiclesMap = new Map<string, Vehicle>();
  vehicles.forEach((v) => vehiclesMap.set(v.id, v));

  const paymentsByChargeId = new Map<string, Payment[]>();
  payments.forEach((p) => {
    const list = paymentsByChargeId.get(p.chargeId) || [];
    list.push(p);
    paymentsByChargeId.set(p.chargeId, list);
  });

  const groups = new Map<string, OrphanHistoricalReferenceGroup>();

  const ensureGroup = (info: {
    plate: string;
    vehicleModel: string;
    vehicleId: string;
    clientId: string;
    recordedClientName: string;
    classification: RecordLinkClassification;
  }): OrphanHistoricalReferenceGroup => {
    const normPlate = normalizePlate(info.plate);
    const displayPlate = formatPlateForStorage(info.plate) || 'SEM PLACA';
    const key = normPlate
      ? `plate:${normPlate}|cli:${info.clientId || 'none'}`
      : `veh:${info.vehicleId || 'none'}|cli:${info.clientId || 'none'}`;

    const existing = groups.get(key);
    if (existing) {
      if (!existing.vehicleModel && info.vehicleModel) {
        existing.vehicleModel = info.vehicleModel;
      }
      return existing;
    }

    const currentClient = info.clientId ? clientsMap.get(info.clientId) || null : null;

    const group: OrphanHistoricalReferenceGroup = {
      key,
      normalizedPlate: normPlate,
      displayPlate,
      vehicleModel: info.vehicleModel || '',
      vehicleId: info.vehicleId || '',
      clientId: info.clientId || '',
      recordedClientName: info.recordedClientName || 'Nome não registrado',
      currentClient,
      linkStatus: info.classification.status,
      badgeLabel: info.classification.label || HISTORICAL_MISSING_VEHICLE_LABEL,
      secondaryLabel: info.classification.secondaryLabel,
      charges: [],
      payments: [],
      technicalServices: [],
      totalBilled: 0,
      totalPaid: 0,
      totalRemaining: 0,
    };

    groups.set(key, group);
    return group;
  };

  // 1. Scan charges for missing vehicle or missing client references
  for (const charge of charges) {
    const classification = classifyRecordLinkStatus({
      clientId: charge.clientId,
      vehicleId: charge.vehicleId,
      isPlanCharge: charge.isPlanCharge,
      vehicleIds: charge.vehicleIds,
      clientsMap,
      vehiclesMap,
    });

    if (!classification.isOrphan) continue;

    // If a charge references a deleted vehicle (or missing client), group it strictly by plate + clientId
    const group = ensureGroup({
      plate: charge.vehiclePlate || (charge.vehiclePlates?.[0] || ''),
      vehicleModel: charge.vehicleModel || '',
      vehicleId: charge.vehicleId || '',
      clientId: charge.clientId || '',
      recordedClientName: charge.clientName || '',
      classification,
    });

    group.charges.push(charge);

    const linkedPayments = paymentsByChargeId.get(charge.id) || [];
    for (const pay of linkedPayments) {
      if (!group.payments.some((existingPay) => existingPay.id === pay.id)) {
        group.payments.push(pay);
      }
    }
  }

  // 2. Scan technical service orders for missing vehicle or missing client references
  for (const order of technicalServices) {
    const classification = classifyRecordLinkStatus({
      clientId: order.clientId,
      vehicleId: order.vehicleId,
      clientsMap,
      vehiclesMap,
    });

    if (!classification.isOrphan) continue;

    const group = ensureGroup({
      plate: order.vehiclePlate || '',
      vehicleModel: order.vehicleModel || '',
      vehicleId: order.vehicleId || '',
      clientId: order.clientId || '',
      recordedClientName: order.clientName || '',
      classification,
    });

    group.technicalServices.push(order);
  }

  // Compute financial totals for each orphan group in integer cents
  const allGroups = Array.from(groups.values()).map((group) => {
    let billedCents = 0;
    let paidCents = 0;
    let remainingCents = 0;

    group.charges.forEach((c) => {
      if (c.status === 'cancelado') return;
      billedCents += Math.round((Number(c.totalAmount) || 0) * 100);
      paidCents += Math.round((Number(c.paidAmount) || 0) * 100);
      remainingCents += Math.round(getChargeRemainingBalance(c) * 100);
    });

    group.technicalServices.forEach((s) => {
      billedCents += Math.round((Number(s.totalAmount) || 0) * 100);
      paidCents += Math.round((Number(s.paidAmount) || 0) * 100);
      remainingCents += Math.round(Math.max(0, Number(s.remainingBalance) || 0) * 100);
    });

    group.charges.sort((a, b) => (b.dueDate || b.referenceMonth).localeCompare(a.dueDate || a.referenceMonth));
    group.payments.sort((a, b) => (b.paymentDate || b.createdAt).localeCompare(a.paymentDate || a.createdAt));
    group.technicalServices.sort((a, b) =>
      (b.executionDate || b.date || b.createdAt).localeCompare(a.executionDate || a.date || a.createdAt)
    );

    return {
      ...group,
      totalBilled: billedCents / 100,
      totalPaid: paidCents / 100,
      totalRemaining: remainingCents / 100,
    };
  });

  const rawTerm = (searchTerm || '').trim();
  if (!rawTerm) {
    return allGroups.sort((a, b) => a.displayPlate.localeCompare(b.displayPlate));
  }

  const normText = normalizeSearchText(rawTerm);
  const normPlateQuery = normalizePlate(rawTerm);

  return allGroups
    .filter((g) => {
      const matchPlate =
        normPlateQuery.length >= 2 &&
        (g.normalizedPlate.includes(normPlateQuery) ||
          g.charges.some((c) => normalizePlate(c.vehiclePlate).includes(normPlateQuery)) ||
          g.charges.some((c) => (c.vehiclePlates || []).some((p) => normalizePlate(p).includes(normPlateQuery))));
      const matchName = normalizeSearchText(g.recordedClientName).includes(normText);
      const matchModel = normalizeSearchText(g.vehicleModel).includes(normText);
      return matchPlate || matchName || matchModel;
    })
    .sort((a, b) => a.displayPlate.localeCompare(b.displayPlate));
}

/**
 * Calculates the exact monthly sum of active vehicles for a client using integer cents
 * to prevent floating-point drift and ensure zero duplication.
 */
export function calculateActiveVehiclesMonthlySum(vehicles: Vehicle[], clientId: string): number {
  const totalCents = vehicles
    .filter((v) => v.clientId === clientId && v.status === 'ativo')
    .reduce((acc, v) => acc + Math.round((Number(v.monthlyValue) || 0) * 100), 0);
  return totalCents / 100;
}
