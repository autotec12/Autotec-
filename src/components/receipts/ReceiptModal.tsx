import React, { useState } from 'react';
import { Payment, Charge, Client, Vehicle } from '../../types';
import { useData } from '../../context/DataContext';
import {
  generateReceiptSvg,
  downloadReceiptSvg,
  downloadReceiptPng,
  copyReceiptImageToClipboard,
  shareReceipt,
  ReceiptContext,
} from '../../lib/svgReceipt';
import { openWhatsAppLink } from '../../lib/whatsapp';
import {
  FileText,
  Download,
  Share2,
  Printer,
  X,
  MessageSquare,
  Image as ImageIcon,
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
  const { companySettings } = useData();
  const [copyingImage, setCopyingImage] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [downloadingSvg, setDownloadingSvg] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  const receiptContext: ReceiptContext = {
    payment,
    charge,
    client,
    vehicle,
    company: companySettings,
  };

  const svgContent = generateReceiptSvg(payment, charge, client, vehicle, companySettings);

  const rawNumber = payment.receiptNumber || 'pagamento';
  const cleanNum = rawNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const baseFilename = `recibo-AUTOTEC-${cleanNum}`;

  const showFeedback = (type: 'success' | 'info' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((current) => (current?.message === message ? null : current));
    }, 4500);
  };

  const handleCopyImage = async () => {
    try {
      setCopyingImage(true);
      const result = await copyReceiptImageToClipboard(
        svgContent,
        `${baseFilename}.png`,
        receiptContext
      );
      if (result.success) {
        showFeedback('success', result.message);
      } else if (result.fallbackTriggered) {
        showFeedback('info', result.message);
      } else {
        showFeedback('error', result.message);
      }
    } catch (err: any) {
      showFeedback('error', 'Falha ao processar a imagem do recibo: ' + (err?.message || 'erro'));
    } finally {
      setCopyingImage(false);
    }
  };

  const handleDownloadPng = async () => {
    try {
      setDownloadingPng(true);
      await downloadReceiptPng(svgContent, `${baseFilename}.png`, receiptContext);
      showFeedback('success', 'Recibo em PNG de alta resolução baixado com sucesso!');
    } catch (err: any) {
      showFeedback('error', 'Erro ao baixar recibo PNG: ' + (err?.message || 'erro'));
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleDownloadSvg = () => {
    try {
      setDownloadingSvg(true);
      downloadReceiptSvg(svgContent, `${baseFilename}.svg`);
      showFeedback('success', 'Recibo vetorial SVG original baixado com sucesso!');
    } catch (err: any) {
      showFeedback('error', 'Erro ao baixar recibo SVG: ' + (err?.message || 'erro'));
    } finally {
      setTimeout(() => setDownloadingSvg(false), 800);
    }
  };

  const handleShare = async () => {
    try {
      setSharing(true);
      const success = await shareReceipt(svgContent, baseFilename, receiptContext);
      if (success) {
        showFeedback('success', 'Comprovante compartilhado com sucesso!');
      } else {
        await handleDownloadPng();
      }
    } catch {
      await handleDownloadPng();
    } finally {
      setSharing(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Recibo AUTOTEC ${payment.receiptNumber}</title>
            <meta charset="utf-8" />
            <style>
              body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; font-family: sans-serif; }
              svg { width: 100%; max-width: 800px; height: auto; display: block; margin: 0 auto; }
              @media print {
                body { margin: 0; padding: 0; }
                @page { size: portrait; margin: 8mm; }
              }
            </style>
          </head>
          <body>
            ${svgContent}
            <script>
              window.onload = function() { window.print(); window.close(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleSendWhatsApp = () => {
    const phone = client?.whatsapp || client?.phone || '';
    const text =
      `Olá, *${client?.name || charge.clientName}*!\n\n` +
      `Segue a confirmação do seu pagamento referente ao veículo *${charge.vehiclePlate}* no valor de *${formatCurrency(payment.amount)}*.\n` +
      `Recibo Oficial Nº: *${payment.receiptNumber}*.\n` +
      `${payment.remainingAfterPayment > 0.01 ? `Saldo restante em aberto: ${formatCurrency(payment.remainingAfterPayment)}\n` : 'Mensalidade 100% quitada com sucesso!\n'}\n` +
      `Obrigado pela pontualidade!\n*${companySettings.companyName}*`;
    openWhatsAppLink(phone, text);
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(160, prev + 15));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(65, prev - 15));
  const handleZoomReset = () => setZoomLevel(100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col h-[94vh] max-h-[94vh]">
        {/* Modal Top Header in Institutional Navy */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#30334F] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 bg-white/10 text-[#F28C1B] rounded-lg shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm sm:text-base truncate">
                  Recibo Oficial AUTOTEC
                </h3>
                <span className="font-mono text-2xs font-bold text-[#F28C1B] bg-white/10 px-2 py-0.5 rounded border border-white/20 shrink-0">
                  {payment.receiptNumber}
                </span>
              </div>
              <p className="text-2xs sm:text-xs text-white/75 truncate">
                {payment.clientName} • Placa: {payment.vehiclePlate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status Pill in Header */}
            {payment.remainingAfterPayment > 0.01 ? (
              <span className="hidden md:inline-flex px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-200 text-2xs font-bold border border-amber-400/30">
                Parcial (Resta {formatCurrency(payment.remainingAfterPayment)})
              </span>
            ) : (
              <span className="hidden md:inline-flex px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-200 text-2xs font-bold border border-emerald-400/30">
                100% Quitado
              </span>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition"
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Alert Bar */}
        {feedback && (
          <div
            className={`px-4 py-2 border-b flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-150 shrink-0 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : feedback.type === 'info'
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-blue-600" />
            )}
            <span className="flex-1 text-xs">{feedback.message}</span>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Action Toolbar & Zoom Controls */}
        <div className="px-3 sm:px-6 py-2.5 bg-[#F8F9FA] border-b border-[#E2E4E0] flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-white border border-[#DCE0D9] rounded-lg p-0.5 text-slate-700">
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 65}
              title="Diminuir visualização"
              className="p-1 hover:text-[#30334F] hover:bg-[#F3F4F2] rounded transition disabled:opacity-40"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomReset}
              title="Restaurar tamanho padrão (100%)"
              className="px-2 py-0.5 text-2xs font-bold hover:text-[#30334F] hover:bg-[#F3F4F2] rounded transition"
            >
              {zoomLevel}%
            </button>
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 160}
              title="Aumentar visualização"
              className="p-1 hover:text-[#30334F] hover:bg-[#F3F4F2] rounded transition disabled:opacity-40"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomReset}
              title="Ajustar à tela"
              className="p-1 hover:text-[#30334F] hover:bg-[#F3F4F2] rounded transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* 1. COPIAR IMAGEM (PNG) */}
            <button
              onClick={handleCopyImage}
              disabled={copyingImage}
              title="Copia a imagem visual do recibo (PNG) para colar direto no WhatsApp"
              className="px-3 py-1.5 bg-[#30334F] hover:bg-[#252840] text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {copyingImage ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5 text-[#F28C1B]" />
              )}
              <span>{copyingImage ? 'Processando...' : 'Copiar Imagem'}</span>
            </button>

            {/* 2. BAIXAR PNG */}
            <button
              onClick={handleDownloadPng}
              disabled={downloadingPng}
              title="Baixar imagem em PNG de alta definição para envio"
              className="px-3 py-1.5 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-lg text-xs font-bold shadow-md shadow-orange-500/20 flex items-center gap-1.5 transition disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {downloadingPng ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{downloadingPng ? 'Baixando...' : 'Baixar PNG'}</span>
            </button>

            {/* 3. BAIXAR SVG */}
            <button
              onClick={handleDownloadSvg}
              disabled={downloadingSvg}
              title="Baixar arquivo vetorial SVG original"
              className="hidden sm:inline-flex px-2.5 py-1.5 bg-white hover:bg-[#F3F4F2] text-slate-700 border border-[#DCE0D9] rounded-lg text-xs font-semibold items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Baixar SVG</span>
            </button>

            {/* 4. WhatsApp */}
            <button
              onClick={handleSendWhatsApp}
              title="Enviar mensagem do comprovante no WhatsApp do cliente"
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp</span>
            </button>

            {/* 5. Compartilhar */}
            <button
              onClick={handleShare}
              disabled={sharing}
              title="Compartilhar pelo menu nativo do dispositivo"
              className="hidden md:inline-flex px-2.5 py-1.5 bg-white hover:bg-[#F3F4F2] text-slate-700 border border-[#DCE0D9] rounded-lg text-xs font-semibold items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <Share2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Compartilhar</span>
            </button>

            {/* 6. Imprimir */}
            <button
              onClick={handlePrint}
              title="Imprimir comprovante oficial"
              className="hidden sm:inline-flex px-2.5 py-1.5 bg-white hover:bg-[#F3F4F2] text-slate-700 border border-[#DCE0D9] rounded-lg text-xs font-semibold items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* Live Receipt Viewport: Pristine White Document on Neutral Canvas */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-3 sm:p-6 bg-[#25283D] flex flex-col items-center justify-start min-h-0 select-none">
          <div
            className="transition-all duration-200 shadow-2xl rounded-xl border border-white/20 bg-white overflow-hidden my-2 shrink-0"
            style={{
              width: `${zoomLevel}%`,
              maxWidth: zoomLevel <= 100 ? '620px' : '900px',
              minWidth: '280px',
            }}
          >
            {/* Inner responsive SVG wrapper with aspect ratio preservation */}
            <div
              className="w-full h-auto receipt-svg-container [&>svg]:w-full [&>svg]:h-auto [&>svg]:block"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 bg-[#F8F9FA] border-t border-[#E2E4E0] flex items-center justify-between shrink-0 text-xs text-slate-600">
          <div className="hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-medium">Documento oficial com fundo branco e cores institucionais AUTOTEC.</span>
          </div>

          {/* Mobile Fast Action Buttons */}
          <div className="flex sm:hidden items-center justify-between w-full gap-2">
            <button
              onClick={handleCopyImage}
              disabled={copyingImage}
              className="flex-1 py-2 bg-[#30334F] hover:bg-[#252840] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              {copyingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 text-[#F28C1B]" />}
              <span>{copyingImage ? 'Copiando...' : 'Copiar Imagem'}</span>
            </button>

            <button
              onClick={handleDownloadPng}
              disabled={downloadingPng}
              className="flex-1 py-2 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              {downloadingPng ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>Baixar PNG</span>
            </button>

            <button
              onClick={onClose}
              className="px-3 py-2 bg-[#F3F4F2] hover:bg-[#E2E4E0] text-slate-700 rounded-lg text-xs font-bold border border-[#DCE0D9]"
            >
              Fechar
            </button>
          </div>

          {/* Desktop Close button */}
          <button
            onClick={onClose}
            className="hidden sm:inline-flex px-4 py-1.5 text-slate-700 hover:text-[#30334F] bg-white hover:bg-[#F3F4F2] border border-[#E2E4E0] rounded-lg transition font-bold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
