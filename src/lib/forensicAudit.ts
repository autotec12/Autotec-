/**
 * MÓDULO TEMPORÁRIO DE AUDITORIA FORENSE — SOMENTE LEITURA
 *
 * REGRAS ABSOLUTAS DESTE ARQUIVO:
 * - Contém EXCLUSIVAMENTE operações de leitura (`getDocsFromServer` paginado).
 * - NÃO importa nem executa `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`,
 *   `writeBatch`, `runTransaction` ou qualquer função de escrita.
 * - NÃO altera documentos, regras, autenticação, geração mensal ou pagamentos.
 * - NÃO expõe dados pessoais (CPF, telefone, e-mail, endereço ou nome de clientes)
 *   nem segredos/tokens/credenciais no relatório ou exportação.
 */

import {
  collection,
  documentId,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  type Query,
  type QuerySnapshot,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  doesChargeCoverVehicle,
  formatCurrency,
  getChargeEffectiveOpenBalance,
  getRawChargeRemainingBalance,
} from './calculations';
import type { AuditLog, Charge, Payment, Vehicle } from '../types';

export const AUTHORIZED_FORENSIC_ADMIN_EMAIL = 'autotecrastreio@gmail.com';
const PAGE_SIZE = 500;
const CENTS_TOLERANCE = 1; // R$ 0,01

export type ForensicSeverity = 'CRÍTICO' | 'ALTO' | 'MÉDIO' | 'BAIXO' | 'INFORMATIVO';
export type ForensicCertainty = 'confirmado' | 'provável' | 'inconclusivo';
export type ForensicCategory =
  | 'COBRANCAS'
  | 'PAGAMENTOS'
  | 'TRANSPORTE_SALDO'
  | 'INTEGRIDADE_FINANCEIRA';

export type LegacyCarryCategory = 'A' | 'B' | 'C' | 'D' | 'E';

export interface ForensicFinding {
  id: string;
  category: ForensicCategory;
  severity: ForensicSeverity;
  certainty: ForensicCertainty;
  chargeId: string;
  relatedId?: string;
  clientId?: string;
  referenceMonth?: string;
  relatedReferenceMonth?: string;
  vehicleTechnicalId?: string;
  maskedPlate?: string;
  values: Record<string, number | string | boolean | null>;
  description: string;
  rationale: string;
  legacyCategory?: LegacyCarryCategory;
}

export interface CollectionReadStats {
  collectionName: string;
  documentsRead: number;
  pagesFetched: number;
  verifiedFromServer: boolean;
}

export interface LegacyCarryCandidateReport {
  originChargeId: string;
  possibleDestinationChargeId: string | null;
  clientId: string;
  vehicleTechnicalId: string;
  maskedPlate: string;
  originReferenceMonth: string;
  destinationReferenceMonth: string | null;
  originRemainingCents: number;
  destinationPreviousCarriedCents: number | null;
  differenceCents: number | null;
  paymentsOnOriginCount: number;
  paymentsOnOriginTotalCents: number;
  paymentsOnDestCount: number;
  paymentsOnDestTotalCents: number;
  auditEvidenceCount: number;
  evidences: string[];
  legacyCategory: LegacyCarryCategory;
  certainty: ForensicCertainty;
  recommendation: string;
}

export interface ForensicAuditReport {
  metadata: {
    executedAtIso: string;
    executedAtBr: string;
    projectId: string;
    databaseId: string;
    expectedRegion: string;
    readOnlyConfirmed: true;
    allDataFromServerConfirmed: boolean;
    collectionsExamined: CollectionReadStats[];
    totalDocumentsExamined: number;
    engineVersion: string;
  };
  summary: {
    charges: {
      total: number;
      paid: number;
      pending: number;
      partial: number;
      cancelled: number;
      postponed: number;
      individualByVehicle: number;
      legacyPlanCharges: number;
      withBalanceHandlingNextMonth: number;
      withFormalCarryConsumed: number;
      withFormalCarrySources: number;
      withPreviousBalanceCarriedPositive: number;
      duplicateGroupsDetected: number;
    };
    payments: {
      total: number;
      individualCount: number;
      consolidatedCount: number;
      totalAmountCents: number;
      orphanPaymentsCount: number;
      paidChargesWithoutCompatiblePaymentCount: number;
      chargePaidDivergenceCount: number;
    };
    carryOver: {
      formalCarryLinksCount: number;
      originsTransportedMultipleTimes: number;
      originsMissingDestination: number;
      originsWithUnmarkedConsumption: number;
      legacyPreA2CandidatesTotal: number;
      legacyCategoryCounts: Record<LegacyCarryCategory, number>;
      legacySuspectOriginSumCents: number;
      legacySuspectDestCarriedSumCents: number;
      legacyComparableDifferenceCents: number | null;
      legacyPlanPendingManualCount: number;
    };
    integrity: {
      negativeValueCount: number;
      mathDivergenceCount: number;
      statusInconsistencyCount: number;
      missingReferenceCount: number;
    };
    findingsBySeverity: Record<ForensicSeverity, number>;
    totalFindings: number;
  };
  legacyCarryCandidates: LegacyCarryCandidateReport[];
  findings: ForensicFinding[];
}

export interface ForensicProgressUpdate {
  stage: string;
  collectionName?: string;
  pagesFetched?: number;
  documentsRead?: number;
}

// ============================================================================
// UTILITÁRIOS SEGUROS (CENTAVOS INTEIROS E MASCARAMENTO DE DADOS PESSOAIS)
// ============================================================================

function toIntCents(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Math.sign(num) * 1e-10) * 100);
}

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

