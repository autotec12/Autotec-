import { TechnicalServiceOrder, CompanyExpense, CompanySettings } from '../types';
import { formatCurrency, formatDateTime, formatDate } from './calculations';
import { AUTOTEC_LOGO_ORIGINAL_DATA_URI } from '../assets/autotecLogos';
import { downloadBlob, svgToPngBlob } from './svgReceipt';

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
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  boleto: 'Boleto Bancário',
  transferencia: 'Transferência Bancária (TED/DOC)',
};

/**
 * Generates an SVG string representation of the official AUTOTEC Technical Service Receipt.
 * Title: RECIBO DE PRESTAÇÃO DE SERVIÇOS TÉCNICOS
 */
export function generateTechnicalServiceReceiptSvg(
  order: TechnicalServiceOrder,
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
  const pixKey = company?.pixKey || '38.450.812/0001-94';
  const logoDataUri = company?.logoSvg || AUTOTEC_LOGO_ORIGINAL_DATA_URI;
  const footerMsg = company?.receiptFooterMessage || 'Agradecemos a confiança e preferência pelos serviços AUTOTEC!';

  const orderNum = order.orderNumber || `OS-${Date.now()}`;
  const receiptNum = order.receiptNumber || `REC-ST-${Date.now()}`;
  const execDate = order.executionDate ? formatDate(order.executionDate) : formatDate(order.createdAt);
  const clientName = order.clientName || 'Cliente';
  const clientPhone = order.clientPhone || 'Não informado';
  const plate = order.vehiclePlate || 'Não informada';
  const vehicleDesc = `${order.vehicleModel || 'Veículo'} (${order.vehicleColor || 'Cor não informada'})`;
  const technician = order.technicianName || 'Técnico Autorizado AUTOTEC';
  const paymentMethodStr = PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod;

  const items = order.items || [];
  const itemCount = Math.max(items.length, 1);
  const itemRowHeight = 28;
  const tableHeight = 45 + (itemCount * itemRowHeight);
  
  // Calculate dynamic SVG height
  const baseHeight = 820;
  const dynamicSvgHeight = baseHeight + (itemCount > 2 ? (itemCount - 2) * itemRowHeight : 0);

  const statusBg = order.status === 'pago' ? '#DCFCE7' : order.status === 'parcial' ? '#FEF3C7' : '#FEE2E2';
  const statusColor = order.status === 'pago' ? '#166534' : order.status === 'parcial' ? '#92400E' : '#991B1B';
  const statusLabel = order.status === 'pago' ? 'PAGO' : order.status === 'parcial' ? 'PARCIAL' : 'PENDENTE';

  // Render items rows
  const itemRowsSvg = items.map((item, idx) => {
    const yPos = 385 + (idx * itemRowHeight);
    const bgRow = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    return `
      <rect x="40" y="${yPos - 18}" width="720" height="${itemRowHeight}" fill="${bgRow}" />
      <text x="55" y="${yPos}" font-size="11" font-weight="700" fill="#30334F">${idx + 1}</text>
      <rect x="80" y="${yPos - 14}" width="85" height="18" rx="4" fill="#E0E7FF" />
      <text x="122" y="${yPos}" font-size="10" font-weight="700" fill="#3730A3" text-anchor="middle">${escapeXml(item.category)}</text>
      <text x="180" y="${yPos}" font-size="11" fill="#334155">${escapeXml(item.description)}</text>
      <text x="745" y="${yPos}" font-size="11" font-weight="700" fill="#1E293B" text-anchor="end">${escapeXml(formatCurrency(item.value))}</text>
    `;
  }).join('');

  const tableBottomY = 360 + tableHeight;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${dynamicSvgHeight}" width="800" height="${dynamicSvgHeight}" style="background-color: #FFFFFF; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.08" flood-color="#000000" />
    </filter>
  </defs>

  <!-- Outer Border & Background -->
  <rect x="15" y="15" width="770" height="${dynamicSvgHeight - 30}" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2" />

  <!-- Top Accent Bar -->
  <path d="M 16 31 A 15 15 0 0 1 31 16 L 769 16 A 15 15 0 0 1 784 31 L 784 24 L 16 24 Z" fill="#F28C1B" />

  <!-- HEADER -->
  <g transform="translate(40, 40)">
    <!-- Logo Image -->
    <image href="${logoDataUri}" x="0" y="0" width="160" height="90" preserveAspectRatio="xMinYMid meet" />

    <!-- Company Details -->
    <g transform="translate(180, 5)">
      <text x="0" y="20" font-size="17" font-weight="800" fill="#30334F" letter-spacing="0.5">${escapeXml(companyName)}</text>
      <text x="0" y="40" font-size="11" fill="#475569">
        CNPJ: <tspan font-weight="700" fill="#1E293B">${escapeXml(cnpj)}</tspan> • Tel/WhatsApp: <tspan font-weight="700" fill="#1E293B">${escapeXml(whatsapp || phone)}</tspan>
      </text>
      <text x="0" y="58" font-size="11" fill="#475569">${escapeXml(address)} - ${escapeXml(city)}/${escapeXml(state)}</text>
      <text x="0" y="76" font-size="11" fill="#475569">
        E-mail: <tspan fill="#30334F">${escapeXml(email)}</tspan> • Chave PIX: <tspan font-weight="700" fill="#F28C1B">${escapeXml(pixKey)}</tspan>
      </text>
    </g>
  </g>

  <!-- DIVIDER -->
  <line x1="40" y1="145" x2="760" y2="145" stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="4 3" />

  <!-- TITLE BANNER -->
  <rect x="40" y="158" width="720" height="42" rx="8" fill="#30334F" />
  <text x="60" y="184" font-size="14" font-weight="800" fill="#FFFFFF" letter-spacing="0.8">RECIBO DE PRESTAÇÃO DE SERVIÇOS TÉCNICOS</text>
  <rect x="660" y="167" width="85" height="24" rx="6" fill="${statusBg}" />
  <text x="702" y="183" font-size="11" font-weight="800" fill="${statusColor}" text-anchor="middle">${statusLabel}</text>

  <!-- INFO BOX: ORDEM & RECIBO & TÉCNICO -->
  <rect x="40" y="210" width="720" height="42" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
  <text x="55" y="235" font-size="11" fill="#64748B">Nº DA O.S.: <tspan font-weight="800" fill="#30334F">${escapeXml(orderNum)}</tspan></text>
  <text x="240" y="235" font-size="11" fill="#64748B">Nº DO RECIBO: <tspan font-weight="800" fill="#30334F">${escapeXml(receiptNum)}</tspan></text>
  <text x="440" y="235" font-size="11" fill="#64748B">DATA: <tspan font-weight="700" fill="#1E293B">${escapeXml(execDate)}</tspan></text>
  <text x="580" y="235" font-size="11" fill="#64748B">TÉCNICO: <tspan font-weight="700" fill="#1E293B">${escapeXml(technician)}</tspan></text>

  <!-- DADOS DO CLIENTE & VEÍCULO -->
  <rect x="40" y="260" width="350" height="84" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
  <text x="55" y="280" font-size="11" font-weight="800" fill="#F28C1B" letter-spacing="0.5">DADOS DO CLIENTE</text>
  <text x="55" y="302" font-size="12" font-weight="700" fill="#1E293B">${escapeXml(clientName)}</text>
  <text x="55" y="324" font-size="11" fill="#64748B">Telefone: <tspan font-weight="600" fill="#334155">${escapeXml(clientPhone)}</tspan></text>

  <rect x="410" y="260" width="350" height="84" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
  <text x="425" y="280" font-size="11" font-weight="800" fill="#F28C1B" letter-spacing="0.5">DADOS DO VEÍCULO</text>
  <text x="425" y="302" font-size="12" font-weight="700" fill="#1E293B">Placa: <tspan font-family="monospace" fill="#30334F">${escapeXml(plate)}</tspan></text>
  <text x="425" y="324" font-size="11" fill="#64748B">Modelo: <tspan font-weight="600" fill="#334155">${escapeXml(vehicleDesc)}</tspan></text>

  <!-- TABLE HEADER -->
  <rect x="40" y="352" width="720" height="26" rx="4" fill="#EEF2F6" />
  <text x="55" y="369" font-size="10" font-weight="800" fill="#475569">#</text>
  <text x="122" y="369" font-size="10" font-weight="800" fill="#475569" text-anchor="middle">CATEGORIA</text>
  <text x="180" y="369" font-size="10" font-weight="800" fill="#475569">DESCRIÇÃO DO SERVIÇO</text>
  <text x="745" y="369" font-size="10" font-weight="800" fill="#475569" text-anchor="end">VALOR (R$)</text>

  <!-- TABLE ROWS -->
  ${itemRowsSvg}

  <!-- TOTALS & FINANCIAL SUMMARY -->
  <g transform="translate(40, ${tableBottomY + 15})">
    <!-- Payment Info Left Box -->
    <rect x="0" y="0" width="380" height="135" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
    <text x="20" y="26" font-size="11" font-weight="800" fill="#30334F" letter-spacing="0.5">DETALHES DO PAGAMENTO</text>
    <text x="20" y="52" font-size="11" fill="#64748B">Forma de Pagamento: <tspan font-weight="700" fill="#1E293B">${escapeXml(paymentMethodStr)}</tspan></text>
    <text x="20" y="74" font-size="11" fill="#64748B">Situação da O.S.: <tspan font-weight="800" fill="${statusColor}">${statusLabel}</tspan></text>
    ${order.notes ? `<text x="20" y="96" font-size="10" fill="#64748B">Observações: <tspan fill="#334155">${escapeXml(order.notes)}</tspan></text>` : ''}

    <!-- Financial Values Right Box -->
    <rect x="400" y="0" width="320" height="135" rx="8" fill="#F8FAFC" stroke="#CBD5E1" />
    <text x="420" y="26" font-size="11" fill="#64748B">Subtotal dos Serviços:</text>
    <text x="700" y="26" font-size="11" font-weight="700" fill="#1E293B" text-anchor="end">${escapeXml(formatCurrency(order.subtotal))}</text>

    <text x="420" y="48" font-size="11" fill="#64748B">Desconto Aplicado:</text>
    <text x="700" y="48" font-size="11" font-weight="700" fill="#DC2626" text-anchor="end">- ${escapeXml(formatCurrency(order.discount))}</text>

    <line x1="420" y1="58" x2="700" y2="58" stroke="#E2E8F0" stroke-width="1" />

    <text x="420" y="78" font-size="13" font-weight="800" fill="#30334F">VALOR TOTAL:</text>
    <text x="700" y="78" font-size="14" font-weight="800" fill="#30334F" text-anchor="end">${escapeXml(formatCurrency(order.totalAmount))}</text>

    <text x="420" y="100" font-size="11" font-weight="700" fill="#166534">Valor Pago:</text>
    <text x="700" y="100" font-size="11" font-weight="800" fill="#166534" text-anchor="end">${escapeXml(formatCurrency(order.paidAmount))}</text>

    <text x="420" y="122" font-size="11" font-weight="700" fill="${order.remainingBalance > 0 ? '#DC2626' : '#64748B'}">Saldo Restante:</text>
    <text x="700" y="122" font-size="11" font-weight="800" fill="${order.remainingBalance > 0 ? '#DC2626' : '#64748B'}" text-anchor="end">${escapeXml(formatCurrency(order.remainingBalance))}</text>
  </g>

  <!-- FOOTER -->
  <g transform="translate(40, ${dynamicSvgHeight - 95})">
    <line x1="0" y1="0" x2="720" y2="0" stroke="#CBD5E1" stroke-width="1" />
    <text x="360" y="25" font-size="10" font-style="italic" fill="#64748B" text-anchor="middle">
      "${escapeXml(footerMsg)}"
    </text>
    <text x="360" y="45" font-size="9" fill="#94A3B8" text-anchor="middle">
      Documento gerado eletronicamente por AUTOTEC Rastreamento Veicular • Autenticidade garantida
    </text>
  </g>
</svg>`;
}

/**
 * Generates an SVG string representation of the official AUTOTEC Company Expense Voucher.
 * Title: COMPROVANTE DE DESPESA
 */
export function generateCompanyExpenseVoucherSvg(
  expense: CompanyExpense,
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
  const footerMsg = 'Comprovante interno de despesa operacional emitido para fins contábeis e de controle financeiro.';

  const expNum = expense.expenseNumber || `DESP-${Date.now()}`;
  const vouchNum = expense.voucherNumber || `COMP-${Date.now()}`;
  const expDate = expense.date ? formatDate(expense.date) : formatDate(expense.createdAt);
  const supplier = expense.supplier || 'Fornecedor Diversos';
  const paymentMethodStr = PAYMENT_METHOD_LABELS[expense.paymentMethod] || expense.paymentMethod;

  const items = expense.items || [];
  const itemCount = Math.max(items.length, 1);
  const itemRowHeight = 28;
  const tableHeight = 45 + (itemCount * itemRowHeight);
  
  const baseHeight = 780;
  const dynamicSvgHeight = baseHeight + (itemCount > 2 ? (itemCount - 2) * itemRowHeight : 0);

  const statusBg = expense.status === 'pago' ? '#DCFCE7' : expense.status === 'parcial' ? '#FEF3C7' : '#FEE2E2';
  const statusColor = expense.status === 'pago' ? '#166534' : expense.status === 'parcial' ? '#92400E' : '#991B1B';
  const statusLabel = expense.status === 'pago' ? 'PAGO' : expense.status === 'parcial' ? 'PARCIAL' : 'PENDENTE';

  // Render items rows
  const itemRowsSvg = items.map((item, idx) => {
    const yPos = 365 + (idx * itemRowHeight);
    const bgRow = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    return `
      <rect x="40" y="${yPos - 18}" width="720" height="${itemRowHeight}" fill="${bgRow}" />
      <text x="55" y="${yPos}" font-size="11" font-weight="700" fill="#30334F">${idx + 1}</text>
      <rect x="75" y="${yPos - 14}" width="105" height="18" rx="4" fill="#FEE2E2" />
      <text x="127" y="${yPos}" font-size="10" font-weight="700" fill="#991B1B" text-anchor="middle">${escapeXml(item.category)}</text>
      <text x="190" y="${yPos}" font-size="11" fill="#334155">${escapeXml(item.description)}</text>
      <text x="540" y="${yPos}" font-size="11" fill="#475569" text-anchor="middle">${item.quantity}</text>
      <text x="630" y="${yPos}" font-size="11" fill="#475569" text-anchor="end">${escapeXml(formatCurrency(item.unitPrice))}</text>
      <text x="745" y="${yPos}" font-size="11" font-weight="700" fill="#1E293B" text-anchor="end">${escapeXml(formatCurrency(item.subtotal))}</text>
    `;
  }).join('');

  const tableBottomY = 340 + tableHeight;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${dynamicSvgHeight}" width="800" height="${dynamicSvgHeight}" style="background-color: #FFFFFF; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <!-- Outer Border & Background -->
  <rect x="15" y="15" width="770" height="${dynamicSvgHeight - 30}" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2" />

  <!-- Top Accent Bar (Orange) -->
  <path d="M 16 31 A 15 15 0 0 1 31 16 L 769 16 A 15 15 0 0 1 784 31 L 784 24 L 16 24 Z" fill="#F28C1B" />

  <!-- HEADER -->
  <g transform="translate(40, 40)">
    <image href="${logoDataUri}" x="0" y="0" width="160" height="90" preserveAspectRatio="xMinYMid meet" />

    <g transform="translate(180, 5)">
      <text x="0" y="20" font-size="17" font-weight="800" fill="#30334F" letter-spacing="0.5">${escapeXml(companyName)}</text>
      <text x="0" y="40" font-size="11" fill="#475569">
        CNPJ: <tspan font-weight="700" fill="#1E293B">${escapeXml(cnpj)}</tspan> • Contato: <tspan font-weight="700" fill="#1E293B">${escapeXml(whatsapp || phone)}</tspan>
      </text>
      <text x="0" y="58" font-size="11" fill="#475569">${escapeXml(address)} - ${escapeXml(city)}/${escapeXml(state)}</text>
      <text x="0" y="76" font-size="11" fill="#475569">E-mail: <tspan fill="#30334F">${escapeXml(email)}</tspan></text>
    </g>
  </g>

  <!-- DIVIDER -->
  <line x1="40" y1="145" x2="760" y2="145" stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="4 3" />

  <!-- TITLE BANNER -->
  <rect x="40" y="158" width="720" height="42" rx="8" fill="#30334F" />
  <text x="60" y="184" font-size="14" font-weight="800" fill="#FFFFFF" letter-spacing="0.8">COMPROVANTE DE DESPESA</text>
  <rect x="660" y="167" width="85" height="24" rx="6" fill="${statusBg}" />
  <text x="702" y="183" font-size="11" font-weight="800" fill="${statusColor}" text-anchor="middle">${statusLabel}</text>

  <!-- INFO BOX: NUMEROS & FORNECEDOR -->
  <rect x="40" y="210" width="720" height="42" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
  <text x="55" y="235" font-size="11" fill="#64748B">Nº DESPESA: <tspan font-weight="800" fill="#30334F">${escapeXml(expNum)}</tspan></text>
  <text x="250" y="235" font-size="11" fill="#64748B">Nº COMPROVANTE: <tspan font-weight="800" fill="#30334F">${escapeXml(vouchNum)}</tspan></text>
  <text x="490" y="235" font-size="11" fill="#64748B">DATA: <tspan font-weight="700" fill="#1E293B">${escapeXml(expDate)}</tspan></text>
  <text x="620" y="235" font-size="11" fill="#64748B">PAGTO: <tspan font-weight="700" fill="#1E293B">${escapeXml(paymentMethodStr)}</tspan></text>

  <!-- FORNECEDOR / BENEFICIÁRIO -->
  <rect x="40" y="260" width="720" height="60" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
  <text x="55" y="282" font-size="11" font-weight="800" fill="#F28C1B" letter-spacing="0.5">FORNECEDOR / BENEFICIÁRIO</text>
  <text x="55" y="304" font-size="13" font-weight="700" fill="#1E293B">${escapeXml(supplier)}</text>

  <!-- TABLE HEADER -->
  <rect x="40" y="330" width="720" height="26" rx="4" fill="#EEF2F6" />
  <text x="55" y="347" font-size="10" font-weight="800" fill="#475569">#</text>
  <text x="127" y="347" font-size="10" font-weight="800" fill="#475569" text-anchor="middle">CATEGORIA</text>
  <text x="190" y="347" font-size="10" font-weight="800" fill="#475569">DESCRIÇÃO DO ITEM / MATERIAL</text>
  <text x="540" y="347" font-size="10" font-weight="800" fill="#475569" text-anchor="middle">QTD</text>
  <text x="630" y="347" font-size="10" font-weight="800" fill="#475569" text-anchor="end">UNITÁRIO</text>
  <text x="745" y="347" font-size="10" font-weight="800" fill="#475569" text-anchor="end">SUBTOTAL</text>

  <!-- TABLE ROWS -->
  ${itemRowsSvg}

  <!-- TOTALS & FINANCIAL SUMMARY -->
  <g transform="translate(40, ${tableBottomY + 15})">
    <rect x="0" y="0" width="380" height="135" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
    <text x="20" y="26" font-size="11" font-weight="800" fill="#30334F" letter-spacing="0.5">INFORMAÇÕES ADICIONAIS</text>
    <text x="20" y="52" font-size="11" fill="#64748B">Método de Quitação: <tspan font-weight="700" fill="#1E293B">${escapeXml(paymentMethodStr)}</tspan></text>
    <text x="20" y="74" font-size="11" fill="#64748B">Status Financeiro: <tspan font-weight="800" fill="${statusColor}">${statusLabel}</tspan></text>
    ${expense.notes ? `<text x="20" y="96" font-size="10" fill="#64748B">Observações: <tspan fill="#334155">${escapeXml(expense.notes)}</tspan></text>` : ''}

    <rect x="400" y="0" width="320" height="135" rx="8" fill="#F8FAFC" stroke="#CBD5E1" />
    <text x="420" y="26" font-size="11" fill="#64748B">Subtotal dos Itens:</text>
    <text x="700" y="26" font-size="11" font-weight="700" fill="#1E293B" text-anchor="end">${escapeXml(formatCurrency(expense.subtotal))}</text>

    <text x="420" y="48" font-size="11" fill="#64748B">Desconto / Abatimento:</text>
    <text x="700" y="48" font-size="11" font-weight="700" fill="#166534" text-anchor="end">- ${escapeXml(formatCurrency(expense.discount))}</text>

    <line x1="420" y1="58" x2="700" y2="58" stroke="#E2E8F0" stroke-width="1" />

    <text x="420" y="78" font-size="13" font-weight="800" fill="#30334F">TOTAL DA DESPESA:</text>
    <text x="700" y="78" font-size="14" font-weight="800" fill="#991B1B" text-anchor="end">${escapeXml(formatCurrency(expense.totalAmount))}</text>

    <text x="420" y="100" font-size="11" font-weight="700" fill="#166534">Valor Pago:</text>
    <text x="700" y="100" font-size="11" font-weight="800" fill="#166534" text-anchor="end">${escapeXml(formatCurrency(expense.paidAmount))}</text>

    <text x="420" y="122" font-size="11" font-weight="700" fill="${expense.remainingBalance > 0 ? '#DC2626' : '#64748B'}">Saldo Restante:</text>
    <text x="700" y="122" font-size="11" font-weight="800" fill="${expense.remainingBalance > 0 ? '#DC2626' : '#64748B'} text-anchor="end">${escapeXml(formatCurrency(expense.remainingBalance))}</text>
  </g>

  <!-- FOOTER -->
  <g transform="translate(40, ${dynamicSvgHeight - 75})">
    <line x1="0" y1="0" x2="720" y2="0" stroke="#CBD5E1" stroke-width="1" />
    <text x="360" y="24" font-size="10" font-style="italic" fill="#64748B" text-anchor="middle">
      "${escapeXml(footerMsg)}"
    </text>
  </g>
</svg>`;
}

