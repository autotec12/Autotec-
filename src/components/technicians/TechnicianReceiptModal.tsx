import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TechnicianPayment, Technician, TechnicalServiceOrder } from '../../types';
import { useData } from '../../context/DataContext';
import { generateTechnicianPaymentReceiptSvg } from '../../lib/svgTechnicianReceipt';
import { generateTechnicianPaymentReceiptPdf } from '../../lib/pdfDocuments';
import { downloadSvgFile, downloadPdfFile, sharePdfFile } from '../../lib/exportHelpers';
import { formatCurrency, formatDate } from '../../lib/calculations';
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

interface TechnicianReceiptModalProps {
  payment: TechnicianPayment;
  technician?: Technician;
  services?: TechnicalServiceOrder[];
  onClose: () => void;
}

export const TechnicianReceiptModal: React.FC<TechnicianReceiptModalProps> = ({
  payment,
  technician,
  services,
  onClose,
}) => {
  const { companySettings, technicians, technicalServices } = useData();

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingSvg, setDownloadingSvg] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'info' | 'error';
    message: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Effective Technician
  const effectiveTechnician = useMemo(() => {
    return (
      technician ||
      technicians.find((t) => t.id === payment.technicianId || t.name === payment.technicianName) ||
      undefined
    );
  }, [technician, technicians, payment]);

  // Effective Services
  const effectiveServices = useMemo(() => {
    if (services && services.length > 0) return services;
    return technicalServices.filter((s) => payment.serviceIds?.includes(s.id));
  }, [services, technicalServices, payment]);

  // Monitor available container width and orientation changes
  useEffect(() => {
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

  const svgContent = useMemo(() => {
    return generateTechnicianPaymentReceiptSvg(
      payment,
      effectiveTechnician,
      effectiveServices,
      companySettings
    );
  }, [payment, effectiveTechnician, effectiveServices, companySettings]);

  // Sanitize SVG specifically for on-screen preview so it scales responsively without affecting download files
  const previewSvgContent = useMemo(() => {
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

  const cleanNum = (payment.receiptNumber || payment.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const baseFilename = `recibo-quitacao-tecnico-${cleanNum}`;

  const showFeedback = (type: 'success' | 'warning' | 'info' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((current) => (current?.message === message ? null : current));
    }, 6500);
  };

  // ACTION 1: Compartilhar em PDF como arquivo anexo via compartilhamento nativo
  const handleSharePdf = async () => {
    try {
      setSharingPdf(true);
      const pdfBlob = generateTechnicianPaymentReceiptPdf(
        payment,
        effectiveTechnician,
        effectiveServices,
        companySettings
      );
      const res = await sharePdfFile(
        pdfBlob,
        `${baseFilename}.pdf`,
        `Recibo de Quitação AUTOTEC - ${payment.receiptNumber || 'Prestador'}`
      );
      if (res.status === 'shared_intent_opened') {
        showFeedback('success', res.message);
      } else if (res.status === 'cancelled') {
        showFeedback('info', res.message);
      } else {
        showFeedback('warning', res.message);
      }
    } catch (err: any) {
      showFeedback('error', 'Falha ao acionar compartilhamento: ' + (err?.message || 'erro'));
    } finally {
      setSharingPdf(false);
    }
  };

  // ACTION 2: Baixar em SVG
  const handleDownloadSvg = () => {
    try {
      setDownloadingSvg(true);
      downloadSvgFile(svgContent, `${baseFilename}.svg`);
      showFeedback('success', 'Recibo vetorial SVG baixado com sucesso!');
    } catch (err: any) {
      showFeedback('error', 'Erro ao baixar SVG: ' + (err?.message || 'erro'));
    } finally {
      setTimeout(() => setDownloadingSvg(false), 500);
    }
  };

  // ACTION 3: Baixar em PDF (A4)
  const handleDownloadPdf = () => {
    try {
      setDownloadingPdf(true);
      const pdfBlob = generateTechnicianPaymentReceiptPdf(
        payment,
        effectiveTechnician,
        effectiveServices,
        companySettings
      );
      downloadPdfFile(pdfBlob, `${baseFilename}.pdf`);
      showFeedback('success', 'Recibo oficial em PDF A4 baixado com sucesso!');
    } catch (err: any) {
      showFeedback('error', 'Erro ao gerar PDF: ' + (err?.message || 'erro'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh] animate-in zoom-in-95">
        {/* Modal Header */}
        <div className="bg-[#30334F] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Recibo de Quitação de Serviços ao Prestador
                </h3>
                <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {payment.receiptNumber || 'QUITADO'}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {payment.technicianName} • Pago: {formatCurrency(payment.amount)} • {formatDate(payment.paymentDate)}
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
        <div className="bg-[#F8FAFC] border-b border-slate-200 px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
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
              onClick={() => setZoomLevel((prev) => Math.min(200, prev + 15))}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Aumentar zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel(100)}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Restaurar zoom (ajustar à tela)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* STANDARDIZED 3 ACTIONS: 1. Compartilhar em PDF, 2. Baixar em SVG, 3. Baixar em PDF */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
              title="Baixar arquivo SVG vetorial"
            >
              {downloadingSvg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-[#F28C1B]" />}
              Baixar em SVG
            </button>

            {/* 3. Baixar em PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="px-3.5 py-2 bg-[#30334F] hover:bg-[#23253B] text-white rounded-xl font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
              title="Baixar PDF A4 oficial"
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