function isValidNumberField(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Mascara placa veicular para evitar exposição literal de dados sensíveis no relatório.
 * Ex: "ABC1D23" -> "ABC-***3", "ABC-1234" -> "ABC-***4", múltiplas placas -> "2 placas (mascaradas)".
 */
export function maskPlate(rawPlate: unknown): string {
  if (typeof rawPlate !== 'string') return 'N/D';
  const trimmed = rawPlate.trim().toUpperCase();
  if (!trimmed) return 'N/D';
  if (trimmed.includes(',')) {
    const parts = trimmed
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return `${parts.length} placas (mascaradas)`;
  }
  const clean = trimmed.replace(/[^A-Z0-9]/g, '');
  if (clean.length <= 3) return '***';
  if (clean.length <= 5) return `${clean.slice(0, 2)}***`;
  return `${clean.slice(0, 3)}-***${clean.slice(-1)}`;
}

function maskVehicleRef(
  vehicleId: unknown,
  plate: unknown,
  vehiclesById: Map<string, Vehicle>
): { vehicleTechnicalId: string; maskedPlate: string } {
  const vId = typeof vehicleId === 'string' && vehicleId.trim() ? vehicleId.trim() : 'SEM_VEHICLE_ID';
  const vehicle = vehiclesById.get(vId);
  const effectivePlate = plate || vehicle?.plate || '';
  return {
    vehicleTechnicalId: vId,
    maskedPlate: maskPlate(effectivePlate),
  };
}

function compareReferenceMonth(a: string | undefined, b: string | undefined): number {
  const ma = typeof a === 'string' ? a.trim() : '';
  const mb = typeof b === 'string' ? b.trim() : '';
  return ma.localeCompare(mb);
}

function getNextReferenceMonth(ym: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec((ym || '').trim());
  if (!match) return null;
  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatCentsBr(cents: number): string {
  return formatCurrency(centsToReais(cents));
}

// ============================================================================
// LEITURA PAGINADA EXCLUSIVAMENTE DO SERVIDOR (ZERO ESCRITA, ZERO CACHE)
// ============================================================================

async function fetchCollectionFromServerPaginated<T extends { id: string }>(
  collectionName: string,
  onProgress?: (update: ForensicProgressUpdate) => void
): Promise<{ docs: T[]; stats: CollectionReadStats }> {
  const colRef = collection(db, collectionName);
  const docs: T[] = [];
  let lastSnapshotDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let pagesFetched = 0;

  while (true) {
    const q: Query<DocumentData> = lastSnapshotDoc
      ? query(colRef, orderBy(documentId()), startAfter(lastSnapshotDoc), limit(PAGE_SIZE))
      : query(colRef, orderBy(documentId()), limit(PAGE_SIZE));

    const snap: QuerySnapshot<DocumentData> = await getDocsFromServer(q);

    // Garantia estrita: nunca aceitar resultado oriundo de cache local
    if (snap.metadata.fromCache) {
      throw new Error(
        `Leitura abortada em "${collectionName}": o Firestore retornou dados do cache local (fromCache=true). A auditoria exige dados confirmados do servidor.`
      );
    }

    pagesFetched += 1;

    snap.docs.forEach((docSnap) => {
      docs.push({
        ...(docSnap.data() as Record<string, unknown>),
        id: docSnap.id,
      } as T);
    });

    onProgress?.({
      stage: `Lendo coleção "${collectionName}" do servidor (página ${pagesFetched})...`,
      collectionName,
      pagesFetched,
      documentsRead: docs.length,
    });

    if (snap.docs.length < PAGE_SIZE) {
      break;
    }

    lastSnapshotDoc = snap.docs[snap.docs.length - 1];
  }

  return {
    docs,
    stats: {
      collectionName,
      documentsRead: docs.length,
      pagesFetched,
      verifiedFromServer: true,
    },
  };
}

// ============================================================================
// MOTOR ANALÍTICO PURO (TESTÁVEL E DETERMINÍSTICO EM CENTAVOS)
// ============================================================================

export function analyzeForensicDataset(params: {
  charges: Charge[];
  payments: Payment[];
  auditLogs: AuditLog[];
  vehicles: Vehicle[];
  collectionsExamined: CollectionReadStats[];
  executedAt?: Date;
}): ForensicAuditReport {
  const { charges, payments, auditLogs, vehicles, collectionsExamined } = params;
  const now = params.executedAt || new Date();
  const findings: ForensicFinding[] = [];
  let findingSeq = 0;

  const pushFinding = (f: Omit<ForensicFinding, 'id'>) => {
    findingSeq += 1;
    findings.push({
      id: `F-${String(findingSeq).padStart(4, '0')}`,
      ...f,
    });
  };

  const chargesById = new Map<string, Charge>();
  charges.forEach((c) => chargesById.set(c.id, c));

  const vehiclesById = new Map<string, Vehicle>();
  vehicles.forEach((v) => vehiclesById.set(v.id, v));

  // Indexar audit_logs por entityId (sem expor detalhes com PII)
  const auditLogsByEntityId = new Map<string, AuditLog[]>();
  auditLogs.forEach((log) => {
    const key = typeof log.entityId === 'string' ? log.entityId.trim() : '';
    if (!key) return;
    const list = auditLogsByEntityId.get(key) || [];
    list.push(log);
    auditLogsByEntityId.set(key, list);
  });

  // ==========================================================================
  // INDEXAÇÃO DE PAGAMENTOS POR COBRANÇA (INDIVIDUAL + CONSOLIDADO)
  // ==========================================================================
  interface ChargePaymentLink {
    paymentId: string;
    amountCents: number;
    isConsolidated: boolean;
    paymentDate: string;
    receiptNumber: string;
  }

  const paymentLinksByChargeId = new Map<string, ChargePaymentLink[]>();
  const addChargePaymentLink = (chargeId: string, link: ChargePaymentLink) => {
    const list = paymentLinksByChargeId.get(chargeId) || [];
    list.push(link);
    paymentLinksByChargeId.set(chargeId, list);
  };

  let individualPaymentsCount = 0;
  let consolidatedPaymentsCount = 0;
  let totalPaymentsAmountCents = 0;
  let orphanPaymentsCount = 0;

  for (const payment of payments) {
    const payAmountCents = toIntCents(payment.amount);
    totalPaymentsAmountCents += payAmountCents;

    if (payAmountCents <= 0) {
      pushFinding({
        category: 'PAGAMENTOS',
        severity: 'ALTO',
        certainty: 'confirmado',
        chargeId: payment.chargeId || 'SEM_CHARGE_ID',
        relatedId: payment.id,
        clientId: payment.clientId,
        values: { paymentAmountReais: centsToReais(payAmountCents) },
        description: `Pagamento ${payment.id} possui valor não positivo (${formatCentsBr(payAmountCents)}).`,
        rationale: 'Pagamentos financeiros válidos devem ter valor estritamente maior que zero.',
      });
    }

    const isConsolidated =
      payment.isConsolidated === true ||
      (Array.isArray(payment.consolidatedItems) && payment.consolidatedItems.length > 0);

    if (isConsolidated) {
      consolidatedPaymentsCount += 1;
      const items = Array.isArray(payment.consolidatedItems) ? payment.consolidatedItems : [];

      if (items.length === 0) {
        // Fallback: pagamento marcado como consolidado sem array de itens
        const fallbackChargeId = typeof payment.chargeId === 'string' ? payment.chargeId.trim() : '';
        if (fallbackChargeId && chargesById.has(fallbackChargeId)) {
          addChargePaymentLink(fallbackChargeId, {
            paymentId: payment.id,
            amountCents: payAmountCents,
            isConsolidated: true,
            paymentDate: payment.paymentDate || '',
            receiptNumber: payment.receiptNumber || '',
          });
        } else {
          orphanPaymentsCount += 1;
          pushFinding({
            category: 'PAGAMENTOS',
            severity: 'MÉDIO',
            certainty: 'confirmado',
            chargeId: fallbackChargeId || 'CONSOLIDADO_SEM_ITENS',
            relatedId: payment.id,
            clientId: payment.clientId,
            values: { paymentAmountReais: centsToReais(payAmountCents) },
            description: `Pagamento consolidado ${payment.id} não possui lista consolidatedItems nem chargeId existente em charges.`,
            rationale: 'Sem vínculo discriminado por cobrança, não é possível reconciliar automaticamente quais mensalidades receberam o valor.',
          });
        }
      } else {
        let itemsSumCents = 0;
        const seenChargeIdsInSameConsolidated = new Set<string>();

        for (const item of items) {
          const itemCents = toIntCents(item.paidInThisOperation);
          itemsSumCents += itemCents;
          const targetChargeId = typeof item.chargeId === 'string' ? item.chargeId.trim() : '';

          if (targetChargeId && seenChargeIdsInSameConsolidated.has(targetChargeId)) {
            pushFinding({
              category: 'PAGAMENTOS',
              severity: 'ALTO',
              certainty: 'confirmado',
              chargeId: targetChargeId,
              relatedId: payment.id,
              clientId: payment.clientId,
              referenceMonth: item.referenceMonth,
              values: { paidInThisOperationReais: centsToReais(itemCents) },
              description: `Pagamento consolidado ${payment.id} referencia a mesma cobrança ${targetChargeId} mais de uma vez em consolidatedItems.`,
              rationale: 'Um pagamento consolidado deve distribuir cada cobrança contemplada em uma única entrada de item.',
            });
          }
          if (targetChargeId) seenChargeIdsInSameConsolidated.add(targetChargeId);

          if (!targetChargeId || !chargesById.has(targetChargeId)) {
            orphanPaymentsCount += 1;
            pushFinding({
              category: 'PAGAMENTOS',
              severity: 'ALTO',
              certainty: 'confirmado',
              chargeId: targetChargeId || 'SEM_CHARGE_ID',
              relatedId: payment.id,
              clientId: payment.clientId,
              referenceMonth: item.referenceMonth,
              values: { paidInThisOperationReais: centsToReais(itemCents) },
              description: `Item do pagamento consolidado ${payment.id} aponta para cobrança inexistente (${targetChargeId || 'vazio'}).`,
              rationale: 'Referência órfã em pagamento consolidado indica possível exclusão posterior da cobrança ou ID corrompido.',
            });
          } else {
            const linkedCharge = chargesById.get(targetChargeId)!;
            if (payment.clientId && linkedCharge.clientId && payment.clientId !== linkedCharge.clientId) {
              pushFinding({
                category: 'PAGAMENTOS',
                severity: 'CRÍTICO',
                certainty: 'confirmado',
                chargeId: targetChargeId,
                relatedId: payment.id,
                clientId: payment.clientId,
                referenceMonth: linkedCharge.referenceMonth,
                values: {
                  paymentClientId: payment.clientId,
                  chargeClientId: linkedCharge.clientId,
                  paidInThisOperationReais: centsToReais(itemCents),
                },
                description: `Divergência de cliente entre pagamento consolidado ${payment.id} e cobrança ${targetChargeId}.`,
                rationale: 'Um pagamento consolidado não deve quitar cobrança pertencente a outro clientId.',
              });
            }

            addChargePaymentLink(targetChargeId, {
              paymentId: payment.id,
              amountCents: itemCents,
              isConsolidated: true,
              paymentDate: payment.paymentDate || '',
              receiptNumber: payment.receiptNumber || '',
            });
          }
        }

        if (Math.abs(itemsSumCents - payAmountCents) > CENTS_TOLERANCE) {
          pushFinding({
            category: 'PAGAMENTOS',
            severity: 'ALTO',
            certainty: 'confirmado',
            chargeId: payment.chargeId || 'CONSOLIDADO',
            relatedId: payment.id,
            clientId: payment.clientId,
            values: {
              paymentAmountReais: centsToReais(payAmountCents),
              consolidatedItemsSumReais: centsToReais(itemsSumCents),
              differenceReais: centsToReais(payAmountCents - itemsSumCents),
            },
            description: `Pagamento consolidado ${payment.id} tem soma dos itens (${formatCentsBr(itemsSumCents)}) diferente do valor total (${formatCentsBr(payAmountCents)}).`,
            rationale: 'A soma dos valores rateados em consolidatedItems deve coincidir com amount do recibo consolidado.',
          });
        }
      }
    } else {
      individualPaymentsCount += 1;
      const targetChargeId = typeof payment.chargeId === 'string' ? payment.chargeId.trim() : '';

      if (!targetChargeId || !chargesById.has(targetChargeId)) {
        orphanPaymentsCount += 1;
        pushFinding({
          category: 'PAGAMENTOS',
          severity: 'ALTO',
          certainty: 'confirmado',
          chargeId: targetChargeId || 'SEM_CHARGE_ID',
          relatedId: payment.id,
          clientId: payment.clientId,
          values: { paymentAmountReais: centsToReais(payAmountCents) },
          description: `Pagamento individual ${payment.id} (${formatCentsBr(payAmountCents)}) aponta para cobrança inexistente (${targetChargeId || 'vazio'}).`,
          rationale: 'Pagamento sem cobrança correspondente compromete a rastreabilidade entre caixa recebido e faturamento.',
        });
      } else {
        const linkedCharge = chargesById.get(targetChargeId)!;
        if (payment.clientId && linkedCharge.clientId && payment.clientId !== linkedCharge.clientId) {
          pushFinding({
            category: 'PAGAMENTOS',
            severity: 'CRÍTICO',
            certainty: 'confirmado',
            chargeId: targetChargeId,
            relatedId: payment.id,
            clientId: payment.clientId,
            referenceMonth: linkedCharge.referenceMonth,
            values: {
              paymentClientId: payment.clientId,
              chargeClientId: linkedCharge.clientId,
              paymentAmountReais: centsToReais(payAmountCents),
            },
            description: `Pagamento ${payment.id} pertence ao cliente ${payment.clientId}, mas aponta para cobrança do cliente ${linkedCharge.clientId}.`,
            rationale: 'Vínculo cruzado entre clientes distintos indica erro grave de integridade referencial.',
          });
        }

        addChargePaymentLink(targetChargeId, {
          paymentId: payment.id,
          amountCents: payAmountCents,
          isConsolidated: false,
          paymentDate: payment.paymentDate || '',
          receiptNumber: payment.receiptNumber || '',
        });
      }
    }
  }

  // ==========================================================================
  // SEÇÃO A: CONTADORES DE COBRANÇAS + DUPLICIDADE POR VEÍCULO E COMPETÊNCIA
  // ==========================================================================
  let paidCount = 0;
  let pendingCount = 0;
  let partialCount = 0;
  let cancelledCount = 0;
  let postponedCount = 0;
  let individualByVehicleCount = 0;
  let legacyPlanChargesCount = 0;
  let withBalanceHandlingNextMonthCount = 0;
  let withFormalCarryConsumedCount = 0;
  let withFormalCarrySourcesCount = 0;
  let withPreviousBalanceCarriedPositiveCount = 0;

  let paidChargesWithoutCompatiblePaymentCount = 0;
  let chargePaidDivergenceCount = 0;
  let negativeValueCount = 0;
  let mathDivergenceCount = 0;
  let statusInconsistencyCount = 0;
  let missingReferenceCount = 0;

  // Map para duplicidade exata (clientId + vehicleId + referenceMonth) em cobranças individuais ativas
  const individualByVehicleMonth = new Map<string, Charge[]>();
  // Map de planos ativos por (clientId + referenceMonth) para verificar sobreposição com individuais
  const planChargesByClientMonth = new Map<string, Charge[]>();

  for (const charge of charges) {
    if (charge.status === 'pago') paidCount += 1;
    else if (charge.status === 'pendente') pendingCount += 1;
    else if (charge.status === 'parcial') partialCount += 1;
    else if (charge.status === 'cancelado') cancelledCount += 1;

    if (charge.isPostponed === true) postponedCount += 1;
    if (charge.isPlanCharge === true) legacyPlanChargesCount += 1;
    else individualByVehicleCount += 1;

    if (charge.balanceHandling === 'next_month') withBalanceHandlingNextMonthCount += 1;
    if (
      charge.carriedBalanceConsumed === true ||
      (typeof charge.carriedToChargeId === 'string' && charge.carriedToChargeId.trim().length > 0)
    ) {
      withFormalCarryConsumedCount += 1;
    }
    if (
      (Array.isArray(charge.carriedFromChargeIds) && charge.carriedFromChargeIds.length > 0) ||
      (Array.isArray(charge.carriedBalanceSources) && charge.carriedBalanceSources.length > 0)
    ) {
      withFormalCarrySourcesCount += 1;
    }
    if (toIntCents(charge.previousBalanceCarried) > 0) {
      withPreviousBalanceCarriedPositiveCount += 1;
    }

    const { vehicleTechnicalId, maskedPlate } = maskVehicleRef(
      charge.vehicleId,
      charge.vehiclePlate,
      vehiclesById
    );

    // Agrupamentos para duplicidade (somente não canceladas)
    if (charge.status !== 'cancelado') {
      if (charge.isPlanCharge === true) {
        const pmKey = `${charge.clientId || ''}__${charge.referenceMonth || ''}`;
        const list = planChargesByClientMonth.get(pmKey) || [];
        list.push(charge);
        planChargesByClientMonth.set(pmKey, list);
      } else if (charge.vehicleId && charge.referenceMonth) {
        const vmKey = `${charge.clientId || ''}__${charge.vehicleId}__${charge.referenceMonth}`;
        const list = individualByVehicleMonth.get(vmKey) || [];
        list.push(charge);
        individualByVehicleMonth.set(vmKey, list);
      }
    }

    // ========================================================================
    // SEÇÃO D: INTEGRIDADE FINANCEIRA DA COBRANÇA (CENTAVOS INTEIROS)
    // ========================================================================
    const origCents = toIntCents(charge.originalMonthlyValue);
    const prevCarriedCents = toIntCents(charge.previousBalanceCarried);
    const discountCents = toIntCents(charge.discount);
    const additionCents = toIntCents(charge.addition);
    const totalCents = toIntCents(charge.totalAmount);
    const paidCents = toIntCents(charge.paidAmount);
    const remCents = toIntCents(charge.remainingBalance);
    const carriedAmtCents =
      charge.carriedBalanceAmount !== undefined && charge.carriedBalanceAmount !== null
        ? toIntCents(charge.carriedBalanceAmount)
        : null;

    // 1. Referências básicas obrigatórias
    if (!charge.clientId || !charge.referenceMonth || (!charge.isPlanCharge && !charge.vehicleId)) {
      missingReferenceCount += 1;
      pushFinding({
        category: 'INTEGRIDADE_FINANCEIRA',
        severity: 'MÉDIO',
        certainty: 'confirmado',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          hasClientId: Boolean(charge.clientId),
          hasVehicleId: Boolean(charge.vehicleId),
          hasReferenceMonth: Boolean(charge.referenceMonth),
          isPlanCharge: Boolean(charge.isPlanCharge),
        },
        description: `Cobrança ${charge.id} possui referência técnica obrigatória ausente (clientId, vehicleId ou referenceMonth).`,
        rationale: 'Sem clientId, vehicleId (em cobrança individual) e referenceMonth, o controle de unicidade e transporte fica comprometido.',
      });
    }

    // 2. Valores negativos
    const negativeFields: string[] = [];
    if (origCents < 0) negativeFields.push(`originalMonthlyValue=${formatCentsBr(origCents)}`);
    if (prevCarriedCents < 0) negativeFields.push(`previousBalanceCarried=${formatCentsBr(prevCarriedCents)}`);
    if (discountCents < 0) negativeFields.push(`discount=${formatCentsBr(discountCents)}`);
    if (additionCents < 0) negativeFields.push(`addition=${formatCentsBr(additionCents)}`);
    if (totalCents < 0) negativeFields.push(`totalAmount=${formatCentsBr(totalCents)}`);
    if (paidCents < 0) negativeFields.push(`paidAmount=${formatCentsBr(paidCents)}`);
    if (remCents < 0) negativeFields.push(`remainingBalance=${formatCentsBr(remCents)}`);
    if (carriedAmtCents !== null && carriedAmtCents < 0) {
      negativeFields.push(`carriedBalanceAmount=${formatCentsBr(carriedAmtCents)}`);
    }

    if (negativeFields.length > 0) {
      negativeValueCount += 1;
      pushFinding({
        category: 'INTEGRIDADE_FINANCEIRA',
        severity: 'CRÍTICO',
        certainty: 'confirmado',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          originalMonthlyValue: centsToReais(origCents),
          totalAmount: centsToReais(totalCents),
          paidAmount: centsToReais(paidCents),
          remainingBalance: centsToReais(remCents),
          negativeFields: negativeFields.join('; '),
        },
        description: `Cobrança ${charge.id} contém valor(es) financeiro(s) negativo(s): ${negativeFields.join(', ')}.`,
        rationale: 'Campos monetários em cobranças nunca devem ser negativos.',
      });
    }

    // 3. Equação totalAmount vs original + previousBalanceCarried + addition - discount
    const expectedTotalCents = Math.max(0, origCents + prevCarriedCents + additionCents - discountCents);
    if (Math.abs(totalCents - expectedTotalCents) > CENTS_TOLERANCE) {
      mathDivergenceCount += 1;
      pushFinding({
        category: 'INTEGRIDADE_FINANCEIRA',
        severity: 'MÉDIO',
        certainty: 'confirmado',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          originalMonthlyValue: centsToReais(origCents),
          previousBalanceCarried: centsToReais(prevCarriedCents),
          addition: centsToReais(additionCents),
          discount: centsToReais(discountCents),
          expectedTotal: centsToReais(expectedTotalCents),
          recordedTotal: centsToReais(totalCents),
          difference: centsToReais(totalCents - expectedTotalCents),
        },
        description: `Divergência na composição de totalAmount em ${charge.id}: registrado ${formatCentsBr(totalCents)}, esperado ${formatCentsBr(expectedTotalCents)}.`,
        rationale: 'totalAmount deve corresponder a originalMonthlyValue + previousBalanceCarried + addition - discount (tolerância de 1 centavo).',
      });
    }

    // 4. Equação remainingBalance vs max(0, totalAmount - paidAmount)
    const expectedRemainingCents = Math.max(0, totalCents - paidCents);
    if (
      charge.status !== 'cancelado' &&
      (!isValidNumberField(charge.remainingBalance) ||
        Math.abs(remCents - expectedRemainingCents) > CENTS_TOLERANCE)
    ) {
      mathDivergenceCount += 1;
      pushFinding({
        category: 'INTEGRIDADE_FINANCEIRA',
        severity: 'ALTO',
        certainty: 'confirmado',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          totalAmount: centsToReais(totalCents),
          paidAmount: centsToReais(paidCents),
          recordedRemaining: centsToReais(remCents),
          expectedRemaining: centsToReais(expectedRemainingCents),
          difference: centsToReais(remCents - expectedRemainingCents),
        },
        description: `Divergência entre remainingBalance (${formatCentsBr(remCents)}) e totalAmount - paidAmount (${formatCentsBr(expectedRemainingCents)}) em ${charge.id}.`,
        rationale: 'O saldo restante registrado deve refletir exatamente totalAmount - paidAmount (com tolerância de 1 centavo).',
      });
    }

    // 5. Pago maior que totalAmount
    if (paidCents > totalCents + CENTS_TOLERANCE) {
      mathDivergenceCount += 1;
      pushFinding({
        category: 'INTEGRIDADE_FINANCEIRA',
        severity: 'CRÍTICO',
        certainty: 'confirmado',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          totalAmount: centsToReais(totalCents),
          paidAmount: centsToReais(paidCents),
          overpaidBy: centsToReais(paidCents - totalCents),
        },
        description: `Cobrança ${charge.id} possui paidAmount (${formatCentsBr(paidCents)}) superior a totalAmount (${formatCentsBr(totalCents)}).`,
        rationale: 'Valor pago superior ao valor total indica possível baixa duplicada histórica ou ajuste manual inconsistente.',
      });
    }

    // 6. Consistência de status vs valores
    if (charge.status === 'pago' && remCents > CENTS_TOLERANCE) {
      statusInconsistencyCount += 1;
      pushFinding({
        category: 'INTEGRIDADE_FINANCEIRA',
        severity: 'ALTO',
        certainty: 'confirmado',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          status: charge.status,
          totalAmount: centsToReais(totalCents),
          paidAmount: centsToReais(paidCents),
          remainingBalance: centsToReais(remCents),
        },
        description: `Cobrança ${charge.id} está marcada como "pago", mas possui remainingBalance de ${formatCentsBr(remCents)}.`,
        rationale: 'Uma cobrança quitada não pode manter saldo restante positivo.',
      });
    } else if (charge.status === 'pendente' && paidCents > CENTS_TOLERANCE) {
      statusInconsistencyCount += 1;
      pushFinding({
        category: 'INTEGRIDADE_FINANCEIRA',
        severity: 'MÉDIO',
        certainty: 'confirmado',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          status: charge.status,
          totalAmount: centsToReais(totalCents),
          paidAmount: centsToReais(paidCents),
          remainingBalance: centsToReais(remCents),
        },
        description: `Cobrança ${charge.id} está com status "pendente", mas já possui paidAmount de ${formatCentsBr(paidCents)}.`,
        rationale: 'Cobranças com pagamento parcial ou integral devem estar como "parcial" ou "pago".',
      });
    } else if (charge.status === 'parcial' && remCents <= CENTS_TOLERANCE && totalCents > 0) {
      statusInconsistencyCount += 1;
      pushFinding({
        category: 'INTEGRIDADE_FINANCEIRA',
        severity: 'MÉDIO',
        certainty: 'confirmado',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          status: charge.status,
          totalAmount: centsToReais(totalCents),
          paidAmount: centsToReais(paidCents),
          remainingBalance: centsToReais(remCents),
        },
        description: `Cobrança ${charge.id} está com status "parcial", mas remainingBalance está zerado.`,
        rationale: 'Cobrança sem saldo restante deveria estar quitada ("pago").',
      });
    }

    // ========================================================================
    // SEÇÃO B: CRUZAMENTO DE PAGAMENTOS COM A COBRANÇA
    // ========================================================================
    const linkedPayments = paymentLinksByChargeId.get(charge.id) || [];
    const linkedSumCents = linkedPayments.reduce((acc, p) => acc + p.amountCents, 0);

    if (charge.status === 'pago' && totalCents > CENTS_TOLERANCE && linkedPayments.length === 0) {
      paidChargesWithoutCompatiblePaymentCount += 1;
      pushFinding({
        category: 'PAGAMENTOS',
        severity: 'MÉDIO',
        certainty: 'provável',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          totalAmount: centsToReais(totalCents),
          paidAmount: centsToReais(paidCents),
          linkedPaymentsCount: 0,
        },
        description: `Cobrança ${charge.id} está "pago" (${formatCentsBr(paidCents)}), mas nenhum documento em payments referencia esta cobrança.`,
        rationale:
          'Pode ser um registro legado quitado antes da estrutura atual de recibos ou um pagamento excluído/desvinculado — requer conferência humana.',
      });
    } else if (
      charge.status !== 'cancelado' &&
      (paidCents > CENTS_TOLERANCE || linkedSumCents > CENTS_TOLERANCE) &&
      Math.abs(paidCents - linkedSumCents) > CENTS_TOLERANCE
    ) {
      chargePaidDivergenceCount += 1;
      const diffCents = paidCents - linkedSumCents;
      pushFinding({
        category: 'PAGAMENTOS',
        severity: Math.abs(diffCents) >= 100 ? 'ALTO' : 'MÉDIO',
        certainty: 'confirmado',
        chargeId: charge.id,
        relatedId: linkedPayments.map((p) => p.paymentId).join(', '),
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          chargePaidAmount: centsToReais(paidCents),
          sumPaymentsLinked: centsToReais(linkedSumCents),
          difference: centsToReais(diffCents),
          linkedPaymentsCount: linkedPayments.length,
          includesConsolidated: linkedPayments.some((p) => p.isConsolidated),
        },
        description: `Cobrança ${charge.id} registra paidAmount de ${formatCentsBr(paidCents)}, mas a soma dos pagamentos vinculados (individuais + consolidados) é ${formatCentsBr(linkedSumCents)}.`,
        rationale:
          'Divergência entre o total recebido nos documentos de payments e o paidAmount acumulado na cobrança.',
      });
    }
  }

  // ==========================================================================
  // SEÇÃO A (CONT.): DUPLICIDADE POR VEÍCULO E COMPETÊNCIA
  // ==========================================================================
  let duplicateGroupsDetected = 0;

  // 1. Duas ou mais cobranças individuais ativas para o mesmo clientId + vehicleId + referenceMonth
  for (const [, group] of individualByVehicleMonth.entries()) {
    if (group.length <= 1) continue;
    duplicateGroupsDetected += 1;
    const primary = group[0];
    const others = group.slice(1);
    const { vehicleTechnicalId, maskedPlate } = maskVehicleRef(
      primary.vehicleId,
      primary.vehiclePlate,
      vehiclesById
    );
    const totalGroupBilledCents = group.reduce((acc, c) => acc + toIntCents(c.totalAmount), 0);
    const totalGroupOpenCents = group.reduce(
      (acc, c) => acc + toIntCents(getChargeEffectiveOpenBalance(c)),
      0
    );
    const paidInGroup = group.filter((c) => toIntCents(c.paidAmount) > 0).length;

    pushFinding({
      category: 'COBRANCAS',
      severity: paidInGroup > 1 ? 'CRÍTICO' : 'ALTO',
      certainty: 'confirmado',
      chargeId: primary.id,
      relatedId: others.map((o) => o.id).join(', '),
      clientId: primary.clientId,
      referenceMonth: primary.referenceMonth,
      vehicleTechnicalId,
      maskedPlate,
      values: {
        duplicateCount: group.length,
        statuses: group.map((c) => `${c.id}:${c.status}`).join(' | '),
        totalBilledAcrossGroup: centsToReais(totalGroupBilledCents),
        totalOpenAcrossGroup: centsToReais(totalGroupOpenCents),
        paidChargesInGroup: paidInGroup,
      },
      description: `Encontradas ${group.length} cobranças individuais ativas para o mesmo veículo (${maskedPlate}) na competência ${primary.referenceMonth}.`,
      rationale:
        paidInGroup > 1
          ? 'Mais de uma cobrança já recebeu pagamento para o mesmo veículo e competência (risco de cobrança/recebimento duplicado).'
          : 'A regra de negócio determina no máximo uma cobrança individual ativa por veículo e competência.',
    });
  }

  // 2. Sobreposição entre cobrança de plano legada e cobrança individual na mesma competência
  for (const [pmKey, planList] of planChargesByClientMonth.entries()) {
    const [clientId, refMonth] = pmKey.split('__');
    const individualSameClientMonth = charges.filter(
      (c) =>
        c.status !== 'cancelado' &&
        !c.isPlanCharge &&
        c.clientId === clientId &&
        c.referenceMonth === refMonth
    );

    for (const indiv of individualSameClientMonth) {
      const vehicleObj: Pick<Vehicle, 'id' | 'clientId' | 'plate'> = {
        id: indiv.vehicleId,
        clientId: indiv.clientId,
        plate: indiv.vehiclePlate || vehiclesById.get(indiv.vehicleId)?.plate || '',
      };

      const coveringPlans = planList.filter((planCh) => doesChargeCoverVehicle(planCh, vehicleObj));
      if (coveringPlans.length > 0) {
        const indivHasPaymentOrPostponed =
          indiv.status === 'pago' ||
          indiv.status === 'parcial' ||
          toIntCents(indiv.paidAmount) > 0 ||
          indiv.isPostponed === true;
        const { vehicleTechnicalId, maskedPlate } = maskVehicleRef(
          indiv.vehicleId,
          indiv.vehiclePlate,
          vehiclesById
        );

        pushFinding({
          category: 'COBRANCAS',
          severity: indivHasPaymentOrPostponed ? 'ALTO' : 'INFORMATIVO',
          certainty: indivHasPaymentOrPostponed ? 'provável' : 'confirmado',
          chargeId: indiv.id,
          relatedId: coveringPlans.map((p) => p.id).join(', '),
          clientId,
          referenceMonth: refMonth,
          vehicleTechnicalId,
          maskedPlate,
          values: {
            individualStatus: indiv.status,
            individualTotal: centsToReais(toIntCents(indiv.totalAmount)),
            individualPaid: centsToReais(toIntCents(indiv.paidAmount)),
            planStatuses: coveringPlans.map((p) => `${p.id}:${p.status}`).join(' | '),
          },
          description: indivHasPaymentOrPostponed
            ? `Cobrança individual ${indiv.id} (${indiv.status}) coexiste com cobrança de plano (${coveringPlans.map((p) => p.id).join(', ')}) cobrindo o mesmo veículo na competência ${refMonth}.`
            : `Cobrança individual pendente ${indiv.id} possui cobertura por cobrança de plano (${coveringPlans.map((p) => p.id).join(', ')}) em ${refMonth} (suprimida por getEffectiveCharges nas telas atualizadas, mas ainda presente no documento bruto).`,
          rationale: indivHasPaymentOrPostponed
            ? 'Ambas têm movimentação financeira ou adiamento; verificar se houve dupla cobrança real para o veículo nesta competência.'
            : 'Registro redundante histórico protegido por getEffectiveCharges; atenção às telas que ainda leem charges bruto.',
        });
      }
    }
  }

  // ==========================================================================
  // SEÇÃO C: TRANSPORTE DE SALDOS — PRIORIDADE MÁXIMA (10 VERIFICAÇÕES)
  // ==========================================================================
  const destinationsReferencingOrigin = new Map<string, Charge[]>();
  const sourceAmountsByOriginFromDest = new Map<string, { destId: string; amountCents: number }[]>();

  for (const dest of charges) {
    if (dest.status === 'cancelado') continue;
    const fromIds = new Set<string>();

    if (Array.isArray(dest.carriedFromChargeIds)) {
      dest.carriedFromChargeIds.forEach((id) => {
        if (typeof id === 'string' && id.trim()) fromIds.add(id.trim());
      });
    }

    if (Array.isArray(dest.carriedBalanceSources)) {
      dest.carriedBalanceSources.forEach((srcItem) => {
        if (srcItem && typeof srcItem.sourceChargeId === 'string' && srcItem.sourceChargeId.trim()) {
          const sId = srcItem.sourceChargeId.trim();
          fromIds.add(sId);
          const list = sourceAmountsByOriginFromDest.get(sId) || [];
          list.push({ destId: dest.id, amountCents: toIntCents(srcItem.amount) });
          sourceAmountsByOriginFromDest.set(sId, list);
        }
      });
    }

    fromIds.forEach((originId) => {
      const list = destinationsReferencingOrigin.get(originId) || [];
      list.push(dest);
      destinationsReferencingOrigin.set(originId, list);
    });

    // Verificar consistência interna do destino: soma de carriedBalanceSources vs previousBalanceCarried
    if (Array.isArray(dest.carriedBalanceSources) && dest.carriedBalanceSources.length > 0) {
      const sourcesSumCents = dest.carriedBalanceSources.reduce(
        (acc, s) => acc + toIntCents(s.amount),
        0
      );
      const prevCarriedCents = toIntCents(dest.previousBalanceCarried);
      if (Math.abs(sourcesSumCents - prevCarriedCents) > CENTS_TOLERANCE) {
        const { vehicleTechnicalId, maskedPlate } = maskVehicleRef(
          dest.vehicleId,
          dest.vehiclePlate,
          vehiclesById
        );
        pushFinding({
          category: 'TRANSPORTE_SALDO',
          severity: 'ALTO',
          certainty: 'confirmado',
          chargeId: dest.id,
          relatedId: dest.carriedBalanceSources.map((s) => s.sourceChargeId).join(', '),
          clientId: dest.clientId,
          referenceMonth: dest.referenceMonth,
          vehicleTechnicalId,
          maskedPlate,
          values: {
            previousBalanceCarried: centsToReais(prevCarriedCents),
            carriedBalanceSourcesSum: centsToReais(sourcesSumCents),
            difference: centsToReais(prevCarriedCents - sourcesSumCents),
          },
          description: `Cobrança de destino ${dest.id} tem previousBalanceCarried (${formatCentsBr(prevCarriedCents)}) divergente da soma de carriedBalanceSources (${formatCentsBr(sourcesSumCents)}).`,
          rationale: 'O saldo anterior incorporado no destino deve coincidir com o detalhamento de origens registradas.',
        });
      }
    }
  }

  let formalCarryLinksCount = 0;
  let originsTransportedMultipleTimes = 0;
  let originsMissingDestination = 0;
  let originsWithUnmarkedConsumption = 0;

  // Verificações C.1 a C.8 sobre todas as origens formalmente ligadas
  const allFormalOriginIds = new Set<string>();
  charges.forEach((c) => {
    if (
      c.carriedBalanceConsumed === true ||
      (typeof c.carriedToChargeId === 'string' && c.carriedToChargeId.trim().length > 0)
    ) {
      allFormalOriginIds.add(c.id);
    }
  });
  destinationsReferencingOrigin.forEach((_dests, originId) => {
    allFormalOriginIds.add(originId);
  });

  for (const originId of allFormalOriginIds) {
    const origin = chargesById.get(originId);
    const referencingDests = destinationsReferencingOrigin.get(originId) || [];

    if (!origin) {
      pushFinding({
        category: 'TRANSPORTE_SALDO',
        severity: 'ALTO',
        certainty: 'confirmado',
        chargeId: originId,
        relatedId: referencingDests.map((d) => d.id).join(', '),
        values: { referencingDestinations: referencingDests.length },
        description: `Cobrança(s) de destino (${referencingDests.map((d) => d.id).join(', ')}) referenciam origem inexistente (${originId}) em carriedFromChargeIds.`,
        rationale: 'A cobrança de origem informada no transporte não existe mais na coleção charges.',
      });
      continue;
    }

    formalCarryLinksCount += 1;
    const { vehicleTechnicalId, maskedPlate } = maskVehicleRef(
      origin.vehicleId,
      origin.vehiclePlate,
      vehiclesById
    );

    // C.1: Origem transportada mais de uma vez
    const uniqueDestIds = new Set<string>(referencingDests.map((d) => d.id));
    if (origin.carriedToChargeId && origin.carriedToChargeId.trim()) {
      uniqueDestIds.add(origin.carriedToChargeId.trim());
    }

    if (uniqueDestIds.size > 1) {
      originsTransportedMultipleTimes += 1;
      pushFinding({
        category: 'TRANSPORTE_SALDO',
        severity: 'CRÍTICO',
        certainty: 'confirmado',
        chargeId: origin.id,
        relatedId: Array.from(uniqueDestIds).join(', '),
        clientId: origin.clientId,
        referenceMonth: origin.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          destinationsCount: uniqueDestIds.size,
          originRemaining: centsToReais(toIntCents(origin.remainingBalance)),
          carriedBalanceAmount: centsToReais(toIntCents(origin.carriedBalanceAmount)),
        },
        description: `DUPLICIDADE DE TRANSPORTE: A origem ${origin.id} está vinculada a ${uniqueDestIds.size} cobranças de destino distintas (${Array.from(uniqueDestIds).join(', ')}).`,
        rationale: 'Um saldo residual só pode ser transportado uma única vez para uma única cobrança de destino.',
      });
    }

    // C.2: Origem referenciada por destino, mas NÃO marcada como consumida
    if (referencingDests.length > 0 && origin.carriedBalanceConsumed !== true) {
      originsWithUnmarkedConsumption += 1;
      pushFinding({
        category: 'TRANSPORTE_SALDO',
        severity: 'CRÍTICO',
        certainty: 'confirmado',
        chargeId: origin.id,
        relatedId: referencingDests.map((d) => d.id).join(', '),
        clientId: origin.clientId,
        referenceMonth: origin.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          carriedBalanceConsumed: Boolean(origin.carriedBalanceConsumed),
          carriedToChargeId: origin.carriedToChargeId || null,
          originRemaining: centsToReais(toIntCents(origin.remainingBalance)),
        },
        description: `Origem ${origin.id} foi incorporada por ${referencingDests.map((d) => d.id).join(', ')}, mas NÃO está marcada com carriedBalanceConsumed=true.`,
        rationale: 'Sem carriedBalanceConsumed=true, a origem continua sendo contabilizada como saldo em aberto e pode ser re-transportada.',
      });
    }

    // C.3: Destino informado na origem realmente existe?
    const declaredDestId =
      typeof origin.carriedToChargeId === 'string' ? origin.carriedToChargeId.trim() : '';
    const destCharge = declaredDestId ? chargesById.get(declaredDestId) : referencingDests[0];

    if (origin.carriedBalanceConsumed === true && (!declaredDestId || !chargesById.has(declaredDestId))) {
      originsMissingDestination += 1;
      pushFinding({
        category: 'TRANSPORTE_SALDO',
        severity: 'CRÍTICO',
        certainty: 'confirmado',
        chargeId: origin.id,
        relatedId: declaredDestId || 'AUSENTE',
        clientId: origin.clientId,
        referenceMonth: origin.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          originRemaining: centsToReais(toIntCents(origin.remainingBalance)),
          carriedBalanceAmount: centsToReais(toIntCents(origin.carriedBalanceAmount)),
          carriedToChargeId: declaredDestId || null,
        },
        description: `PERDA DE SALDO: Origem ${origin.id} está marcada como consumida (carriedBalanceConsumed=true), mas o destino ${declaredDestId || '(vazio)'} não existe em charges.`,
        rationale:
          'Quando a cobrança de destino é excluída sem reverter a origem, o saldo transportado desaparece do sistema e fica bloqueado para pagamento na origem.',
      });
    } else if (destCharge) {
      // C.4: Destino pertence ao mesmo cliente e veículo?
      if (origin.clientId !== destCharge.clientId) {
        pushFinding({
          category: 'TRANSPORTE_SALDO',
          severity: 'CRÍTICO',
          certainty: 'confirmado',
          chargeId: origin.id,
          relatedId: destCharge.id,
          clientId: origin.clientId,
          referenceMonth: origin.referenceMonth,
          relatedReferenceMonth: destCharge.referenceMonth,
          vehicleTechnicalId,
          maskedPlate,
          values: {
            originClientId: origin.clientId,
            destClientId: destCharge.clientId,
          },
          description: `Transporte cruzado entre clientes diferentes: origem ${origin.id} (${origin.clientId}) -> destino ${destCharge.id} (${destCharge.clientId}).`,
          rationale: 'O saldo residual nunca pode ser transferido para outro cliente.',
        });
      }

      if (!origin.isPlanCharge && !destCharge.isPlanCharge && origin.vehicleId !== destCharge.vehicleId) {
        pushFinding({
          category: 'TRANSPORTE_SALDO',
          severity: 'ALTO',
          certainty: 'confirmado',
          chargeId: origin.id,
          relatedId: destCharge.id,
          clientId: origin.clientId,
          referenceMonth: origin.referenceMonth,
          relatedReferenceMonth: destCharge.referenceMonth,
          vehicleTechnicalId,
          maskedPlate,
          values: {
            originVehicleId: origin.vehicleId,
            destVehicleId: destCharge.vehicleId,
          },
          description: `Transporte entre veículos diferentes do mesmo cliente: origem ${origin.id} (${origin.vehicleId}) -> destino ${destCharge.id} (${destCharge.vehicleId}).`,
          rationale: 'Na regra de mensalidade individual por veículo, o saldo deve migrar apenas para o mesmo veículo.',
        });
      }

      // C.5: Competência correta (destino estritamente posterior à origem)
      if (compareReferenceMonth(destCharge.referenceMonth, origin.referenceMonth) <= 0) {
        pushFinding({
          category: 'TRANSPORTE_SALDO',
          severity: 'ALTO',
          certainty: 'confirmado',
          chargeId: origin.id,
          relatedId: destCharge.id,
          clientId: origin.clientId,
          referenceMonth: origin.referenceMonth,
          relatedReferenceMonth: destCharge.referenceMonth,
          vehicleTechnicalId,
          maskedPlate,
          values: {
            originReferenceMonth: origin.referenceMonth,
            destReferenceMonth: destCharge.referenceMonth,
          },
          description: `Competência de destino (${destCharge.referenceMonth}) não é posterior à competência de origem (${origin.referenceMonth}).`,
          rationale: 'O transporte de saldo deve ocorrer sempre para uma competência futura.',
        });
      } else if (
        origin.carriedToReferenceMonth &&
        origin.carriedToReferenceMonth !== destCharge.referenceMonth
      ) {
        pushFinding({
          category: 'TRANSPORTE_SALDO',
          severity: 'MÉDIO',
          certainty: 'confirmado',
          chargeId: origin.id,
          relatedId: destCharge.id,
          clientId: origin.clientId,
          referenceMonth: origin.referenceMonth,
          relatedReferenceMonth: destCharge.referenceMonth,
          vehicleTechnicalId,
          maskedPlate,
          values: {
            carriedToReferenceMonth: origin.carriedToReferenceMonth,
            actualDestReferenceMonth: destCharge.referenceMonth,
          },
          description: `Divergência de metadado: origin.carriedToReferenceMonth (${origin.carriedToReferenceMonth}) difere de dest.referenceMonth (${destCharge.referenceMonth}).`,
          rationale: 'Inconsistência de rastreabilidade entre os documentos de origem e destino.',
        });
      }

      // C.6: Valor transportado corresponde ao saldo efetivo da origem?
      const originRawRemCents = toIntCents(getRawChargeRemainingBalance(origin));
      const originCarriedAmtCents = toIntCents(origin.carriedBalanceAmount);
      const destSourceEntry = (sourceAmountsByOriginFromDest.get(origin.id) || []).find(
        (s) => s.destId === destCharge.id
      );

      if (
        origin.carriedBalanceAmount !== undefined &&
        Math.abs(originCarriedAmtCents - originRawRemCents) > CENTS_TOLERANCE
      ) {
        pushFinding({
          category: 'TRANSPORTE_SALDO',
          severity: 'ALTO',
          certainty: 'confirmado',
          chargeId: origin.id,
          relatedId: destCharge.id,
          clientId: origin.clientId,
          referenceMonth: origin.referenceMonth,
          relatedReferenceMonth: destCharge.referenceMonth,
          vehicleTechnicalId,
          maskedPlate,
          values: {
            originRemainingBalance: centsToReais(originRawRemCents),
            originCarriedBalanceAmount: centsToReais(originCarriedAmtCents),
            difference: centsToReais(originRawRemCents - originCarriedAmtCents),
          },
          description: `Valor transportado registrado na origem (${formatCentsBr(originCarriedAmtCents)}) diverge do remainingBalance histórico da origem (${formatCentsBr(originRawRemCents)}).`,
          rationale: 'Pode indicar pagamento posterior indevido na origem ou transporte parcial inconsistente.',
        });
      }

      if (
        destSourceEntry &&
        origin.carriedBalanceAmount !== undefined &&
        Math.abs(destSourceEntry.amountCents - originCarriedAmtCents) > CENTS_TOLERANCE
      ) {
        pushFinding({
          category: 'TRANSPORTE_SALDO',
          severity: 'ALTO',
          certainty: 'confirmado',
          chargeId: origin.id,
          relatedId: destCharge.id,
          clientId: origin.clientId,
          referenceMonth: origin.referenceMonth,
          relatedReferenceMonth: destCharge.referenceMonth,
          vehicleTechnicalId,
          maskedPlate,
          values: {
            originCarriedBalanceAmount: centsToReais(originCarriedAmtCents),
            destSourceAmount: centsToReais(destSourceEntry.amountCents),
            difference: centsToReais(destSourceEntry.amountCents - originCarriedAmtCents),
          },
          description: `Valor registrado em dest.carriedBalanceSources (${formatCentsBr(destSourceEntry.amountCents)}) difere de origin.carriedBalanceAmount (${formatCentsBr(originCarriedAmtCents)}).`,
          rationale: 'Origem e destino devem concordar exatamente no valor transportado.',
        });
      }

      // C.7: Verificar se o saldo efetivo da origem após transporte ainda permanece aberto
      const effectiveOpenAfterCarryCents = toIntCents(getChargeEffectiveOpenBalance(origin));
      if (effectiveOpenAfterCarryCents > CENTS_TOLERANCE) {
        pushFinding({
          category: 'TRANSPORTE_SALDO',
          severity: 'ALTO',
          certainty: 'confirmado',
          chargeId: origin.id,
          relatedId: destCharge.id,
          clientId: origin.clientId,
          referenceMonth: origin.referenceMonth,
          relatedReferenceMonth: destCharge.referenceMonth,
          vehicleTechnicalId,
          maskedPlate,
          values: {
            originRawRemaining: centsToReais(originRawRemCents),
            originCarriedAmount: centsToReais(originCarriedAmtCents),
            effectiveOpenRemaining: centsToReais(effectiveOpenAfterCarryCents),
          },
          description: `Mesmo marcada como transportada, a origem ${origin.id} ainda mantém saldo efetivo aberto de ${formatCentsBr(effectiveOpenAfterCarryCents)}.`,
          rationale: 'O valor transportado foi menor que o remainingBalance da origem, deixando resíduo aberto que exige verificação.',
        });
      }

      // C.8: Verificar se houve pagamento na origem DEPOIS de carriedBalanceAt
      if (origin.carriedBalanceAt) {
        const originPayments = paymentLinksByChargeId.get(origin.id) || [];
        const carryDateOnly = origin.carriedBalanceAt.slice(0, 10);
        const laterPayments = originPayments.filter(
          (p) => p.paymentDate && p.paymentDate > carryDateOnly
        );
        if (laterPayments.length > 0) {
          pushFinding({
            category: 'TRANSPORTE_SALDO',
            severity: 'CRÍTICO',
            certainty: 'provável',
            chargeId: origin.id,
            relatedId: laterPayments.map((p) => p.paymentId).join(', '),
            clientId: origin.clientId,
            referenceMonth: origin.referenceMonth,
            relatedReferenceMonth: destCharge.referenceMonth,
            vehicleTechnicalId,
            maskedPlate,
            values: {
              carriedBalanceAt: origin.carriedBalanceAt,
              laterPaymentsTotal: centsToReais(
                laterPayments.reduce((acc, p) => acc + p.amountCents, 0)
              ),
              destChargeId: destCharge.id,
            },
            description: `Origem ${origin.id} possui pagamento(s) com data posterior ao transporte (${origin.carriedBalanceAt}).`,
            rationale: 'Pagamento recebido na origem após o saldo já ter migrado para o destino gera risco direto de cobrança em dobro.',
          });
        }
      }
    }
  }

  // ==========================================================================
  // C.9: DETECÇÃO FORENSE DE TRANSPORTES LEGADOS PRÉ-ETAPA A2 (SEM CAMPOS NOVOS)
  // ==========================================================================
  const legacyCarryCandidates: LegacyCarryCandidateReport[] = [];
  const legacyCategoryCounts: Record<LegacyCarryCategory, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
  };

  let legacySuspectOriginSumCents = 0;
  let legacySuspectDestCarriedSumCents = 0;
  let comparableOriginSumCents = 0;
  let comparableDestSumCents = 0;
  let hasComparableLegacyPair = false;
  const countedSuspectDestIds = new Set<string>();

  const candidateOrigins = charges.filter((c) => {
    const remCents = toIntCents(getRawChargeRemainingBalance(c));
    const isOpenStatus = c.status === 'pendente' || c.status === 'parcial';
    const hasCarryFlag =
      c.carriedBalanceConsumed === true ||
      (typeof c.carriedToChargeId === 'string' && c.carriedToChargeId.trim().length > 0);
    return c.balanceHandling === 'next_month' && remCents > CENTS_TOLERANCE && isOpenStatus && !hasCarryFlag;
  });

  // Destinos sem rastreabilidade formal A2 que possuem previousBalanceCarried > 0
  const unlinkedCarriedDestinations = charges.filter((c) => {
    if (c.status === 'cancelado') return false;
    const prevCents = toIntCents(c.previousBalanceCarried);
    const hasFormalSources =
      (Array.isArray(c.carriedFromChargeIds) && c.carriedFromChargeIds.length > 0) ||
      (Array.isArray(c.carriedBalanceSources) && c.carriedBalanceSources.length > 0);
    return prevCents > CENTS_TOLERANCE && !hasFormalSources;
  });

  for (const origin of candidateOrigins) {
    const originRemCents = toIntCents(getRawChargeRemainingBalance(origin));
    const { vehicleTechnicalId, maskedPlate } = maskVehicleRef(
      origin.vehicleId,
      origin.vehiclePlate,
      vehiclesById
    );
    const originPayments = paymentLinksByChargeId.get(origin.id) || [];
    const originPayTotalCents = originPayments.reduce((acc, p) => acc + p.amountCents, 0);
    const originAudits = auditLogsByEntityId.get(origin.id) || [];

    const originVehicleObj: Pick<Vehicle, 'id' | 'clientId' | 'plate'> = {
      id: origin.vehicleId || '',
      clientId: origin.clientId || '',
      plate: origin.vehiclePlate || vehiclesById.get(origin.vehicleId)?.plate || '',
    };

    // Buscar destinos posteriores plausíveis (mesmo cliente + mesmo veículo ou cobertura de plano)
    const matchingDests = unlinkedCarriedDestinations
      .filter((dest) => {
        if (dest.id === origin.id) return false;
        if (dest.clientId !== origin.clientId) return false;
        if (compareReferenceMonth(dest.referenceMonth, origin.referenceMonth) <= 0) return false;

        // Relação por veículo (não associar apenas pelo mesmo cliente!)
        const sameVehicle =
          Boolean(origin.vehicleId) && Boolean(dest.vehicleId) && origin.vehicleId === dest.vehicleId;
        const destCoversOriginVehicle =
          Boolean(origin.vehicleId || originVehicleObj.plate) &&
          doesChargeCoverVehicle(dest, originVehicleObj);
        const originPlanCoversDestVehicle =
          origin.isPlanCharge === true &&
          Boolean(dest.vehicleId) &&
          doesChargeCoverVehicle(origin, {
            id: dest.vehicleId,
            clientId: dest.clientId,
            plate: dest.vehiclePlate || vehiclesById.get(dest.vehicleId)?.plate || '',
          });

        return sameVehicle || destCoversOriginVehicle || originPlanCoversDestVehicle;
      })
      .sort((a, b) => compareReferenceMonth(a.referenceMonth, b.referenceMonth));

    const expectedNextMonth = getNextReferenceMonth(origin.referenceMonth);
    const bestDest =
      matchingDests.find(
        (d) =>
          d.referenceMonth === expectedNextMonth &&
          Math.abs(toIntCents(d.previousBalanceCarried) - originRemCents) <= CENTS_TOLERANCE
      ) ||
      matchingDests.find((d) => Math.abs(toIntCents(d.previousBalanceCarried) - originRemCents) <= CENTS_TOLERANCE) ||
      matchingDests.find((d) => d.referenceMonth === expectedNextMonth) ||
      matchingDests[0] ||
      null;

    const evidences: string[] = [];
    let legacyCategory: LegacyCarryCategory = 'A';
    let certainty: ForensicCertainty = 'confirmado';
    let recommendation = 'Nenhuma cobrança posterior compatível encontrada. Aguardar conferência antes de gerar próxima competência.';
    let destCarriedCents: number | null = null;
    let diffCents: number | null = null;
    let destPayCount = 0;
    let destPayTotalCents = 0;
    let totalAuditEvidenceCount = originAudits.length;

    if (!bestDest) {
      legacyCategory = 'A';
      certainty = 'confirmado';
      evidences.push(
        `Nenhuma cobrança posterior com previousBalanceCarried > 0 para o mesmo cliente e veículo (${maskedPlate}).`
      );
      if (origin.isPlanCharge) {
        evidences.push('Origem é cobrança legada de plano (isPlanCharge=true): não será transportada automaticamente.');
        recommendation = 'Cobrança de plano legada com saldo em aberto: avaliar baixa manual ou negociação.';
      } else {
        recommendation =
          'Sem indício de transporte anterior. Na próxima geração mensal, a Etapa A2 transportará este saldo uma única vez de forma atômica.';
      }
    } else {
      destCarriedCents = toIntCents(bestDest.previousBalanceCarried);
      diffCents = destCarriedCents - originRemCents;
      const destPayments = paymentLinksByChargeId.get(bestDest.id) || [];
      destPayCount = destPayments.length;
      destPayTotalCents = destPayments.reduce((acc, p) => acc + p.amountCents, 0);
      const destAudits = auditLogsByEntityId.get(bestDest.id) || [];
      totalAuditEvidenceCount += destAudits.length;

      const exactValueMatch = Math.abs(diffCents) <= CENTS_TOLERANCE;
      const exactNextMonth = bestDest.referenceMonth === expectedNextMonth;
      const exactVehicleMatch = Boolean(origin.vehicleId) && origin.vehicleId === bestDest.vehicleId;
      const destOpenCents = toIntCents(getChargeEffectiveOpenBalance(bestDest));

      evidences.push(`Destino candidato ${bestDest.id} (${bestDest.referenceMonth}) com previousBalanceCarried=${formatCentsBr(destCarriedCents)}.`);
      if (exactVehicleMatch) evidences.push('Mesmo clientId e mesmo vehicleId.');
      else evidences.push('Correspondência via cobertura de plano legado (isPlanCharge / vehicleIds / placa).');
      if (exactNextMonth) evidences.push(`Competência imediatamente seguinte (${origin.referenceMonth} -> ${bestDest.referenceMonth}).`);
      else evidences.push(`Competência posterior não consecutiva (${origin.referenceMonth} -> ${bestDest.referenceMonth}).`);
      if (exactValueMatch) evidences.push('Valor de previousBalanceCarried coincide exatamente com o saldo restante da origem.');
      else evidences.push(`Diferença de ${formatCentsBr(diffCents)} entre saldo da origem e previousBalanceCarried do destino.`);
      if (destPayTotalCents > 0) evidences.push(`Destino já possui ${destPayCount} pagamento(s) somando ${formatCentsBr(destPayTotalCents)}.`);
      if (originPayTotalCents > 0) evidences.push(`Origem possui ${originPayments.length} pagamento(s) somando ${formatCentsBr(originPayTotalCents)}.`);
      if (matchingDests.length > 1) {
        evidences.push(`Atenção: existem ${matchingDests.length} cobranças posteriores com previousBalanceCarried > 0 para este vínculo.`);
      }

      if (exactValueMatch && exactVehicleMatch && (destOpenCents > CENTS_TOLERANCE || destPayTotalCents > 0)) {
        // Origem ainda aberta (sem carriedBalanceConsumed) + destino com exatamente o mesmo valor incorporado
        legacyCategory = 'D';
        certainty = exactNextMonth ? 'confirmado' : 'provável';
        recommendation =
          'DUPLICIDADE PROVÁVEL / RISCO DE RE-TRANSPORTE: Conferir histórico com cliente; não executar nova geração mensal antes de marcar formalmente a origem como consumida ou ajustar via procedimento autorizado.';
      } else if (exactValueMatch && exactVehicleMatch && exactNextMonth) {
        legacyCategory = 'C';
        certainty = 'provável';
        recommendation =
          'Forte evidência de transporte anterior à Etapa A2 sem campos de controle. Conferir pagamentos e validar marcação retroativa de rastreabilidade antes da próxima virada mensal.';
      } else if (matchingDests.length > 1 || (!exactVehicleMatch && !exactValueMatch)) {
        legacyCategory = 'E';
        certainty = 'inconclusivo';
        recommendation =
          'Caso inconclusivo (múltiplos destinos ou divergência de valor/veículo). Requer revisão manual detalhada com o extrato do cliente.';
      } else {
        legacyCategory = 'B';
        certainty = 'provável';
        recommendation =
          'Possível transporte legado com diferença de valor ou salto de competência. Verificar manualmente se houve acúmulo de mais de um mês anterior.';
      }

      // Acumular somas de suspeitas (B, C, D, E)
      legacySuspectOriginSumCents += originRemCents;
      if (!countedSuspectDestIds.has(bestDest.id)) {
        countedSuspectDestIds.add(bestDest.id);
        legacySuspectDestCarriedSumCents += destCarriedCents;
      }
      if (exactVehicleMatch) {
        hasComparableLegacyPair = true;
        comparableOriginSumCents += originRemCents;
        comparableDestSumCents += destCarriedCents;
      }

      // Registrar achado na lista geral
      const severityForLegacy: ForensicSeverity =
        legacyCategory === 'D'
          ? 'CRÍTICO'
          : legacyCategory === 'C'
          ? 'ALTO'
          : legacyCategory === 'B' || legacyCategory === 'E'
          ? 'MÉDIO'
          : 'INFORMATIVO';

      pushFinding({
        category: 'TRANSPORTE_SALDO',
        severity: severityForLegacy,
        certainty,
        chargeId: origin.id,
        relatedId: bestDest.id,
        clientId: origin.clientId,
        referenceMonth: origin.referenceMonth,
        relatedReferenceMonth: bestDest.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        legacyCategory,
        values: {
          originRemaining: centsToReais(originRemCents),
          destPreviousBalanceCarried: centsToReais(destCarriedCents),
          difference: centsToReais(diffCents),
          originStatus: origin.status,
          destStatus: bestDest.status,
          destPaidAmount: centsToReais(toIntCents(bestDest.paidAmount)),
        },
        description: `[Categoria ${legacyCategory}] Origem pré-A2 ${origin.id} (${origin.referenceMonth}, saldo ${formatCentsBr(originRemCents)}) sem carriedBalanceConsumed possui possível destino ${bestDest.id} (${bestDest.referenceMonth}, previousBalanceCarried ${formatCentsBr(destCarriedCents)}).`,
        rationale: evidences.join(' '),
      });
    }

    legacyCategoryCounts[legacyCategory] += 1;
    legacyCarryCandidates.push({
      originChargeId: origin.id,
      possibleDestinationChargeId: bestDest ? bestDest.id : null,
      clientId: origin.clientId || 'SEM_CLIENT_ID',
      vehicleTechnicalId,
      maskedPlate,
      originReferenceMonth: origin.referenceMonth || 'N/D',
      destinationReferenceMonth: bestDest ? bestDest.referenceMonth : null,
      originRemainingCents: originRemCents,
      destinationPreviousCarriedCents: destCarriedCents,
      differenceCents: diffCents,
      paymentsOnOriginCount: originPayments.length,
      paymentsOnOriginTotalCents: originPayTotalCents,
      paymentsOnDestCount: destPayCount,
      paymentsOnDestTotalCents: destPayTotalCents,
      auditEvidenceCount: totalAuditEvidenceCount,
      evidences,
      legacyCategory,
      certainty,
      recommendation,
    });
  }

  // Também reportar destinos com previousBalanceCarried > 0 sem carriedFromChargeIds que não casaram com nenhuma origem candidata (ex.: origem foi quitada depois ou excluída)
  for (const dest of unlinkedCarriedDestinations) {
    if (countedSuspectDestIds.has(dest.id)) continue;
    const prevCents = toIntCents(dest.previousBalanceCarried);
    const { vehicleTechnicalId, maskedPlate } = maskVehicleRef(
      dest.vehicleId,
      dest.vehiclePlate,
      vehiclesById
    );
    pushFinding({
      category: 'TRANSPORTE_SALDO',
      severity: 'INFORMATIVO',
      certainty: 'inconclusivo',
      chargeId: dest.id,
      clientId: dest.clientId,
      referenceMonth: dest.referenceMonth,
      vehicleTechnicalId,
      maskedPlate,
      values: {
        previousBalanceCarried: centsToReais(prevCents),
        destStatus: dest.status,
        totalAmount: centsToReais(toIntCents(dest.totalAmount)),
      },
      description: `Cobrança ${dest.id} (${dest.referenceMonth}) possui previousBalanceCarried de ${formatCentsBr(prevCents)} sem carriedFromChargeIds (registro legado pré-A2 ou ajuste manual) e sem origem aberta correspondente.`,
      rationale:
        'A ausência dos novos campos em registros antigos não significa erro por si só; pode indicar transporte histórico cuja origem já foi quitada ou lançada manualmente.',
    });
  }

  // ==========================================================================
  // C.10: COBRANÇAS ANTIGAS DE PLANOS COM SALDO PENDENTE (TRATAMENTO MANUAL)
  // ==========================================================================
  let legacyPlanPendingManualCount = 0;
  for (const charge of charges) {
    if (charge.status === 'cancelado') continue;
    if (charge.isPlanCharge !== true) continue;
    const effectiveOpenCents = toIntCents(getChargeEffectiveOpenBalance(charge));
    if (effectiveOpenCents <= CENTS_TOLERANCE) continue;

    if (charge.balanceHandling === 'next_month' || charge.status === 'parcial' || charge.status === 'pendente') {
      legacyPlanPendingManualCount += 1;
      const isNextMonth = charge.balanceHandling === 'next_month';
      const { vehicleTechnicalId, maskedPlate } = maskVehicleRef(
        charge.vehicleId,
        charge.vehiclePlate,
        vehiclesById
      );
      pushFinding({
        category: 'TRANSPORTE_SALDO',
        severity: isNextMonth ? 'MÉDIO' : 'BAIXO',
        certainty: 'confirmado',
        chargeId: charge.id,
        clientId: charge.clientId,
        referenceMonth: charge.referenceMonth,
        vehicleTechnicalId,
        maskedPlate,
        values: {
          status: charge.status,
          balanceHandling: charge.balanceHandling || 'none',
          effectiveOpenBalance: centsToReais(effectiveOpenCents),
          vehicleIdsCount: Array.isArray(charge.vehicleIds) ? charge.vehicleIds.length : 0,
        },
        description: `Cobrança antiga de plano ${charge.id} (${charge.referenceMonth}) mantém saldo aberto de ${formatCentsBr(effectiveOpenCents)} (balanceHandling=${charge.balanceHandling || 'none'}).`,
        rationale: isNextMonth
          ? 'Pela regra da Etapa A2, saldos de cobranças de plano multi-veículo não são transportados automaticamente para um único veículo e exigem tratamento manual.'
          : 'Cobrança legada de plano ainda em aberto; mantida preservada para baixa manual.',
      });
    }
  }

  // Contagem final por severidade
  const findingsBySeverity: Record<ForensicSeverity, number> = {
    'CRÍTICO': 0,
    ALTO: 0,
    'MÉDIO': 0,
    BAIXO: 0,
    INFORMATIVO: 0,
  };
  const severityOrder: Record<ForensicSeverity, number> = {
    'CRÍTICO': 0,
    ALTO: 1,
    'MÉDIO': 2,
    BAIXO: 3,
    INFORMATIVO: 4,
  };

  findings.forEach((f) => {
    findingsBySeverity[f.severity] += 1;
  });

  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const totalDocumentsExamined = collectionsExamined.reduce((acc, s) => acc + s.documentsRead, 0);

  return {
    metadata: {
      executedAtIso: now.toISOString(),
      executedAtBr: now.toLocaleString('pt-BR'),
      projectId: firebaseConfig.projectId || 'autotec-476bb',
      databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
      expectedRegion: 'southamerica-east1',
      readOnlyConfirmed: true,
      allDataFromServerConfirmed: collectionsExamined.every((c) => c.verifiedFromServer),
      collectionsExamined,
      totalDocumentsExamined,
      engineVersion: 'forensic-readonly-a2.1',
    },
    summary: {
      charges: {
        total: charges.length,
        paid: paidCount,
        pending: pendingCount,
        partial: partialCount,
        cancelled: cancelledCount,
        postponed: postponedCount,
        individualByVehicle: individualByVehicleCount,
        legacyPlanCharges: legacyPlanChargesCount,
        withBalanceHandlingNextMonth: withBalanceHandlingNextMonthCount,
        withFormalCarryConsumed: withFormalCarryConsumedCount,
        withFormalCarrySources: withFormalCarrySourcesCount,
        withPreviousBalanceCarriedPositive: withPreviousBalanceCarriedPositiveCount,
        duplicateGroupsDetected,
      },
      payments: {
        total: payments.length,
        individualCount: individualPaymentsCount,
        consolidatedCount: consolidatedPaymentsCount,
        totalAmountCents: totalPaymentsAmountCents,
        orphanPaymentsCount,
        paidChargesWithoutCompatiblePaymentCount,
        chargePaidDivergenceCount,
      },
      carryOver: {
        formalCarryLinksCount,
        originsTransportedMultipleTimes,
        originsMissingDestination,
        originsWithUnmarkedConsumption,
        legacyPreA2CandidatesTotal: legacyCarryCandidates.length,
        legacyCategoryCounts,
        legacySuspectOriginSumCents,
        legacySuspectDestCarriedSumCents,
        legacyComparableDifferenceCents: hasComparableLegacyPair
          ? comparableDestSumCents - comparableOriginSumCents
          : null,
        legacyPlanPendingManualCount,
      },
      integrity: {
        negativeValueCount,
        mathDivergenceCount,
        statusInconsistencyCount,
        missingReferenceCount,
      },
      findingsBySeverity,
      totalFindings: findings.length,
    },
    legacyCarryCandidates,
    findings,
  };
}

