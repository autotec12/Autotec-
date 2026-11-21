import React, { useMemo, useState } from 'react';
import { useAuth, OFFICIAL_ADMIN_EMAIL } from '../../context/AuthContext';
import { useSecurity } from '../../context/SecurityContext';
import {
  AUTHORIZED_FORENSIC_ADMIN_EMAIL,
  formatForensicReportAsJson,
  formatForensicReportAsText,
  runRealFirestoreForensicAudit,
  type ForensicAuditReport,
  type ForensicProgressUpdate,
  type ForensicSeverity,
} from '../../lib/forensicAudit';
import { formatCurrency } from '../../lib/calculations';
import {
  ShieldCheck,
  Search,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  Database,
  FileText,
  FileJson,
  Lock,
  Info,
  XCircle,
} from 'lucide-react';

const SEVERITY_BADGE_STYLES: Record<ForensicSeverity, string> = {
  'CRÍTICO': 'bg-rose-100 text-rose-900 border-rose-300',
  ALTO: 'bg-orange-100 text-orange-900 border-orange-300',
  'MÉDIO': 'bg-amber-100 text-amber-900 border-amber-300',
  BAIXO: 'bg-sky-100 text-sky-900 border-sky-300',
  INFORMATIVO: 'bg-slate-100 text-slate-700 border-slate-300',
};

const CERTAINTY_BADGE_STYLES = {
  confirmado: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  provável: 'bg-amber-50 text-amber-800 border-amber-200',
  inconclusivo: 'bg-slate-100 text-slate-700 border-slate-300',
} as const;

