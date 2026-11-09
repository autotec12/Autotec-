import { TechnicianPayment, Technician, TechnicalServiceOrder, CompanySettings } from '../types';
import { formatCurrency, formatDateTime, formatDate } from './calculations';
import { AUTOTEC_LOGO_ORIGINAL_DATA_URI } from '../assets/autotecLogos';

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX Instantâneo',
  dinheiro: 'Dinheiro em Espécie',
  transferencia: 'Transferência Bancária (TED/DOC)',
};

/**
 * Generates an SVG string representation of the official AUTOTEC Technician Payment Receipt.
 * Title: RECIBO DE QUITAÇÃO DE PRESTAÇÃO DE SERVIÇOS TÉCNICOS
 */
export function generateTechnicianPaymentReceiptSvg(
  payment: TechnicianPayment,
  technician?: Technician,
  services?: TechnicalServiceOrder[],
  company?: CompanySettings
): string {
  const companyName = company?.companyName || 'AUTOTEC RASTREAMENTO VEICULAR';
  const cnpj = company?.cnpj || '38.450.812/0001-94';
  const phone = company?.phone || '(11) 98765-4321';
  const whatsapp = company?.whatsapp || '(11) 98765-4321';
  const address = company?.address || 'Atendimento em todo o território nacional';
  const city = company?.city || 'São Paulo';
  const state = company?.state || 'SP';
  const email = company?.email || 'contato@autotec.com.br';
  const logoDataUri = company?.logoSvg || AUTOTEC_LOGO_ORIGINAL_DATA_URI;

  const receiptNum = payment.receiptNumber || `REC-TEC-${payment.id.slice(-6)}`;
  const payDate = formatDate(payment.paymentDate || payment.createdAt);
  const paymentMethodStr = PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod;

  const techName = payment.technicianName || technician?.name || 'Técnico Prestador';
  const techCpf = payment.technicianCpf || technician?.cpf || 'Não informado';
  const techPhone = payment.technicianPhone || technician?.whatsapp || technician?.phone || 'Não informado';

  // Build items from payment.items or matched services
  const items = payment.items && payment.items.length > 0
    ? payment.items
    : (services || []).map((s) => ({
        serviceId: s.id,
        orderNumber: s.orderNumber,
        executionDate: s.executionDate || s.createdAt,
        clientName: s.clientName,
        vehiclePlate: s.vehiclePlate,
        vehicleModel: s.vehicleModel,
        serviceCategory: s.items?.map((i) => i.category).join(', ') || 'Serviço Técnico',
        technicianFee: Number(s.technicianFee || 0),
        paidInThisPayment: Number(s.technicianPaidAmount || s.technicianFee || 0),
        remainingAfterThisPayment: Number(s.technicianRemainingBalance || 0),
        statusAfterThisPayment: (s.technicianRemainingBalance || 0) <= 0.009 ? 'pago' as const : 'parcial' as const,
      }));

  const rowCount = Math.max(items.length, 1);
  const rowHeight = 36;
  const tableHeight = 44 + (rowCount * rowHeight);
  const hasNotes = Boolean(payment.notes && payment.notes.trim());
  const notesHeight = hasNotes ? 58 : 0;

  // Dynamic height
  const dynamicSvgHeight = 780 + tableHeight + notesHeight;

  let rowsSvg = '';
  let startY = 370;

  items.forEach((item, index) => {
    const y = startY + 44 + (index * rowHeight);
    const isEven = index % 2 === 0;
    const bgFill = isEven ? '#FFFFFF' : '#F8FAFC';

    rowsSvg += `
      <rect x="35" y="${y - 20}" width="730" height="${rowHeight}" fill="${bgFill}" />
      <line x1="35" y1="${y + rowHeight - 20}" x2="765" y2="${y + rowHeight - 20}" stroke="#E2E8F0" stroke-width="1" />
      
      <text x="50" y="${y + 2}" font-size="11" font-family="monospace" font-weight="700" fill="#30334F">${escapeXml(item.orderNumber)}</text>
      <text x="140" y="${y + 2}" font-size="10" fill="#475569">${escapeXml(formatDate(item.executionDate || ''))}</text>
      
      <text x="220" y="${y - 4}" font-size="11" font-weight="700" fill="#1E293B">${escapeXml(item.clientName.slice(0, 22))}</text>
      <text x="220" y="${y + 9}" font-size="9" fill="#64748B">${escapeXml(item.vehiclePlate)} • ${escapeXml((item.vehicleModel || '').slice(0, 18))}</text>
      
      <text x="430" y="${y + 2}" font-size="10" font-weight="600" fill="#334155">${escapeXml((item.serviceCategory || '').slice(0, 28))}</text>
      
      <text x="745" y="${y + 2}" font-size="12" font-weight="800" fill="#047857" text-anchor="end">${escapeXml(formatCurrency(item.paidInThisPayment))}</text>
    `;
  });

  const notesY = startY + tableHeight + 12;
  const totalsY = notesY + notesHeight + 8;
  const declarationY = totalsY + 115;
  const signY = declarationY + 95;
  const footerY = signY + 90;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${dynamicSvgHeight}" width="100%" height="auto" style="background-color: #FFFFFF; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: block;">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#F8FAFC" />
    </linearGradient>
    <linearGradient id="totalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#30334F" />
      <stop offset="100%" stop-color="#222538" />
    </linearGradient>
  </defs>

  <!-- Canvas Outer Border -->
  <rect x="15" y="15" width="770" height="${dynamicSvgHeight - 30}" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />

  <!-- Top Decorative Header Strip (Navy & Orange) -->
  <rect x="15" y="15" width="770" height="8" rx="4" fill="#30334F" />
  <rect x="15" y="23" width="770" height="4" fill="#F28C1B" />

  <!-- HEADER BOX -->
  <rect x="35" y="40" width="730" height="125" rx="12" fill="url(#headerGrad)" stroke="#E2E8F0" stroke-width="1" />
  <image href="${logoDataUri}" x="50" y="52" width="200" height="100" preserveAspectRatio="xMidYMid meet" />

  <!-- Company Details -->
  <text x="270" y="70" font-size="17" font-weight="900" fill="#30334F" letter-spacing="0.3">${escapeXml(companyName)}</text>
  <text x="270" y="88" font-size="11" font-weight="600" fill="#475569">CNPJ: ${escapeXml(cnpj)}</text>
  <text x="270" y="104" font-size="11" fill="#475569">${escapeXml(address)} • ${escapeXml(city)}/${escapeXml(state)}</text>
  <text x="270" y="120" font-size="11" fill="#475569">Telefone/WhatsApp: ${escapeXml(phone)} • E-mail: ${escapeXml(email)}</text>

  <!-- RECEIPT BADGE & IDENTIFIERS -->
  <rect x="35" y="180" width="730" height="48" rx="10" fill="#30334F" />
  <text x="50" y="210" font-size="13" font-weight="900" fill="#FFFFFF" letter-spacing="0.8">RECIBO DE QUITAÇÃO DE SERVIÇOS AO PRESTADOR</text>
  <rect x="580" y="190" width="170" height="28" rx="6" fill="#F28C1B" />
  <text x="665" y="209" font-size="11" font-weight="900" fill="#FFFFFF" text-anchor="middle" font-family="monospace">${escapeXml(receiptNum)}</text>

  <!-- TECHNICIAN & PAYMENT INFO CARDS -->
  <rect x="35" y="242" width="730" height="110" rx="10" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />
  
  <!-- Left: Prestador -->
  <text x="55" y="268" font-size="11" font-weight="800" fill="#30334F" letter-spacing="0.5">DADOS DO PRESTADOR DE SERVIÇOS:</text>
  <text x="55" y="290" font-size="13" font-weight="800" fill="#1E293B">${escapeXml(techName)}</text>
  <text x="55" y="308" font-size="11" fill="#475569">CPF: <tspan font-weight="700" fill="#1E293B">${escapeXml(techCpf)}</tspan></text>
  <text x="55" y="326" font-size="11" fill="#475569">Telefone/WhatsApp: <tspan font-weight="700" fill="#1E293B">${escapeXml(techPhone)}</tspan></text>

  <!-- Vertical Divider -->
  <line x1="430" y1="252" x2="430" y2="342" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="3 3" />

  <!-- Right: Payment Meta -->
  <text x="450" y="268" font-size="11" font-weight="800" fill="#30334F" letter-spacing="0.5">DADOS DA OPERAÇÃO DE PAGAMENTO:</text>
  <text x="450" y="290" font-size="11" fill="#475569">Data do Pagamento: <tspan font-weight="800" fill="#047857">${escapeXml(payDate)}</tspan></text>
  <text x="450" y="308" font-size="11" fill="#475569">Forma de Pagamento: <tspan font-weight="800" fill="#1E293B">${escapeXml(paymentMethodStr)}</tspan></text>
  <text x="450" y="326" font-size="11" fill="#475569">Status da Quitação: <tspan font-weight="800" fill="#047857">PAGO / QUITADO</tspan></text>

  <!-- TABLE HEADER -->
  <rect x="35" y="${startY}" width="730" height="38" rx="8" fill="#30334F" />
  <text x="50" y="${startY + 24}" font-size="10" font-weight="800" fill="#FFFFFF">ORDEM</text>
  <text x="140" y="${startY + 24}" font-size="10" font-weight="800" fill="#FFFFFF">DATA</text>
  <text x="220" y="${startY + 24}" font-size="10" font-weight="800" fill="#FFFFFF">CLIENTE / VEÍCULO</text>
  <text x="430" y="${startY + 24}" font-size="10" font-weight="800" fill="#FFFFFF">SERVIÇO</text>
  <text x="745" y="${startY + 24}" font-size="10" font-weight="800" fill="#FFFFFF" text-anchor="end">VALOR PAGO</text>

  <!-- TABLE ROWS -->
  ${rowsSvg}

  ${hasNotes ? `
  <!-- OBSERVATIONS -->
  <rect x="35" y="${notesY}" width="730" height="46" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />
  <text x="50" y="${notesY + 18}" font-size="9" font-weight="800" fill="#30334F">OBSERVAÇÕES:</text>
  <text x="50" y="${notesY + 34}" font-size="10" fill="#475569">${escapeXml((payment.notes || '').slice(0, 110))}</text>
  ` : ''}

  <!-- TOTAL SUMMARY CARD -->
  <rect x="35" y="${totalsY}" width="730" height="95" rx="12" fill="url(#totalGrad)" />
  <text x="60" y="${totalsY + 35}" font-size="11" font-weight="700" fill="#F28C1B" letter-spacing="0.5">TOTAL DE SERVIÇOS QUITADOS</text>
  <text x="60" y="${totalsY + 65}" font-size="20" font-weight="900" fill="#FFFFFF">${items.length} serviço(s) baixado(s)</text>

  <text x="735" y="${totalsY + 35}" font-size="12" font-weight="800" fill="#F8FAFC" text-anchor="end">VALOR TOTAL PAGO AO TÉCNICO</text>
  <text x="735" y="${totalsY + 72}" font-size="28" font-weight="900" fill="#34D399" text-anchor="end">${escapeXml(formatCurrency(payment.amount))}</text>

  <!-- LEGAL DECLARATION -->
  <rect x="35" y="${declarationY}" width="730" height="75" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />
  <text x="50" y="${declarationY + 24}" font-size="10" font-weight="800" fill="#30334F">DECLARAÇÃO DE QUITAÇÃO DE SERVIÇOS PRESTADOS:</text>
  <text x="50" y="${declarationY + 44}" font-size="10" fill="#475569">Declaramos que o prestador ${escapeXml(techName)} recebeu o montante discriminado de ${escapeXml(formatCurrency(payment.amount))},</text>
  <text x="50" y="${declarationY + 60}" font-size="10" fill="#475569">referente à remuneração dos serviços técnicos prestados relacionados neste comprovante, nada mais havendo a reclamar.</text>

  <!-- SIGNATURES -->
  <line x1="75" y1="${signY + 50}" x2="350" y2="${signY + 50}" stroke="#94A3B8" stroke-width="1" />
  <text x="212" y="${signY + 66}" font-size="11" font-weight="700" fill="#30334F" text-anchor="middle">${escapeXml(techName)}</text>
  <text x="212" y="${signY + 80}" font-size="9" fill="#64748B" text-anchor="middle">Assinatura do Prestador (CPF: ${escapeXml(techCpf)})</text>

  <line x1="450" y1="${signY + 50}" x2="725" y2="${signY + 50}" stroke="#94A3B8" stroke-width="1" />
  <text x="587" y="${signY + 66}" font-size="11" font-weight="700" fill="#30334F" text-anchor="middle">${escapeXml(companyName)}</text>
  <text x="587" y="${signY + 80}" font-size="9" fill="#64748B" text-anchor="middle">Administração / Financeiro</text>

  <!-- FOOTER -->
  <text x="400" y="${footerY}" font-size="9" fill="#94A3B8" text-anchor="middle">
    AUTOTEC Rastreamento Veicular • Comprovante emitido eletronicamente em ${escapeXml(formatDateTime(payment.createdAt))}
  </text>
</svg>`;
}