// ============================================================================
// PONTO DE ENTRADA DA AUDITORIA REAL NO FIRESTORE (SOMENTE LEITURA DO SERVIDOR)
// ============================================================================

export async function runRealFirestoreForensicAudit(
  onProgress?: (update: ForensicProgressUpdate) => void
): Promise<ForensicAuditReport> {
  // Verificação defensiva da sessão autenticada antes de disparar qualquer consulta
  const currentUser = auth.currentUser;
  const email = (currentUser?.email || '').toLowerCase().trim();
  if (!currentUser || email !== AUTHORIZED_FORENSIC_ADMIN_EMAIL.toLowerCase()) {
    throw new Error(
      `Sessão administrativa não autorizada. A auditoria forense exige autenticação ativa para ${AUTHORIZED_FORENSIC_ADMIN_EMAIL}.`
    );
  }

  onProgress?.({ stage: 'Iniciando leitura paginada do servidor (somente leitura)...' });

  // Leitura sequencial segura do servidor (getDocsFromServer) — falha interrompe imediatamente
  const chargesResult = await fetchCollectionFromServerPaginated<Charge>('charges', onProgress);
  const paymentsResult = await fetchCollectionFromServerPaginated<Payment>('payments', onProgress);
  const auditLogsResult = await fetchCollectionFromServerPaginated<AuditLog>('audit_logs', onProgress);
  // Coleção auxiliar estritamente para esclarecer vínculos técnicos de veículos (placas mascaradas)
  const vehiclesResult = await fetchCollectionFromServerPaginated<Vehicle>('vehicles', onProgress);

  onProgress?.({ stage: 'Executando verificações financeiras e de transporte de saldos em memória...' });

  return analyzeForensicDataset({
    charges: chargesResult.docs,
    payments: paymentsResult.docs,
    auditLogs: auditLogsResult.docs,
    vehicles: vehiclesResult.docs,
    collectionsExamined: [
      chargesResult.stats,
      paymentsResult.stats,
      auditLogsResult.stats,
      vehiclesResult.stats,
    ],
  });
}

