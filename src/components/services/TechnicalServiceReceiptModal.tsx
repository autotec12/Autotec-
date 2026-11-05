import React, { useState } from 'react';
import { TechnicalServiceOrder } from '../../types';
import { useData } from '../../context/DataContext';
import { generateTechnicalServiceReceiptSvg } from '../../lib/svgServiceAndExpense';
import { generateTechnicalServiceReceiptPdf } from '../../lib/pdfDocuments';
import { downloadSvgFile, shareSvgFile, downloadPdfFile } from '../../lib/exportHelpers';
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

interface TechnicalServiceReceiptModalProps {
  order: TechnicalServiceOrder;
  onClose: () => void;
}

export const TechnicalServiceReceiptModal: React.FC<TechnicalServiceReceiptModalProps> = ({
  order,
  onClose,
}) => {
  const { companySettings } = useData();
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingSvg, setDownloadingSvg] = useState(false);
  const [sharingSvg, setSharingSvg] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'info' | 'error';
    message: string;
  } | null>(null);

  const svgContent = generateTechnicalServiceReceiptSvg(order, companySettings);
  const baseFilename = `recibo-servico-AUTOTEC-${order.orderNumber || order.id}`;

  const showFeedback = (type: 'success' | 'warning' | 'info' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((current) => (current?.message === message ? null : current));
    }, 6500);
  };

  // ACTION 1: Compartilhar em SVG
  const handleShareSvg = async () => {
    try {
      setSharingSvg(true);
      const res = await shareSvgFile(
        svgContent,
        `${baseFilename}.svg`,
        `Recibo de Serviço AUTOTEC - ${order.orderNumber}`
      );
      if (res.status === 'shared_intent_opened') {
        showFeedback('info', res.message);
      } else if (res.status === 'cancelled') {
        showFeedback('info', res.message);
      } else {
        showFeedback('warning', res.message);
      }
    } catch (err: any) {
      showFeedback('error', 'Falha ao acionar compartilhamento: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setSharingSvg(false);
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
      const pdfBlob = generateTechnicalServiceReceiptPdf(order, companySettings);
      downloadPdfFile(pdfBlob, `${baseFilename}.pdf`);
      showFeedback('success', 'Recibo de Serviço em PDF (A4) baixado com sucesso!');
    } catch (err: any) {
      showFeedback('error', 'Erro ao gerar PDF: ' + (err?.message || 'erro'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-[#30334F] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Recibo de Prestação de Serviços Técnicos
                </h3>
                <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-[#F28C1B] text-white">
                  O.S. {order.orderNumber}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {order.clientName} • Placa {order.vehiclePlate} • Total: {formatCurrency(order.totalAmount)}
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

        {/* WhatsApp SVG Informative Guidance Strip */}
        <div className="bg-amber-50/70 border-b border-amber-200/80 px-4 py-2 text-2xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Observação sobre envio de SVG pelo WhatsApp:</span>
            <p className="text-amber-800">
              No celular (especialmente Android), o WhatsApp frequentemente não conclui a entrega de arquivos .SVG compartilhados diretamente pelo canal de fotos. Se o arquivo não chegar ao destinatário, utilize o botão <strong>"Baixar em SVG"</strong> e anexe o arquivo no WhatsApp através de <strong>Documento (ícone do Clipe 📎 &gt; Documento)</strong>. O arquivo vetorial original é mantido 100% íntegro.
            </p>
          </div>
        </div>

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

          {/* STRICTLY 3 ACTIONS */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Compartilhar em SVG */}
            <button
              onClick={handleShareSvg}
              disabled={sharingSvg}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
              title="Compartilhar arquivo SVG oficial"
            >
              {sharingSvg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Compartilhar em SVG
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
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100 flex justify-center">
          <div
            style={{ width: `${zoomLevel}%`, maxWidth: '800px', transition: 'width 0.15s ease' }}
            className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </div>
      </div>
    </div>
  );
};
