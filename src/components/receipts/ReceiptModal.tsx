import React, { useState } from 'react';
import { Payment, Charge, Client, Vehicle } from '../../types';
import { useData } from '../../context/DataContext';
import { generateReceiptSvg } from '../../lib/svgReceipt';
import { generateMonthlyPaymentReceiptPdf } from '../../lib/pdfDocuments';
import { downloadSvgFile, downloadPdfFile, sharePdfFile } from '../../lib/exportHelpers';
import {
  FileText,
  Download,
  Share2,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { formatCurrency } from '../../lib/calculations';

interface ReceiptModalProps {
  payment: Payment;
  charge: Charge;
  client?: Client;
  vehicle?: Vehicle;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  payment,
  charge,
  client,
  vehicle,
  onClose,
}) => {
  const { companySettings, clients, vehicles, charges } = useData();
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingSvg, setDownloadingSvg] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'info' | 'error';
    message: string;
  } | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Monitor available container width and orientation changes
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measureWidth = () => {
      const style = window.getComputedStyle(el);
      const pLeft = parseFloat(style.paddingLeft) || 0;
      const pRight = parseFloat(style.paddingRight) || 0;
      const available = el.clientWidth - pLeft - pRight;
      if (available > 0) {
        setContainerWidth(available);
      }
    };

    measureWidth();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        measureWidth();
      });
      ro.observe(el);
    }

    window.addEventListener('resize', measureWidth);
    window.addEventListener('orientationchange', measureWidth);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measureWidth);
      window.removeEventListener('orientationchange', measureWidth);
    };
  }, []);

  // Base width fits available mobile width, capped at 800px on desktop
  const baseWidth = containerWidth > 0 ? Math.min(containerWidth, 800) : 800;
  // Dynamic rendered width based on zoom level
  const renderedWidth = Math.round(baseWidth * (zoomLevel / 100));

  // 1. Resolve Effective Company
  const effectiveCompany = payment.companySnapshot
    ? { ...companySettings, ...payment.companySnapshot }
    : companySettings;

  // 2. Resolve Effective Client (Prevent empty CPF, phone or name)
  const effectiveClient =
    client ||
    clients.find(
      (c) =>
        c.id === payment.clientId ||
        c.id === charge?.clientId ||
        (c.name && c.name.toLowerCase() === (payment.clientName || '').toLowerCase())
    ) || {
      id: payment.clientId || 'client_fallback',
      name: payment.clientName || charge?.clientName || 'Cliente',
      document: 'Não informado',
      phone: 'Não informado',
      whatsapp: 'Não informado',
      status: 'ativo' as const,
      createdAt: '',
      updatedAt: '',
    };

  // 3. Resolve Effective Vehicle
  const effectiveVehicle =
    vehicle ||
    vehicles.find(
      (v) =>
        v.id === payment.vehicleId ||
        v.id === charge?.vehicleId ||
        v.plate === payment.vehiclePlate ||
        v.plate === charge?.vehiclePlate
    );

  // 4. Resolve Effective Charge (Prevent R$ 0,00 when data exists)
  const foundCharge = charge?.id
    ? charge
    : charges.find((c) => c.id === payment.chargeId || c.vehiclePlate === payment.vehiclePlate);

  const rawOriginal = Number(foundCharge?.originalMonthlyValue ?? foundCharge?.totalAmount ?? effectiveVehicle?.monthlyValue ?? payment.amount ?? 0);
  const rawPrevBalance = Number(foundCharge?.previousBalanceCarried || 0);
  const rawTotal = Number(foundCharge?.totalAmount || (rawOriginal + rawPrevBalance) || (payment.amount + (payment.remainingAfterPayment || 0)));
  const rawPaid = Number(payment.amount || 0);
  const rawRemaining = Number(payment.remainingAfterPayment ?? Math.max(0, rawTotal - rawPaid));

  const effectiveCharge: Charge = {
    id: foundCharge?.id || payment.chargeId || `chg_${payment.id}`,
    clientId: effectiveClient.id,
    clientName: effectiveClient.name,
    vehicleId: effectiveVehicle?.id || payment.vehicleId || 'veh_default',
    vehiclePlate: effectiveVehicle?.plate || payment.vehiclePlate || 'ABC1D23',
    vehicleModel: effectiveVehicle ? `${effectiveVehicle.brand} ${effectiveVehicle.model}` : (foundCharge?.vehicleModel || 'Veículo'),
    referenceMonth: foundCharge?.referenceMonth || 'Mensalidade',
    originalMonthlyValue: rawOriginal,
    previousBalanceCarried: rawPrevBalance,
    discount: Number(foundCharge?.discount || 0),
    addition: Number(foundCharge?.addition || 0),
    totalAmount: rawTotal,
    paidAmount: rawPaid,
    remainingBalance: rawRemaining,
    dueDate: foundCharge?.dueDate || payment.paymentDate?.slice(0, 10) || '',
    status: rawRemaining <= 0.009 ? 'pago' : 'parcial',
    createdAt: foundCharge?.createdAt || payment.createdAt,
    updatedAt: foundCharge?.updatedAt || payment.createdAt,
  };

  const svgContent = generateReceiptSvg(payment, effectiveCharge, effectiveClient, effectiveVehicle, effectiveCompany);

  // Sanitize SVG specifically for on-screen preview so it scales responsively without affecting download files
  const previewSvgContent = React.useMemo(() => {
    if (!svgContent) return '';
    return svgContent.replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
      let cleanAttrs = attrs
        .replace(/\bwidth="[^"]*"/i, 'width="100%"')
        .replace(/\bheight="[^"]*"/i, 'height="auto"');
      if (/\bstyle="([^"]*)"/i.test(cleanAttrs)) {
        cleanAttrs = cleanAttrs.replace(/\bstyle="([^"]*)"/i, (_: string, s: string) => {
          return `style="width:100% !important;height:auto !important;display:block !important;max-width:100% !important;${s}"`;
        });
      } else {
        cleanAttrs += ' style="width:100% !important;height:auto !important;display:block !important;max-width:100% !important;"';
      }
      return `<svg ${cleanAttrs}>`;
    });
  }, [svgContent]);

  const rawNumber = payment.receiptNumber || 'recibo';
  const cleanNum = rawNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const baseFilename = `recibo-AUTOTEC-${cleanNum}`;

  const showFeedback = (type: 'success' | 'warning' | 'info' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((current) => (current?.message === message ? null : current));
    }, 6500);
  };

  // ACTION 1: Compartilhar em PDF (envio como arquivo anexo via compartilhamento nativo)
  const handleSharePdf = async () => {
    try {
      setSharingPdf(true);
      const pdfBlob = generateMonthlyPaymentReceiptPdf(
        payment,
        effectiveCharge,
        effectiveClient,
        effectiveVehicle,
        effectiveCompany
      );
      const res = await sharePdfFile(
        pdfBlob,
        `${baseFilename}.pdf`,
        `Recibo Oficial AUTOTEC - ${payment.receiptNumber}`
      );
      if (res.status === 'shared_intent_opened') {
        showFeedback('success', res.message);
      } else if (res.status === 'cancelled') {
        showFeedback('info', res.message);
      } else {
        showFeedback('warning', res.message);
      }
    } catch (err: any) {
      showFeedback('error', 'Falha ao compartilhar PDF: ' + (err?.message || 'erro'));
    } finally {
      setSharingPdf(false);
    }
  };

  // ACTION 2: Baixar em SVG
  const handleDownloadSvg = () => {
    try {
      setDownloadingSvg(true);
      downloadSvgFile(svgContent, `${baseFilename}.svg`);
      showFeedback('success', 'Recibo vetorial SVG completo baixado com sucesso!');
    } catch (err: any) {
      showFeedback('error', 'Erro ao baixar SVG: ' + (err?.message || 'erro'));
    } finally {
      setTimeout(() => setDownloadingSvg(false), 500);
    }
  };

  // ACTION 3: Baixar em PDF
  const handleDownloadPdf = () => {
    try {
      setDownloadingPdf(true);
      const pdfBlob = generateMonthlyPaymentReceiptPdf(
        payment,
        effectiveCharge,
        effectiveClient,
        effectiveVehicle,
        effectiveCompany
      );
      downloadPdfFile(pdfBlob, `${baseFilename}.pdf`);
      showFeedback('success', 'Recibo oficial em PDF (A4) baixado com sucesso!');
    } catch (err: any) {
      showFeedback('error', 'Erro ao gerar PDF: ' + (err?.message || 'erro'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-[#30334F] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Recibo Oficial de Pagamento
                </h3>
                <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-[#F28C1B] text-white">
                  {payment.receiptNumber}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {effectiveClient.name} • Placa {effectiveCharge.vehiclePlate} • Valor Pago: {formatCurrency(payment.amount)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Bar */}
        {feedback && (
          <div
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b transition ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : feedback.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : feedback.type === 'warning'
                ? 'bg-amber-50 text-amber-900 border-amber-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {feedback.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
            {feedback.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
            {feedback.type === 'info' && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Action Toolbar: STRICTLY 3 STANDARDIZED ACTIONS */}
        <div className="bg-[#F8FAFC] border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
            <button
              onClick={() => setZoomLevel((prev) => Math.max(50, prev - 15))}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Reduzir zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono font-bold text-slate-700 min-w-[45px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel((prev) => Math.min(180, prev + 15))}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Aumentar zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel(100)}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Restaurar zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* STANDARDIZED 3 ACTIONS: 1. Compartilhar em PDF, 2. Baixar em SVG, 3. Baixar em PDF */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Compartilhar em PDF */}
            <button
              onClick={handleSharePdf}
              disabled={sharingPdf}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
              title="Compartilhar arquivo PDF oficial como anexo via WhatsApp, e-mail ou app nativo"
            >
              {sharingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Compartilhar em PDF
            </button>

            {/* 2. Baixar em SVG */}
            <button
              onClick={handleDownloadSvg}
              disabled={downloadingSvg}
              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-[#30334F] rounded-xl font-bold flex items-center gap-2 shadow-2xs transition cursor-pointer"
              title="Baixar arquivo SVG vetorial completo"
            >
              {downloadingSvg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-[#F28C1B]" />}
              Baixar em SVG
            </button>

            {/* 3. Baixar em PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="px-3.5 py-2 bg-[#30334F] hover:bg-[#23253B] text-white rounded-xl font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
              title="Gerar e baixar PDF em formato A4"
            >
              {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-[#F28C1B]" />}
              Baixar em PDF
            </button>
          </div>
        </div>

        {/* Visual Preview */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto p-2 sm:p-4 md:p-6 bg-slate-100 min-h-0"
        >
          <div className="w-fit mx-auto min-w-0 transition-all duration-150 ease-out">
            <div
              style={{
                width: containerWidth > 0 ? `${renderedWidth}px` : '100%',
                maxWidth: zoomLevel <= 100 ? '800px' : undefined,
                transition: 'width 0.15s ease',
              }}
              className="autotec-receipt-preview bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden [&_svg]:w-full [&_svg]:h-auto [&_svg]:block [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: previewSvgContent }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