// ============================================================================
// EXPORTADORES SANITIZADOS (SEM PII, SEM CREDENCIAIS, SEM DOCUMENTOS COMPLETOS)
// ============================================================================

export function formatForensicReportAsJson(report: ForensicAuditReport): string {
  // Exporta exclusivamente os dados técnicos agregados e achados sanitizados (nunca documentos crus)
  const sanitizedPayload = {
    relatorio: 'AUTOTEC FINANCAS - AUDITORIA FORENSE (SOMENTE LEITURA)',
    metadata: report.metadata,
    resumo: {
      cobrancas: report.summary.charges,
      pagamentos: {
        ...report.summary.payments,
        totalAmountReais: centsToReais(report.summary.payments.totalAmountCents),
      },
      transporteSaldos: {
        ...report.summary.carryOver,
        legacySuspectOriginSumReais: centsToReais(report.summary.carryOver.legacySuspectOriginSumCents),
        legacySuspectDestCarriedSumReais: centsToReais(
          report.summary.carryOver.legacySuspectDestCarriedSumCents
        ),
        legacyComparableDifferenceReais:
          report.summary.carryOver.legacyComparableDifferenceCents !== null
            ? centsToReais(report.summary.carryOver.legacyComparableDifferenceCents)
            : null,
      },
      integridade: report.summary.integrity,
      achadosPorGravidade: report.summary.findingsBySeverity,
      totalAchados: report.summary.totalFindings,
    },
    candidatasLegadasPreA2: report.legacyCarryCandidates.map((c) => ({
      idOrigem: c.originChargeId,
      idPossivelDestino: c.possibleDestinationChargeId,
      clientId: c.clientId,
      vehicleId: c.vehicleTechnicalId,
      placaMascarada: c.maskedPlate,
      competenciaOrigem: c.originReferenceMonth,
      competenciaDestino: c.destinationReferenceMonth,
      saldoOrigemReais: centsToReais(c.originRemainingCents),
      valorTransportadoDestinoReais:
        c.destinationPreviousCarriedCents !== null
          ? centsToReais(c.destinationPreviousCarriedCents)
          : null,
      diferencaReais: c.differenceCents !== null ? centsToReais(c.differenceCents) : null,
      pagamentosOrigem: {
        quantidade: c.paymentsOnOriginCount,
        totalReais: centsToReais(c.paymentsOnOriginTotalCents),
      },
      pagamentosDestino: {
        quantidade: c.paymentsOnDestCount,
        totalReais: centsToReais(c.paymentsOnDestTotalCents),
      },
      evidenciasAuditLogs: c.auditEvidenceCount,
      evidencias: c.evidences,
      categoriaLegada: c.legacyCategory,
      certeza: c.certainty,
      recomendacao: c.recommendation,
    })),
    achados: report.findings.map((f) => ({
      id: f.id,
      categoria: f.category,
      gravidade: f.severity,
      certeza: f.certainty,
      chargeId: f.chargeId,
      relatedId: f.relatedId || null,
      clientId: f.clientId || null,
      competencia: f.referenceMonth || null,
      competenciaRelacionada: f.relatedReferenceMonth || null,
      vehicleId: f.vehicleTechnicalId || null,
      placaMascarada: f.maskedPlate || null,
      valores: f.values,
      descricao: f.description,
      motivoClassificacao: f.rationale,
      categoriaLegada: f.legacyCategory || null,
    })),
  };

  return JSON.stringify(sanitizedPayload, null, 2);
}