export const ForensicAuditSection: React.FC = () => {
  const { user } = useAuth();
  const { isUnlocked } = useSecurity();

  const [showConfirmBox, setShowConfirmBox] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ForensicProgressUpdate | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [report, setReport] = useState<ForensicAuditReport | null>(null);

  const [severityFilter, setSeverityFilter] = useState<'TODOS' | ForensicSeverity>('TODOS');
  const [exportFormat, setExportFormat] = useState<'text' | 'json'>('text');
  const [copiedState, setCopiedState] = useState<'idle' | 'copied' | 'error'>('idle');

  // Gate estrito em 3 camadas: autenticado + e-mail exato do admin + sistema desbloqueado via PIN
  const normalizedEmail = (user?.email || '').toLowerCase().trim();
  const isAuthorizedSession =
    Boolean(user) &&
    normalizedEmail === OFFICIAL_ADMIN_EMAIL.toLowerCase() &&
    normalizedEmail === AUTHORIZED_FORENSIC_ADMIN_EMAIL.toLowerCase() &&
    isUnlocked === true;

  const filteredFindings = useMemo(() => {
    if (!report) return [];
    if (severityFilter === 'TODOS') return report.findings;
    return report.findings.filter((f) => f.severity === severityFilter);
  }, [report, severityFilter]);

  if (!isAuthorizedSession) {
    return null;
  }

  const handleRequestRun = () => {
    if (isRunning) return;
    setErrorMessage(null);
    setShowConfirmBox(true);
  };

  const handleConfirmExecute = async () => {
    setShowConfirmBox(false);
    setErrorMessage(null);
    setReport(null);
    setCopiedState('idle');
    setIsRunning(true);
    setProgress({ stage: 'Conectando ao Cloud Firestore (somente leitura do servidor)...' });

    try {
      const result = await runRealFirestoreForensicAudit((update) => {
        setProgress(update);
      });
      setReport(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Erro desconhecido ao consultar o Cloud Firestore em modo leitura.';
      setErrorMessage(message);
      setReport(null);
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const handleCopyReport = async () => {
    if (!report) return;
    const content =
      exportFormat === 'json'
        ? formatForensicReportAsJson(report)
        : formatForensicReportAsText(report);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedState('copied');
      setTimeout(() => setCopiedState('idle'), 3500);
    } catch {
      setCopiedState('error');
      setTimeout(() => setCopiedState('idle'), 3500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Controles */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E2E4E0]">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-[#30334F]/10 text-[#30334F] rounded-xl shrink-0">
              <Search className="w-6 h-6 text-[#F28C1B]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-[#30334F] text-base uppercase tracking-wide">
                  AUDITORIA FORENSE — SOMENTE LEITURA
                </h3>
                <span className="text-2xs font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 uppercase">
                  Módulo Temporário de Diagnóstico
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Consulta paginada diretamente do servidor Cloud Firestore (
                <strong className="font-mono text-[#30334F]">getDocsFromServer</strong>) sobre as coleções reais{' '}
                <span className="font-mono">charges</span>, <span className="font-mono">payments</span>,{' '}
                <span className="font-mono">audit_logs</span> e <span className="font-mono">vehicles</span> para
                auditar integridade financeira e transporte de saldos das Etapas 1, A e A2.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRequestRun}
              disabled={isRunning}
              className="px-4 py-2.5 bg-[#30334F] hover:bg-[#222538] text-white rounded-xl text-xs font-black tracking-wide shadow-md shadow-[#30334F]/20 flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#F28C1B]" />
                  <span>CONSULTANDO SERVIDOR...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 text-[#F28C1B]" />
                  <span>EXECUTAR AUDITORIA FORENSE</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Garantias de Segurança */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[#30334F]">
              <Lock className="w-4 h-4 text-[#059669]" />
              Zero Operações de Escrita
            </div>
            <p className="text-2xs text-slate-600 leading-relaxed">
              Este módulo utiliza exclusivamente <strong>leitura do servidor</strong>. Não cria, altera, migra,
              baixa ou exclui nenhum documento do Firebase.
            </p>
          </div>

          <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[#30334F]">
              <ShieldCheck className="w-4 h-4 text-[#F28C1B]" />
              Sessão Administrativa Complementar
            </div>
            <p className="text-2xs text-slate-600 leading-relaxed">
              Visível apenas para <strong className="font-mono">{OFFICIAL_ADMIN_EMAIL}</strong> com PIN
              desbloqueado. Esta proteção de interface é <strong>complementar</strong> às regras do{' '}
              <span className="font-mono">firestore.rules</span> e não as substitui.
            </p>
          </div>

          <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[#30334F]">
              <Info className="w-4 h-4 text-sky-600" />
              Privacidade e Mascaramento
            </div>
            <p className="text-2xs text-slate-600 leading-relaxed">
              O relatório exibe apenas IDs técnicos, placas mascaradas e valores financeiros — nunca expõe CPF,
              telefone, endereço, e-mail de clientes ou credenciais.
            </p>
          </div>
        </div>

        {/* Caixa de Confirmação Explícita antes da Execução */}
        {showConfirmBox && !isRunning && (
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-amber-950">
                <p className="font-black uppercase tracking-wide">
                  Confirmação de Leitura em Produção — Projeto autotec-476bb
                </p>
                <p className="leading-relaxed">
                  Ao confirmar, serão consultados <strong>documentos reais do Cloud Firestore</strong> (coleções{' '}
                  <span className="font-mono font-bold">charges</span>,{' '}
                  <span className="font-mono font-bold">payments</span>,{' '}
                  <span className="font-mono font-bold">audit_logs</span> e{' '}
                  <span className="font-mono font-bold">vehicles</span>) <strong>exclusivamente para leitura</strong>{' '}
                  diretamente do servidor (<span className="font-mono">getDocsFromServer</span>). Nenhuma escrita,
                  correção, geração mensal ou alteração de dados será executada.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmBox(false)}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmExecute}
                className="px-4 py-2 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-2 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Leitura Real (Somente Leitura)
              </button>
            </div>
          </div>
        )}

        {/* Progresso da Leitura Paginada */}
        {isRunning && progress && (
          <div className="p-4 bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-[#F28C1B] shrink-0" />
            <div className="text-xs text-[#30334F]">
              <p className="font-bold">{progress.stage}</p>
              {progress.collectionName && (
                <p className="text-2xs text-slate-500 font-mono mt-0.5">
                  Coleção: {progress.collectionName} • Páginas lidas: {progress.pagesFetched || 0} • Documentos:{' '}
                  {progress.documentsRead || 0}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Erro de Permissão, Conexão, Cache ou Paginação */}
        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-rose-900">
              <p className="font-black uppercase">Auditoria Interrompida — Nenhum Resultado Parcial Exibido</p>
              <p className="leading-relaxed font-mono text-[11px] break-all">{errorMessage}</p>
              <p className="text-2xs text-rose-800">
                Verifique a conexão de rede e a sessão autenticada no Firebase antes de tentar novamente.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* RELATÓRIO NA TELA */}
      {report && (
        <div className="space-y-6">
          {/* Metadados da Consulta Real + Exportação */}
          <div className="bg-white border border-[#E2E4E0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#E2E4E0]">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-2xs font-black uppercase">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Leitura Confirmada do Servidor (fromCache = false)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#30334F]/10 text-[#30334F] text-2xs font-mono font-bold">
                    Projeto: {report.metadata.projectId}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#F8F9FA] text-slate-700 border border-[#E2E4E0] text-2xs font-mono">
                    Banco: {report.metadata.databaseId}
                  </span>
                </div>
                <p className="text-2xs text-slate-500 font-mono">
                  Executado em: {report.metadata.executedAtBr} ({report.metadata.executedAtIso}) • Região esperada:{' '}
                  {report.metadata.expectedRegion} • Nenhuma escrita realizada
                </p>
              </div>

              {/* Botões de Exportação */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-[#DCE0D9] bg-[#F8F9FA] p-0.5 text-2xs font-bold">
                  <button
                    type="button"
                    onClick={() => setExportFormat('text')}
                    className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer ${
                      exportFormat === 'text'
                        ? 'bg-white text-[#30334F] shadow-2xs'
                        : 'text-slate-500 hover:text-[#30334F]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Texto
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('json')}
                    className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer ${
                      exportFormat === 'json'
                        ? 'bg-white text-[#30334F] shadow-2xs'
                        : 'text-slate-500 hover:text-[#30334F]'
                    }`}
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    JSON
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyReport}
                  className="px-4 py-2 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-2 transition cursor-pointer"
                >
                  {copiedState === 'copied' ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>RELATÓRIO COPIADO!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>COPIAR RELATÓRIO DA AUDITORIA</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {copiedState === 'error' && (
              <p className="text-2xs text-rose-700 font-semibold">
                Não foi possível copiar automaticamente pela área de transferência do navegador.
              </p>
            )}

            {/* Coleções examinadas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {report.metadata.collectionsExamined.map((col) => (
                <div
                  key={col.collectionName}
                  className="p-3 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-0.5"
                >
                  <p className="text-2xs font-mono font-bold text-slate-500 uppercase">{col.collectionName}</p>
                  <p className="text-lg font-black text-[#30334F]">{col.documentsRead}</p>
                  <p className="text-2xs text-emerald-700 font-semibold">
                    {col.pagesFetched} pág. • Servidor OK
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Resumo Principal (KPIs) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs">
              <p className="text-2xs font-bold text-slate-500 uppercase">Documentos Examinados</p>
              <p className="text-2xl font-black text-[#30334F] mt-1">{report.metadata.totalDocumentsExamined}</p>
            </div>
            <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs">
              <p className="text-2xs font-bold text-slate-500 uppercase">Cobranças Analisadas</p>
              <p className="text-2xl font-black text-[#30334F] mt-1">{report.summary.charges.total}</p>
            </div>
            <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs">
              <p className="text-2xs font-bold text-slate-500 uppercase">Pagamentos Analisados</p>
              <p className="text-2xl font-black text-[#30334F] mt-1">{report.summary.payments.total}</p>
            </div>
            <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs">
              <p className="text-2xs font-bold text-slate-500 uppercase">Transportes / Candidatas</p>
              <p className="text-2xl font-black text-[#F28C1B] mt-1">
                {report.summary.carryOver.formalCarryLinksCount} /{' '}
                {report.summary.carryOver.legacyPreA2CandidatesTotal}
              </p>
              <p className="text-2xs text-slate-500">Formais A2 / Pré-A2</p>
            </div>
            <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs">
              <p className="text-2xs font-bold text-slate-500 uppercase">Ocorrências Encontradas</p>
              <p className="text-2xl font-black text-rose-700 mt-1">{report.summary.totalFindings}</p>
              <p className="text-2xs text-slate-500">
                {report.summary.findingsBySeverity['CRÍTICO']} críticas • {report.summary.findingsBySeverity.ALTO}{' '}
                altas
              </p>
            </div>
          </div>

          {/* Detalhamento A, B, C, D */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* A. Cobranças */}
            <div className="bg-white border border-[#E2E4E0] rounded-2xl p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider border-b border-[#E2E4E0] pb-2">
                A. Resumo de Cobranças ({report.summary.charges.total})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Pagas</span>
                  <strong className="text-emerald-700 font-black">{report.summary.charges.paid}</strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Pendentes</span>
                  <strong className="text-[#30334F] font-black">{report.summary.charges.pending}</strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Parciais</span>
                  <strong className="text-amber-700 font-black">{report.summary.charges.partial}</strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Canceladas / Adiadas</span>
                  <strong className="text-slate-700 font-black">
                    {report.summary.charges.cancelled} / {report.summary.charges.postponed}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Individuais / Planos</span>
                  <strong className="text-[#30334F] font-black">
                    {report.summary.charges.individualByVehicle} / {report.summary.charges.legacyPlanCharges}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Grupos Duplicados</span>
                  <strong
                    className={
                      report.summary.charges.duplicateGroupsDetected > 0
                        ? 'text-rose-700 font-black'
                        : 'text-emerald-700 font-black'
                    }
                  >
                    {report.summary.charges.duplicateGroupsDetected}
                  </strong>
                </div>
              </div>
            </div>

            {/* B. Pagamentos & D. Integridade */}
            <div className="bg-white border border-[#E2E4E0] rounded-2xl p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider border-b border-[#E2E4E0] pb-2">
                B. Pagamentos &amp; D. Integridade Financeira
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Individuais / Consolidados</span>
                  <strong className="text-[#30334F] font-black">
                    {report.summary.payments.individualCount} / {report.summary.payments.consolidatedCount}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Pagamentos Órfãos</span>
                  <strong
                    className={
                      report.summary.payments.orphanPaymentsCount > 0
                        ? 'text-rose-700 font-black'
                        : 'text-emerald-700 font-black'
                    }
                  >
                    {report.summary.payments.orphanPaymentsCount}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Divergência paidAmount</span>
                  <strong
                    className={
                      report.summary.payments.chargePaidDivergenceCount > 0
                        ? 'text-rose-700 font-black'
                        : 'text-emerald-700 font-black'
                    }
                  >
                    {report.summary.payments.chargePaidDivergenceCount}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Valores Negativos</span>
                  <strong
                    className={
                      report.summary.integrity.negativeValueCount > 0
                        ? 'text-rose-700 font-black'
                        : 'text-emerald-700 font-black'
                    }
                  >
                    {report.summary.integrity.negativeValueCount}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Divergência Matemática</span>
                  <strong
                    className={
                      report.summary.integrity.mathDivergenceCount > 0
                        ? 'text-amber-700 font-black'
                        : 'text-emerald-700 font-black'
                    }
                  >
                    {report.summary.integrity.mathDivergenceCount}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                  <span className="text-2xs text-slate-500 block">Status Inconsistente</span>
                  <strong
                    className={
                      report.summary.integrity.statusInconsistencyCount > 0
                        ? 'text-amber-700 font-black'
                        : 'text-emerald-700 font-black'
                    }
                  >
                    {report.summary.integrity.statusInconsistencyCount}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* C. Transporte de Saldos — Prioridade Máxima */}
          <div className="bg-white border border-[#E2E4E0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E4E0] pb-2">
              <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider">
                C. Transporte de Saldos — Prioridade Máxima (Etapa A2 &amp; Legados Pré-A2)
              </h4>
              <span className="text-2xs font-mono text-slate-500">
                next_month: {report.summary.charges.withBalanceHandlingNextMonth} • previousBalanceCarried &gt; 0:{' '}
                {report.summary.charges.withPreviousBalanceCarriedPositive}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                <span className="text-2xs text-slate-500 block">Transportes Formais (A2)</span>
                <strong className="text-base font-black text-[#30334F]">
                  {report.summary.carryOver.formalCarryLinksCount}
                </strong>
                <span className="text-2xs text-slate-500 block mt-0.5">
                  Multi-transporte: {report.summary.carryOver.originsTransportedMultipleTimes} • Destino ausente:{' '}
                  {report.summary.carryOver.originsMissingDestination}
                </span>
              </div>

              <div className="p-3 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                <span className="text-2xs text-slate-500 block">Candidatas Legadas Pré-A2</span>
                <strong className="text-base font-black text-[#F28C1B]">
                  {report.summary.carryOver.legacyPreA2CandidatesTotal}
                </strong>
                <span className="text-2xs text-slate-500 block mt-0.5">
                  A:{report.summary.carryOver.legacyCategoryCounts.A} • B:
                  {report.summary.carryOver.legacyCategoryCounts.B} • C:
                  {report.summary.carryOver.legacyCategoryCounts.C} • D:
                  {report.summary.carryOver.legacyCategoryCounts.D} • E:
                  {report.summary.carryOver.legacyCategoryCounts.E}
                </span>
              </div>

              <div className="p-3 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                <span className="text-2xs text-slate-500 block">Soma Origens Suspeitas (B–E)</span>
                <strong className="text-base font-black text-rose-700">
                  {formatCurrency(report.summary.carryOver.legacySuspectOriginSumCents / 100)}
                </strong>
                <span className="text-2xs text-slate-500 block mt-0.5">
                  Destinos:{' '}
                  {formatCurrency(report.summary.carryOver.legacySuspectDestCarriedSumCents / 100)}
                </span>
              </div>

              <div className="p-3 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0]">
                <span className="text-2xs text-slate-500 block">Planos Legados Pendentes</span>
                <strong className="text-base font-black text-[#30334F]">
                  {report.summary.carryOver.legacyPlanPendingManualCount}
                </strong>
                <span className="text-2xs text-slate-500 block mt-0.5">Exigem tratamento manual</span>
              </div>
            </div>

            {/* Tabela de Candidatas Legadas Pré-A2 */}
            {report.legacyCarryCandidates.length > 0 && (
              <div className="overflow-x-auto border border-[#E2E4E0] rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#F8F9FA] text-[#60677D] font-bold uppercase text-2xs border-b border-[#E2E4E0]">
                    <tr>
                      <th className="px-3 py-2.5">Cat.</th>
                      <th className="px-3 py-2.5">ID Origem</th>
                      <th className="px-3 py-2.5">Possível Destino</th>
                      <th className="px-3 py-2.5">Veículo / Placa</th>
                      <th className="px-3 py-2.5">Comp. Origem → Destino</th>
                      <th className="px-3 py-2.5 text-right">Saldo Origem</th>
                      <th className="px-3 py-2.5 text-right">Carried Destino</th>
                      <th className="px-3 py-2.5">Recomendação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E4E0]">
                    {report.legacyCarryCandidates.map((cand) => (
                      <tr key={cand.originChargeId} className="hover:bg-[#F8F9FB]">
                        <td className="px-3 py-2.5 font-mono font-black">
                          <span
                            className={`px-2 py-0.5 rounded border text-2xs ${
                              cand.legacyCategory === 'D'
                                ? 'bg-rose-100 text-rose-900 border-rose-300'
                                : cand.legacyCategory === 'C'
                                ? 'bg-orange-100 text-orange-900 border-orange-300'
                                : cand.legacyCategory === 'A'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {cand.legacyCategory}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-2xs text-[#30334F]">{cand.originChargeId}</td>
                        <td className="px-3 py-2.5 font-mono text-2xs text-slate-700">
                          {cand.possibleDestinationChargeId || '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-2xs text-slate-700">
                          {cand.vehicleTechnicalId} ({cand.maskedPlate})
                        </td>
                        <td className="px-3 py-2.5 font-mono text-2xs whitespace-nowrap">
                          {cand.originReferenceMonth} → {cand.destinationReferenceMonth || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-[#30334F] whitespace-nowrap">
                          {formatCurrency(cand.originRemainingCents / 100)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-800 whitespace-nowrap">
                          {cand.destinationPreviousCarriedCents !== null
                            ? formatCurrency(cand.destinationPreviousCarriedCents / 100)
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-2xs text-slate-600 max-w-xs">{cand.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Lista de Achados Classificados */}
          <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-[#F8F9FA] border-b border-[#E2E4E0] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider">
                  Ocorrências Classificadas ({filteredFindings.length})
                </h4>
                <p className="text-2xs text-slate-500">
                  Apenas identificadores técnicos, placas mascaradas e valores financeiros
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-2xs font-bold">
                {(['TODOS', 'CRÍTICO', 'ALTO', 'MÉDIO', 'BAIXO', 'INFORMATIVO'] as const).map((sev) => {
                  const count =
                    sev === 'TODOS'
                      ? report.summary.totalFindings
                      : report.summary.findingsBySeverity[sev];
                  return (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverityFilter(sev)}
                      className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                        severityFilter === sev
                          ? 'bg-[#30334F] text-white border-[#30334F]'
                          : 'bg-white text-slate-600 border-[#DCE0D9] hover:border-[#30334F]'
                      }`}
                    >
                      {sev} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredFindings.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="font-bold text-[#30334F]">
                  Nenhuma ocorrência encontrada para o filtro selecionado.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E2E4E0] max-h-[600px] overflow-y-auto">
                {filteredFindings.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-[#F8F9FB] space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-2xs font-bold text-slate-500">{item.id}</span>
                      <span
                        className={`text-2xs px-2 py-0.5 rounded border font-black uppercase ${SEVERITY_BADGE_STYLES[item.severity]}`}
                      >
                        {item.severity}
                      </span>
                      <span className="text-2xs px-2 py-0.5 rounded bg-[#30334F]/10 text-[#30334F] font-mono font-bold">
                        {item.category}
                      </span>
                      <span
                        className={`text-2xs px-2 py-0.5 rounded border font-bold uppercase ${CERTAINTY_BADGE_STYLES[item.certainty]}`}
                      >
                        Certeza: {item.certainty}
                      </span>
                      {item.referenceMonth && (
                        <span className="text-2xs font-mono text-slate-600">
                          Comp: <strong>{item.referenceMonth}</strong>
                          {item.relatedReferenceMonth ? ` → ${item.relatedReferenceMonth}` : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs font-mono text-slate-600">
                      <span>
                        Charge ID: <strong className="text-[#30334F]">{item.chargeId}</strong>
                      </span>
                      {item.relatedId && (
                        <span>
                          Relacionado: <strong className="text-[#30334F]">{item.relatedId}</strong>
                        </span>
                      )}
                      {item.vehicleTechnicalId && (
                        <span>
                          Veículo: <strong className="text-[#30334F]">{item.vehicleTechnicalId}</strong> (
                          {item.maskedPlate || 'N/D'})
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-semibold text-[#1E2235]">{item.description}</p>
                    <p className="text-2xs text-slate-600">
                      <strong>Motivo da classificação:</strong> {item.rationale}
                    </p>

                    <div className="p-2 bg-[#F8F9FA] border border-[#E2E4E0] rounded-lg text-2xs font-mono text-slate-700 overflow-x-auto">
                      Valores: {JSON.stringify(item.values)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