/**
 * Downloads a service receipt or expense voucher as PNG
 */
export async function downloadPngFromSvg(svgContent: string, fileName: string): Promise<void> {
  let sanitizedName = (fileName || 'documento-AUTOTEC').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
  if (!sanitizedName.toLowerCase().endsWith('.png')) {
    sanitizedName += '.png';
  }
  const pngBlob = await svgToPngBlob(svgContent, 2);
  downloadBlob(pngBlob, sanitizedName);
}

/**
 * Downloads a service receipt or expense voucher as SVG
 */
export function downloadSvgContent(svgContent: string, fileName: string): void {
  let sanitizedName = (fileName || 'documento-AUTOTEC').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
  if (!sanitizedName.toLowerCase().endsWith('.svg')) {
    sanitizedName += '.svg';
  }
  const fullSvg = svgContent.startsWith('<?xml') ? svgContent : `<?xml version="1.0" encoding="UTF-8"?>\n${svgContent}`;
  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, sanitizedName);
}

/**
 * Copies PNG image to clipboard
 */
export async function copyPngToClipboard(svgContent: string, fileName: string): Promise<{ success: boolean; message: string }> {
  try {
    const pngBlob = await svgToPngBlob(svgContent, 2);
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function') {
      try {
        const item = new ClipboardItem({ 'image/png': pngBlob });
        await navigator.clipboard.write([item]);
        return { success: true, message: 'Imagem copiada para a área de transferência! Cole no WhatsApp (Ctrl+V).' };
      } catch {
        downloadBlob(pngBlob, fileName);
        return { success: false, message: 'Área de transferência restrita. O arquivo PNG foi baixado no seu dispositivo.' };
      }
    } else {
      downloadBlob(pngBlob, fileName);
      return { success: false, message: 'Área de transferência indisponível. Arquivo PNG baixado.' };
    }
  } catch (e: any) {
    return { success: false, message: 'Erro ao processar imagem: ' + (e?.message || 'erro') };
  }
}