export function formatForensicReportAsText(report: ForensicAuditReport): string {
  const { metadata, summary, legacyCarryCandidates, findings } = report;
  const lines: string[] = [];

  lines.push('====================================================================');
  lines.push('AUTOTEC FINANÇAS — RELATÓRIO DE AUDITORIA FORENSE (SOMENTE LEITURA)');
  lines.push('====================================================================');
  lines.push(`Data/Hora: ${metadata.executedAtBr} (${metadata.executedAtIso})`);
  lines.push(`Projeto Firebase: ${metadata.projectId}`);
  lines.push(`Banco Firestore: ${metadata.databaseId} (Região esperada: ${metadata.expectedRegion})`);
  lines.push(`Modo Somente Leitura: CONFIRMADO (nenhuma escrita realizada)`);
  lines.push(
    `Dados Confirmados do Servidor (fromCache=false): ${metadata.allDataFromServerConfirmed ? 'SIM' : 'NÃO'}`
  );
  lines.push(`Total de Documentos Examinados: ${metadata.totalDocumentsExamined}`);
  metadata.collectionsExamined.forEach((c) => {
    lines.push(
      `  - ${c.collectionName}: ${c.documentsRead} docs (${c.pagesFetched} página(s), servidor=${c.verifiedFromServer ? 'SIM' : 'NÃO'})`
    );
  });
  lines.push('');

  lines.push('--- A. COBRANÇAS ---');
  lines.push(`Total: ${summary.charges.total}`);
  lines.push(
    `Pagas: ${summary.charges.paid} | Pendentes: ${summary.charges.pending} | Parciais: ${summary.charges.partial} | Canceladas: ${summary.charges.cancelled} | Adiadas: ${summary.charges.postponed}`
  );
  lines.push(
    `Individuais por veículo: ${summary.charges.individualByVehicle} | Planos legados (isPlanCharge): ${summary.charges.legacyPlanCharges}`
  );
  lines.push(
    `balanceHandling='next_month': ${summary.charges.withBalanceHandlingNextMonth} | Consumidas formalmente: ${summary.charges.withFormalCarryConsumed} | Destinos formais: ${summary.charges.withFormalCarrySources} | previousBalanceCarried > 0: ${summary.charges.withPreviousBalanceCarriedPositive}`
  );
  lines.push(`Grupos duplicados (mesmo veículo + competência): ${summary.charges.duplicateGroupsDetected}`);
  lines.push('');

  lines.push('--- B. PAGAMENTOS ---');
  lines.push(
    `Total: ${summary.payments.total} (Individuais: ${summary.payments.individualCount} | Consolidados: ${summary.payments.consolidatedCount})`
  );
  lines.push(`Valor total registrado em payments: ${formatCentsBr(summary.payments.totalAmountCents)}`);
  lines.push(
    `Órfãos (sem cobrança): ${summary.payments.orphanPaymentsCount} | Cobranças pagas sem pagamento vinculado: ${summary.payments.paidChargesWithoutCompatiblePaymentCount} | Divergências paidAmount vs payments: ${summary.payments.chargePaidDivergenceCount}`
  );
  lines.push('');

  lines.push('--- C. TRANSPORTE DE SALDOS (PRIORIDADE MÁXIMA) ---');
  lines.push(`Vínculos formais de transporte (Etapa A2): ${summary.carryOver.formalCarryLinksCount}`);
  lines.push(
    `Origens transportadas >1x: ${summary.carryOver.originsTransportedMultipleTimes} | Destinos inexistentes: ${summary.carryOver.originsMissingDestination} | Origens sem carriedBalanceConsumed: ${summary.carryOver.originsWithUnmarkedConsumption}`
  );
  lines.push(`Candidatas legadas pré-A2 (balanceHandling=next_month abertas sem controle): ${summary.carryOver.legacyPreA2CandidatesTotal}`);
  lines.push(
    `  Categorias A-E => A(Sem indício): ${summary.carryOver.legacyCategoryCounts.A} | B(Possível): ${summary.carryOver.legacyCategoryCounts.B} | C(Forte evidência): ${summary.carryOver.legacyCategoryCounts.C} | D(Possível duplicidade): ${summary.carryOver.legacyCategoryCounts.D} | E(Inconclusivo): ${summary.carryOver.legacyCategoryCounts.E}`
  );
  lines.push(
    `  Soma saldos origens suspeitas (B/C/D/E): ${formatCentsBr(summary.carryOver.legacySuspectOriginSumCents)}`
  );
  lines.push(
    `  Soma previousBalanceCarried destinos suspeitos: ${formatCentsBr(summary.carryOver.legacySuspectDestCarriedSumCents)}`
  );
  lines.push(
    `  Diferença nos pares comparáveis: ${
      summary.carryOver.legacyComparableDifferenceCents !== null
        ? formatCentsBr(summary.carryOver.legacyComparableDifferenceCents)
        : 'N/A'
    }`
  );
  lines.push(
    `Cobranças antigas de plano com saldo em aberto (tratamento manual): ${summary.carryOver.legacyPlanPendingManualCount}`
  );
  lines.push('');

  lines.push('--- D. INTEGRIDADE FINANCEIRA ---');
  lines.push(
    `Valores negativos: ${summary.integrity.negativeValueCount} | Divergências matemáticas: ${summary.integrity.mathDivergenceCount} | Status inconsistentes: ${summary.integrity.statusInconsistencyCount} | Referências ausentes: ${summary.integrity.missingReferenceCount}`
  );
  lines.push('');

  lines.push('--- RESUMO DE ACHADOS POR GRAVIDADE ---');
  lines.push(
    `CRÍTICO: ${summary.findingsBySeverity['CRÍTICO']} | ALTO: ${summary.findingsBySeverity.ALTO} | MÉDIO: ${summary.findingsBySeverity['MÉDIO']} | BAIXO: ${summary.findingsBySeverity.BAIXO} | INFORMATIVO: ${summary.findingsBySeverity.INFORMATIVO} (Total: ${summary.totalFindings})`
  );
  lines.push('');

  if (legacyCarryCandidates.length > 0) {
    lines.push('--- DETALHAMENTO DE CANDIDATAS LEGADAS PRÉ-A2 ---');
    legacyCarryCandidates.forEach((c, idx) => {
      lines.push(
        `${idx + 1}. [Cat ${c.legacyCategory} | ${c.certainty.toUpperCase()}] Origem=${c.originChargeId} (${c.originReferenceMonth}, saldo=${formatCentsBr(c.originRemainingCents)}) -> Destino=${c.possibleDestinationChargeId || 'NENHUM'} (${c.destinationReferenceMonth || '-'}, carried=${c.destinationPreviousCarriedCents !== null ? formatCentsBr(c.destinationPreviousCarriedCents) : '-'}) | ClientId=${c.clientId} | VehicleId=${c.vehicleTechnicalId} (${c.maskedPlate})`
      );
      lines.push(`   Evidências: ${c.evidences.join(' ')}`);
      lines.push(`   Recomendação: ${c.recommendation}`);
    });
    lines.push('');
  }

  lines.push('--- LISTA COMPLETA DE OCORRÊNCIAS ---');
  if (findings.length === 0) {
    lines.push('Nenhuma inconsistência detectada nas verificações executadas.');
  } else {
    findings.forEach((f) => {
      lines.push(
        `[${f.id}] [${f.severity}] [${f.category}] [Certeza: ${f.certainty}] Charge=${f.chargeId}${f.relatedId ? ` | Relacionado=${f.relatedId}` : ''}${f.referenceMonth ? ` | Comp=${f.referenceMonth}` : ''}${f.vehicleTechnicalId ? ` | Veículo=${f.vehicleTechnicalId} (${f.maskedPlate || 'N/D'})` : ''}`
      );
      lines.push(`  Valores: ${JSON.stringify(f.values)}`);
      lines.push(`  Descrição: ${f.description}`);
      lines.push(`  Motivo: ${f.rationale}`);
    });
  }

  lines.push('');
  lines.push('OBS: Nenhum dado pessoal (CPF, nome, telefone, endereço ou e-mail de clientes) nem credenciais foram incluídos neste relatório.');

  return lines.join('\n');
}
