import { Payment, Charge, Client, Vehicle, CompanySettings } from '../types';
import { formatCurrency, formatDateTime, formatDate } from './calculations';
import { AUTOTEC_LOGO_ORIGINAL_DATA_URI, AUTOTEC_LOGO_ORIGINAL_PATH } from '../assets/autotecLogos';

export interface ReceiptContext {
  payment: Payment;
  charge: Charge;
  client?: Client;
  vehicle?: Vehicle;
  company?: CompanySettings;
}

/**
 * Escapes characters for XML/SVG safety.
 */
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
 * Generates an SVG string representation of the official AUTOTEC payment receipt.
 * Note: Omit XML declaration so it renders natively inside HTML5 DOM without syntax errors.
 */
export function generateReceiptSvg(
  payment: Payment,
  charge: Charge,
  client?: Client,
  vehicle?: Vehicle,
  company?: CompanySettings
): string {
  const effectiveCompany: CompanySettings = {
    ...(company || {}),
    ...(payment.companySnapshot || {}),
  } as CompanySettings;

  const companyName = effectiveCompany.companyName || 'AUTOTEC RASTREAMENTO VEICULAR';
  const cnpj = effectiveCompany.cnpj;
  const phone = effectiveCompany.phone;
  const whatsapp = effectiveCompany.whatsapp;
  const address = effectiveCompany.address;
  const city = effectiveCompany.city;
  const state = effectiveCompany.state;
  const zipCode = effectiveCompany.zipCode;
  const email = effectiveCompany.email;
  const website = effectiveCompany.website;
  const pixKey = effectiveCompany.pixKey;
  const pixType = effectiveCompany.pixKeyType || 'Chave PIX';
  const logoDataUri = effectiveCompany.logoSvg || AUTOTEC_LOGO_ORIGINAL_DATA_URI;

  // Resolve Client Info with robust fallbacks
  const clientName = client?.name || payment.clientName || charge.clientName || 'Cliente';
  const clientDoc = client?.document || 'Não informado';
  const clientPhone = client?.whatsapp || client?.phone || 'Não informado';

  // Resolve Vehicle Info
  const plate = vehicle?.plate || payment.vehiclePlate || charge.vehiclePlate || 'Não informada';
  const vehicleInfo = vehicle
    ? `${vehicle.brand} ${vehicle.model} (${vehicle.color || 'Padrão'})`
    : (charge.vehicleModel || 'Veículo Contratado');
  const planName = vehicle?.planDescription || 'Plano de Rastreamento Veicular';
  const refMonth = charge.referenceMonth || 'Mensalidade Vigente';

  // Resolve Financial Values with strict numeric conversion to prevent R$ 0,00
  const rawOriginal = Number(charge.originalMonthlyValue ?? charge.totalAmount ?? payment.amount ?? 0);
  const rawPrevBalance = Number(charge.previousBalanceCarried || 0);
  const rawTotal = Number(charge.totalAmount || (rawOriginal + rawPrevBalance));
  const rawPaid = Number(payment.amount || 0);
  const rawRemaining = Number(payment.remainingAfterPayment ?? Math.max(0, rawTotal - rawPaid));

  const originalVal = formatCurrency(rawOriginal);
  const totalChargeVal = formatCurrency(rawTotal);
  const paidVal = formatCurrency(rawPaid);
  const remainingVal = formatCurrency(rawRemaining);
  const hasRemaining = rawRemaining > 0.009;

  const dateFormatted = formatDateTime(payment.paymentDate || payment.createdAt);
  const operatorName = payment.operatorName || 'Operador Autorizado';
  const receiptNum = payment.receiptNumber || `REC-${Date.now()}`;
  const footerMsg = effectiveCompany.receiptFooterMessage || 'Agradecemos a confiança e preferência pelos serviços AUTOTEC!';
  const methodText = PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod || 'PIX';

  // Build dynamic company lines (only displaying filled fields)
  const headerLinesSvg: string[] = [];
  let currentY = 88;
  const lineGap = 18;

  // 1. CNPJ / Document & Phone / WhatsApp
  const docParts: string[] = [];
  if (cnpj) docParts.push(`CNPJ: <tspan fill="#1E293B" font-weight="700">${escapeXml(cnpj)}</tspan>`);
  if (whatsapp || phone) {
    if (whatsapp && phone && whatsapp !== phone) {
      docParts.push(`Tel: <tspan fill="#1E293B">${escapeXml(phone)}</tspan> • WhatsApp: <tspan fill="#1E293B">${escapeXml(whatsapp)}</tspan>`);
    } else {
      docParts.push(`WhatsApp: <tspan fill="#1E293B">${escapeXml(whatsapp || phone)}</tspan>`);
    }
  }
  if (docParts.length > 0) {
    headerLinesSvg.push(`<text x="285" y="${currentY}" font-size="11" font-weight="600" fill="#475569">${docParts.join(' • ')}</text>`);
    currentY += lineGap;
  }

  // 2. Address & Location
  const addrParts: string[] = [];
  if (address) addrParts.push(escapeXml(address));
  const locationParts: string[] = [];
  if (city) locationParts.push(escapeXml(city));
  if (state) locationParts.push(escapeXml(state));
  if (zipCode) locationParts.push(`CEP: ${escapeXml(zipCode)}`);
  if (locationParts.length > 0) {
    addrParts.push(locationParts.join(' - '));
  }
  if (addrParts.length > 0) {
    headerLinesSvg.push(`<text x="285" y="${currentY}" font-size="11" fill="#64748B">${addrParts.join(', ')}</text>`);
    currentY += lineGap;
  }

  // 3. Email & Website
  const webParts: string[] = [];
  if (email) webParts.push(`E-mail: <tspan fill="#1E293B">${escapeXml(email)}</tspan>`);
  if (website) webParts.push(`Site: <tspan fill="#1E293B">${escapeXml(website)}</tspan>`);
  if (webParts.length > 0) {
    headerLinesSvg.push(`<text x="285" y="${currentY}" font-size="11" fill="#475569">${webParts.join(' • ')}</text>`);
    currentY += lineGap;
  }

  // 4. PIX Key
  if (pixKey) {
    headerLinesSvg.push(`<text x="285" y="${currentY}" font-size="11" font-weight="600" fill="#0284C7">Chave PIX (${escapeXml(pixType)}): <tspan fill="#0369A1" font-weight="700">${escapeXml(pixKey)}</tspan></text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 800 1150" width="100%" height="100%" style="background:#ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display:block;">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#F8FAFC" />
    </linearGradient>
    <linearGradient id="badgeGradPaid" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ECFDF5" />
      <stop offset="100%" stop-color="#D1FAE5" />
    </linearGradient>
    <linearGradient id="badgeGradPartial" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFBEB" />
      <stop offset="100%" stop-color="#FEF3C7" />
    </linearGradient>
    <clipPath id="companyHeaderClip">
      <rect x="280" y="42" width="315" height="126" rx="6" />
    </clipPath>
  </defs>

  <!-- Canvas Outer Border -->
  <rect x="15" y="15" width="770" height="1120" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />

  <!-- Top Decorative Header Strip (Corporate Navy #30334F & Orange #F28C1B) -->
  <rect x="15" y="15" width="770" height="8" rx="4" fill="#30334F" />
  <rect x="15" y="23" width="770" height="4" fill="#F28C1B" />

  <!-- HEADER SECTION -->
  <rect x="35" y="40" width="730" height="130" rx="12" fill="url(#headerGrad)" stroke="#E2E8F0" stroke-width="1" />

  <!-- Official AUTOTEC Logo (Original Full-Color Embedded) -->
  <image href="${logoDataUri}" xlink:href="${logoDataUri}" x="50" y="48" width="220" height="114" preserveAspectRatio="xMidYMid meet" />

  <!-- Company Identification Info (Protected within clip area against badge overlap) -->
  <g clip-path="url(#companyHeaderClip)">
    <text x="285" y="68" font-size="18" font-weight="900" fill="#30334F" letter-spacing="0.3">${escapeXml(companyName)}</text>
    ${headerLinesSvg.join('\n    ')}
  </g>

  <!-- Receipt Number Voucher Badge -->
  <rect x="600" y="55" width="150" height="80" rx="10" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1.5" />
  <text x="675" y="77" font-size="10" font-weight="800" fill="#64748B" text-anchor="middle" letter-spacing="1">RECIBO OFICIAL</text>
  <text x="675" y="101" font-size="15" font-weight="900" fill="#0F172A" text-anchor="middle">${escapeXml(receiptNum)}</text>
  <text x="675" y="122" font-size="10" font-weight="600" fill="#2563EB" text-anchor="middle">1ª VIA - CLIENTE</text>

  <!-- STATUS BANNER (CLEAR SEPARATION OF FULL VS PARTIAL PAYMENT) -->
  ${hasRemaining ? `
  <rect x="35" y="185" width="730" height="52" rx="10" fill="url(#badgeGradPartial)" stroke="#F59E0B" stroke-width="1.5" />
  <g transform="translate(55, 198)">
    <circle cx="13" cy="13" r="13" fill="#F59E0B" />
    <text x="13" y="18" font-size="14" font-weight="900" fill="#FFFFFF" text-anchor="middle">!</text>
  </g>
  <text x="95" y="212" font-size="14" font-weight="900" fill="#92400E" letter-spacing="0.5">PAGAMENTO PARCIAL REGISTRADO</text>
  <text x="95" y="228" font-size="11" font-weight="600" fill="#B45309">Mensalidade não quitada integralmente. Permanece saldo devedor em aberto.</text>
  <rect x="580" y="193" width="170" height="36" rx="8" fill="#FDE68A" stroke="#F59E0B" />
  <text x="665" y="210" font-size="9" font-weight="800" fill="#78350F" text-anchor="middle">SALDO RESTANTE</text>
  <text x="665" y="224" font-size="12" font-weight="900" fill="#B45309" text-anchor="middle">${remainingVal}</text>
  ` : `
  <rect x="35" y="185" width="730" height="52" rx="10" fill="url(#badgeGradPaid)" stroke="#10B981" stroke-width="1.5" />
  <g transform="translate(55, 198)">
    <circle cx="13" cy="13" r="13" fill="#10B981" />
    <path d="M8 13 L12 17 L19 9" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </g>
  <text x="95" y="212" font-size="14" font-weight="900" fill="#065F46" letter-spacing="0.5">MENSALIDADE 100% QUITADA</text>
  <text x="95" y="228" font-size="11" font-weight="600" fill="#047857">Pagamento recebido e liquidado com sucesso. Nenhum saldo pendente para esta fatura.</text>
  <rect x="580" y="193" width="170" height="36" rx="8" fill="#A7F3D0" stroke="#059669" />
  <text x="665" y="210" font-size="9" font-weight="800" fill="#064E3B" text-anchor="middle">STATUS DA FATURA</text>
  <text x="665" y="224" font-size="12" font-weight="900" fill="#065F46" text-anchor="middle">TOTALMENTE PAGA</text>
  `}

  <!-- CLIENT & CONTRACT / VEHICLE INFO DUAL BOX -->
  <rect x="35" y="250" width="730" height="170" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />

  <!-- Left: Client Info -->
  <text x="55" y="278" font-size="12" font-weight="800" fill="#64748B" letter-spacing="0.5">DADOS DO CLIENTE / PAGADOR</text>
  <text x="55" y="306" font-size="17" font-weight="800" fill="#0F172A">${escapeXml(clientName)}</text>
  <text x="55" y="331" font-size="13" fill="#475569">CPF / CNPJ: <tspan font-weight="700" fill="#1E293B">${escapeXml(clientDoc)}</tspan></text>
  <text x="55" y="355" font-size="13" fill="#475569">Telefone / WhatsApp: <tspan font-weight="700" fill="#1E293B">${escapeXml(clientPhone)}</tspan></text>
  <text x="55" y="379" font-size="12" fill="#64748B">Data da Emissão: <tspan font-weight="600" fill="#334155">${escapeXml(dateFormatted)}</tspan></text>

  <!-- Vertical Divider -->
  <line x1="400" y1="265" x2="400" y2="405" stroke="#CBD5E1" stroke-dasharray="4 4" />

  <!-- Right: Vehicle Info -->
  <text x="425" y="278" font-size="12" font-weight="800" fill="#64748B" letter-spacing="0.5">DADOS DO VEÍCULO</text>
  
  <!-- License Plate Tag -->
  <rect x="425" y="290" width="130" height="34" rx="6" fill="#0F172A" />
  <rect x="425" y="290" width="130" height="6" rx="3" fill="#2563EB" />
  <text x="490" y="314" font-size="16" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="2">${escapeXml(plate)}</text>

  <text x="425" y="345" font-size="13" font-weight="700" fill="#0F172A">${escapeXml(vehicleInfo)}</text>
  <text x="425" y="367" font-size="13" fill="#475569">Plano: <tspan font-weight="700" fill="#1E293B">${escapeXml(planName)}</tspan></text>
  <text x="425" y="389" font-size="13" fill="#475569">Mês de Referência: <tspan font-weight="800" fill="#0284C7">${escapeXml(refMonth)}</tspan></text>

  <!-- FINANCIAL BREAKDOWN SECTION -->
  <rect x="35" y="435" width="730" height="355" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5" />

  <!-- Table Header -->
  <rect x="35" y="435" width="730" height="42" rx="12" fill="#F1F5F9" />
  <rect x="35" y="465" width="730" height="12" fill="#F1F5F9" />
  <line x1="35" y1="477" x2="765" y2="477" stroke="#CBD5E1" />

  <text x="55" y="462" font-size="12" font-weight="800" fill="#475569" letter-spacing="0.5">DISCRIMINAÇÃO DOS VALORES DA MENSALIDADE</text>
  <text x="745" y="462" font-size="12" font-weight="800" fill="#475569" text-anchor="end">VALOR (R$)</text>

  <!-- Line 1: Valor Original da Mensalidade -->
  <text x="55" y="510" font-size="14" fill="#334155">Valor Original da Mensalidade Contratada</text>
  <text x="745" y="510" font-size="15" font-weight="700" fill="#0F172A" text-anchor="end">${originalVal}</text>
  <line x1="55" y1="525" x2="745" y2="525" stroke="#F1F5F9" />

  <!-- Line 2: Saldo Anterior Transferido (se houver) -->
  ${charge.previousBalanceCarried > 0 ? `
  <text x="55" y="550" font-size="13" fill="#B45309">(+) Saldo Devedor Anterior Transferido</text>
  <text x="745" y="550" font-size="14" font-weight="700" fill="#B45309" text-anchor="end">${formatCurrency(charge.previousBalanceCarried)}</text>
  <line x1="55" y1="565" x2="745" y2="565" stroke="#F1F5F9" />
  ` : ''}

  <!-- Line 3: Total da Cobrança Gerada -->
  <text x="55" y="${charge.previousBalanceCarried > 0 ? 595 : 560}" font-size="14" font-weight="700" fill="#0F172A">Total da Cobrança Gerada</text>
  <text x="745" y="${charge.previousBalanceCarried > 0 ? 595 : 560}" font-size="16" font-weight="800" fill="#0F172A" text-anchor="end">${totalChargeVal}</text>
  <line x1="55" y1="${charge.previousBalanceCarried > 0 ? 610 : 575}" x2="745" y2="${charge.previousBalanceCarried > 0 ? 610 : 575}" stroke="#E2E8F0" stroke-width="1.5" />

  <!-- Line 4: VALOR RECEBIDO NESTE RECIBO (Highlight Box) -->
  <rect x="50" y="${charge.previousBalanceCarried > 0 ? 625 : 590}" width="700" height="60" rx="10" fill="#ECFDF5" stroke="#10B981" stroke-width="2" />
  <g transform="translate(70, ${charge.previousBalanceCarried > 0 ? 640 : 605})">
    <circle cx="15" cy="15" r="15" fill="#10B981" />
    <path d="M10 15 L14 19 L21 11" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </g>
  <text x="115" y="${charge.previousBalanceCarried > 0 ? 653 : 618}" font-size="14" font-weight="900" fill="#065F46" letter-spacing="0.5">VALOR EFETIVAMENTE PAGO NESTE RECIBO</text>
  <text x="115" y="${charge.previousBalanceCarried > 0 ? 671 : 636}" font-size="11" font-weight="600" fill="#047857">Forma: ${escapeXml(methodText)} • Autenticado digitalmente</text>
  <text x="730" y="${charge.previousBalanceCarried > 0 ? 663 : 628}" font-size="24" font-weight="900" fill="#047857" text-anchor="end">${paidVal}</text>

  <!-- Line 5: Saldo Restante (Conditional Partial Warning) -->
  ${hasRemaining ? `
  <rect x="50" y="${charge.previousBalanceCarried > 0 ? 695 : 660}" width="700" height="55" rx="8" fill="#FFFBEB" stroke="#F59E0B" stroke-width="1.5" />
  <g transform="translate(70, ${charge.previousBalanceCarried > 0 ? 710 : 675})">
    <circle cx="12" cy="12" r="12" fill="#F59E0B" />
    <text x="12" y="17" font-size="13" font-weight="900" fill="#FFFFFF" text-anchor="middle">!</text>
  </g>
  <text x="105" y="${charge.previousBalanceCarried > 0 ? 725 : 690}" font-size="13" font-weight="800" fill="#92400E">SALDO DEVEDOR RESTANTE EM ABERTO:</text>
  <text x="105" y="${charge.previousBalanceCarried > 0 ? 740 : 705}" font-size="11" font-weight="600" fill="#B45309">Diferença residual vinculada à fatura e sujeita às condições de pagamento acordadas.</text>
  <text x="730" y="${charge.previousBalanceCarried > 0 ? 732 : 697}" font-size="19" font-weight="900" fill="#B45309" text-anchor="end">${remainingVal}</text>
  ` : `
  <rect x="50" y="${charge.previousBalanceCarried > 0 ? 695 : 660}" width="700" height="40" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
  <text x="70" y="${charge.previousBalanceCarried > 0 ? 720 : 685}" font-size="12" font-weight="700" fill="#059669">✓ Saldo Devedor Restante: R$ 0,00 (Nenhuma pendência financeira para este contrato).</text>
  `}

  <!-- PAYMENT TRANSACTION DETAILS & SECURITY SEAL -->
  <rect x="35" y="805" width="730" height="150" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />

  <text x="55" y="835" font-size="12" font-weight="800" fill="#64748B" letter-spacing="0.5">INFORMAÇÕES DA TRANSAÇÃO &amp; AUTENTICAÇÃO</text>
  
  <text x="55" y="865" font-size="13" fill="#475569">Forma de Liquidação: <tspan font-weight="800" fill="#0F172A">${escapeXml(methodText)}</tspan></text>
  <text x="55" y="890" font-size="13" fill="#475569">Operador / Recebedor: <tspan font-weight="700" fill="#0F172A">${escapeXml(operatorName)}</tspan></text>
  <text x="55" y="915" font-size="13" fill="#475569">Data e Hora do Pagamento: <tspan font-weight="700" fill="#0F172A">${escapeXml(dateFormatted)}</tspan></text>
  <text x="55" y="938" font-size="12" fill="#64748B">Vencimento Original da Fatura: <tspan font-weight="700" fill="#2563EB">${formatDate(charge.dueDate)}</tspan></text>

  <!-- Digital Seal Graphic -->
  <g transform="translate(560, 825)">
    <circle cx="85" cy="45" r="36" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2" />
    <circle cx="85" cy="45" r="30" fill="none" stroke="#93C5FD" stroke-width="1" stroke-dasharray="3 3" />
    <path d="M72 45 L81 54 L99 36" stroke="#2563EB" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    <text x="85" y="95" font-size="9" font-weight="900" fill="#1E3A8A" text-anchor="middle" letter-spacing="0.5">AUTENTICIDADE DIGITAL</text>
    <text x="85" y="108" font-size="8" font-weight="600" fill="#64748B" text-anchor="middle">AUTOTEC SISTEMAS</text>
  </g>

  <!-- FOOTER & THANKS NOTE -->
  <rect x="35" y="970" width="730" height="120" rx="12" fill="#30334F" />
  
  <text x="400" y="1010" font-size="15" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.5">${escapeXml(footerMsg)}</text>
  <text x="400" y="1035" font-size="11" fill="#E2E4E0" text-anchor="middle">AUTOTEC RASTREAMENTO VEICULAR • Gestão Financeira Especializada</text>
  <text x="400" y="1055" font-size="10" fill="#CBD5E1" text-anchor="middle">Documento emitido eletronicamente em formato vetorial SVG de alta definição • Válido como comprovante oficial de pagamento.</text>
  <line x1="200" y1="1068" x2="600" y2="1068" stroke="#464969" />
  <text x="400" y="1080" font-size="9" fill="#F28C1B" text-anchor="middle" font-weight="bold">${escapeXml(
    [whatsapp || phone ? `Suporte e Atendimento: ${whatsapp || phone}` : '', email || effectiveCompany.email || 'contato@autotec.com.br'].filter(Boolean).join(' • ')
  )}</text>
</svg>`;
}

/**
 * Downloads any Blob reliably on desktop, Android Chrome, and iOS Safari.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}

/**
 * Helper to draw a rounded rectangle on a 2D canvas context.
 */
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fillStyle?: string,
  strokeStyle?: string,
  lineWidth?: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle && lineWidth) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws the receipt directly to an HTML5 Canvas using pure Canvas 2D API.
 * This guarantees 100% fail-safe PNG generation on any browser without any SVG subresource,
 * sandbox, or isolated image context restrictions.
 */
export async function renderReceiptDirectToCanvas(
  context: ReceiptContext,
  scale = 2
): Promise<Blob> {
  const { payment, charge, client, vehicle, company } = context;

  const width = 800;
  const height = 1150;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto 2D do Canvas indisponível');
  }

  // Set 2x scale mapping for coordinate rendering
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Outer border
  drawRoundRect(ctx, 15, 15, 770, 1120, 16, '#FFFFFF', '#CBD5E1', 2);

  // Top header color strips (navy & orange)
  drawRoundRect(ctx, 15, 15, 770, 8, 4, '#0F172A');
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(15, 23, 770, 4);

  // 2. Header Card
  drawRoundRect(ctx, 35, 40, 730, 130, 12, '#F8FAFC', '#E2E8F0', 1);

  // Load official AUTOTEC logo directly as raster image
  const logoSrc = company?.logoSvg || AUTOTEC_LOGO_ORIGINAL_DATA_URI || AUTOTEC_LOGO_ORIGINAL_PATH;
  try {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoSrc;
    await new Promise<void>((resolve) => {
      if (logoImg.complete && logoImg.naturalWidth > 0) return resolve();
      logoImg.onload = () => resolve();
      logoImg.onerror = () => resolve();
      // Timeout safety: max 1.2s for logo
      setTimeout(resolve, 1200);
    });

    if (logoImg.naturalWidth > 0) {
      // Draw logo maintaining proportions in (x: 50, y: 48, w: 220, h: 114)
      const maxW = 220;
      const maxH = 114;
      const ratio = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight);
      const drawW = logoImg.naturalWidth * ratio;
      const drawH = logoImg.naturalHeight * ratio;
      const drawX = 50 + (maxW - drawW) / 2;
      const drawY = 48 + (maxH - drawH) / 2;
      ctx.drawImage(logoImg, drawX, drawY, drawW, drawH);
    } else {
      // Fallback text logo if image fails
      ctx.font = '900 24px -apple-system, sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.fillText('AUTOTEC', 55, 105);
      ctx.font = '700 12px -apple-system, sans-serif';
      ctx.fillStyle = '#F59E0B';
      ctx.fillText('RASTREAMENTO VEICULAR', 55, 125);
    }
  } catch {
    // Fallback if image load throws
  }

  // Company details
  const effectiveCompany: CompanySettings = {
    ...(company || {}),
    ...(payment.companySnapshot || {}),
  } as CompanySettings;

  const companyName = effectiveCompany.companyName || 'AUTOTEC RASTREAMENTO VEICULAR';
  const cnpj = effectiveCompany.cnpj;
  const phone = effectiveCompany.phone;
  const whatsapp = effectiveCompany.whatsapp;
  const address = effectiveCompany.address;
  const city = effectiveCompany.city;
  const state = effectiveCompany.state;
  const zipCode = effectiveCompany.zipCode;
  const email = effectiveCompany.email;
  const website = effectiveCompany.website;
  const pixKey = effectiveCompany.pixKey;
  const pixType = effectiveCompany.pixKeyType || 'Chave PIX';

  ctx.save();
  ctx.beginPath();
  ctx.rect(280, 42, 315, 126);
  ctx.clip();

  ctx.textAlign = 'left';
  ctx.font = '900 18px -apple-system, sans-serif';
  ctx.fillStyle = '#30334F';
  ctx.fillText(companyName, 285, 68);

  let currentCanvasY = 88;
  const canvasLineSpacing = 18;

  // 1. CNPJ / CPF & Phone / WhatsApp
  const docParts: string[] = [];
  if (cnpj) docParts.push(`CNPJ: ${cnpj}`);
  if (whatsapp || phone) {
    if (whatsapp && phone && whatsapp !== phone) {
      docParts.push(`Tel: ${phone} • WhatsApp: ${whatsapp}`);
    } else {
      docParts.push(`WhatsApp: ${whatsapp || phone}`);
    }
  }
  if (docParts.length > 0) {
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(docParts.join(' • '), 285, currentCanvasY);
    currentCanvasY += canvasLineSpacing;
  }

  // 2. Address & Location
  const addrParts: string[] = [];
  if (address) addrParts.push(address);
  const locationParts: string[] = [];
  if (city) locationParts.push(city);
  if (state) locationParts.push(state);
  if (zipCode) locationParts.push(`CEP: ${zipCode}`);
  if (locationParts.length > 0) {
    addrParts.push(locationParts.join(' - '));
  }
  if (addrParts.length > 0) {
    ctx.font = '400 11px -apple-system, sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.fillText(addrParts.join(', '), 285, currentCanvasY);
    currentCanvasY += canvasLineSpacing;
  }

  // 3. Email & Website
  const webParts: string[] = [];
  if (email) webParts.push(`E-mail: ${email}`);
  if (website) webParts.push(`Site: ${website}`);
  if (webParts.length > 0) {
    ctx.font = '500 11px -apple-system, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(webParts.join(' • '), 285, currentCanvasY);
    currentCanvasY += canvasLineSpacing;
  }

  // 4. PIX Key
  if (pixKey) {
    ctx.font = '700 11px -apple-system, sans-serif';
    ctx.fillStyle = '#0284C7';
    ctx.fillText(`Chave PIX (${pixType}): ${pixKey}`, 285, currentCanvasY);
  }

  ctx.restore();

  // Voucher Box
  const receiptNum = payment.receiptNumber || `REC-${Date.now()}`;
  drawRoundRect(ctx, 600, 55, 150, 80, 10, '#F1F5F9', '#CBD5E1', 1.5);
  ctx.textAlign = 'center';
  ctx.font = '800 10px -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('RECIBO OFICIAL', 675, 77);
  ctx.font = '900 15px -apple-system, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(receiptNum, 675, 101);
  ctx.font = '700 10px -apple-system, sans-serif';
  ctx.fillStyle = '#2563EB';
  ctx.fillText('1ª VIA - CLIENTE', 675, 122);

  // 3. Status Banner
  const hasRemaining = payment.remainingAfterPayment > 0.01;
  const remainingVal = formatCurrency(payment.remainingAfterPayment);

  if (hasRemaining) {
    drawRoundRect(ctx, 35, 185, 730, 52, 10, '#FFFBEB', '#F59E0B', 1.5);
    // Alert Circle
    ctx.beginPath();
    ctx.arc(68, 211, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#F59E0B';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '900 14px -apple-system, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('!', 68, 216);

    ctx.textAlign = 'left';
    ctx.font = '900 13px -apple-system, sans-serif';
    ctx.fillStyle = '#92400E';
    ctx.fillText('PAGAMENTO PARCIAL REGISTRADO', 95, 206);
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.fillStyle = '#B45309';
    ctx.fillText('Mensalidade não quitada integralmente. Permanece saldo devedor em aberto.', 95, 224);

    drawRoundRect(ctx, 580, 193, 170, 36, 8, '#FDE68A', '#F59E0B', 1);
    ctx.textAlign = 'center';
    ctx.font = '800 9px -apple-system, sans-serif';
    ctx.fillStyle = '#78350F';
    ctx.fillText('SALDO RESTANTE', 665, 208);
    ctx.font = '900 12px -apple-system, sans-serif';
    ctx.fillStyle = '#B45309';
    ctx.fillText(remainingVal, 665, 222);
  } else {
    drawRoundRect(ctx, 35, 185, 730, 52, 10, '#ECFDF5', '#10B981', 1.5);
    // Check Circle
    ctx.beginPath();
    ctx.arc(68, 211, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#10B981';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(63, 211);
    ctx.lineTo(67, 215);
    ctx.lineTo(74, 207);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = '900 13px -apple-system, sans-serif';
    ctx.fillStyle = '#065F46';
    ctx.fillText('MENSALIDADE 100% QUITADA', 95, 206);
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.fillStyle = '#047857';
    ctx.fillText('Pagamento recebido e liquidado com sucesso. Nenhum saldo pendente para esta fatura.', 95, 224);

    drawRoundRect(ctx, 580, 193, 170, 36, 8, '#A7F3D0', '#059669', 1);
    ctx.textAlign = 'center';
    ctx.font = '800 9px -apple-system, sans-serif';
    ctx.fillStyle = '#064E3B';
    ctx.fillText('STATUS DA FATURA', 665, 208);
    ctx.font = '900 12px -apple-system, sans-serif';
    ctx.fillStyle = '#065F46';
    ctx.fillText('TOTALMENTE PAGA', 665, 222);
  }

  // 4. Client & Vehicle Dual Box
  drawRoundRect(ctx, 35, 250, 730, 170, 12, '#F8FAFC', '#E2E8F0', 1);

  const clientName = client?.name || payment.clientName || 'Cliente';
  const clientDoc = client?.document || 'Não informado';
  const clientPhone = client?.whatsapp || client?.phone || 'Não informado';
  const dateFormatted = formatDateTime(payment.paymentDate || payment.createdAt);

  ctx.textAlign = 'left';
  ctx.font = '800 12px -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('DADOS DO CLIENTE / PAGADOR', 55, 278);

  ctx.font = '800 17px -apple-system, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(clientName, 55, 306);

  ctx.font = '500 13px -apple-system, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('CPF / CNPJ: ', 55, 331);
  ctx.font = '700 13px -apple-system, sans-serif';
  ctx.fillStyle = '#1E293B';
  ctx.fillText(clientDoc, 140, 331);

  ctx.font = '500 13px -apple-system, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Telefone / WhatsApp: ', 55, 355);
  ctx.font = '700 13px -apple-system, sans-serif';
  ctx.fillStyle = '#1E293B';
  ctx.fillText(clientPhone, 195, 355);

  ctx.font = '500 12px -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('Data da Emissão: ', 55, 379);
  ctx.font = '600 12px -apple-system, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(dateFormatted, 160, 379);

  // Vertical Divider
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.moveTo(400, 265);
  ctx.lineTo(400, 405);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // Right side: Vehicle info
  const plate = vehicle?.plate || payment.vehiclePlate || 'ABC1D23';
  const vehicleInfo = vehicle
    ? `${vehicle.brand} ${vehicle.model} (${vehicle.color || 'Padrão'})`
    : (charge.vehicleModel || 'Veículo Contratado');
  const planName = vehicle?.planDescription || 'Plano de Rastreamento Veicular';
  const refMonth = charge.referenceMonth || 'Mensalidade Vigente';

  ctx.font = '800 12px -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('DADOS DO VEÍCULO', 425, 278);

  // License plate tag
  drawRoundRect(ctx, 425, 290, 130, 34, 6, '#0F172A');
  ctx.fillStyle = '#2563EB';
  ctx.fillRect(425, 290, 130, 6);
  ctx.textAlign = 'center';
  ctx.font = '900 16px -apple-system, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(plate, 490, 314);

  ctx.textAlign = 'left';
  ctx.font = '700 13px -apple-system, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(vehicleInfo, 425, 345);

  ctx.font = '500 13px -apple-system, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Plano: ', 425, 367);
  ctx.font = '700 13px -apple-system, sans-serif';
  ctx.fillStyle = '#1E293B';
  ctx.fillText(planName, 470, 367);

  ctx.font = '500 13px -apple-system, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Mês de Referência: ', 425, 389);
  ctx.font = '800 13px -apple-system, sans-serif';
  ctx.fillStyle = '#0284C7';
  ctx.fillText(refMonth, 555, 389);

  // 5. Financial Breakdown Table
  drawRoundRect(ctx, 35, 435, 730, 355, 12, '#FFFFFF', '#E2E8F0', 1.5);

  // Table header
  drawRoundRect(ctx, 35, 435, 730, 42, 12, '#F1F5F9');
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(35, 465, 730, 12);
  ctx.beginPath();
  ctx.moveTo(35, 477);
  ctx.lineTo(765, 477);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '800 12px -apple-system, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('DISCRIMINAÇÃO DOS VALORES DA MENSALIDADE', 55, 462);
  ctx.textAlign = 'right';
  ctx.fillText('VALOR (R$)', 745, 462);

  // Row 1: Valor Original
  ctx.textAlign = 'left';
  ctx.font = '500 14px -apple-system, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('Valor Original da Mensalidade Contratada', 55, 510);
  ctx.textAlign = 'right';
  ctx.font = '700 15px -apple-system, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(formatCurrency(charge.originalMonthlyValue), 745, 510);

  ctx.beginPath();
  ctx.moveTo(55, 525);
  ctx.lineTo(745, 525);
  ctx.strokeStyle = '#F1F5F9';
  ctx.stroke();

  // Row 2: Previous balance if any
  const hasPrevious = charge.previousBalanceCarried > 0;
  if (hasPrevious) {
    ctx.textAlign = 'left';
    ctx.font = '500 13px -apple-system, sans-serif';
    ctx.fillStyle = '#B45309';
    ctx.fillText('(+) Saldo Devedor Anterior Transferido', 55, 550);
    ctx.textAlign = 'right';
    ctx.font = '700 14px -apple-system, sans-serif';
    ctx.fillText(formatCurrency(charge.previousBalanceCarried), 745, 550);

    ctx.beginPath();
    ctx.moveTo(55, 565);
    ctx.lineTo(745, 565);
    ctx.strokeStyle = '#F1F5F9';
    ctx.stroke();
  }

  // Row 3: Total da Cobrança
  const totalY = hasPrevious ? 595 : 560;
  ctx.textAlign = 'left';
  ctx.font = '700 14px -apple-system, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText('Total da Cobrança Gerada', 55, totalY);
  ctx.textAlign = 'right';
  ctx.font = '800 16px -apple-system, sans-serif';
  ctx.fillText(formatCurrency(charge.totalAmount), 745, totalY);

  ctx.beginPath();
  ctx.moveTo(55, totalY + 15);
  ctx.lineTo(745, totalY + 15);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Row 4: Highlight Box - VALOR RECEBIDO NESTE RECIBO
  const paidBoxY = hasPrevious ? 625 : 590;
  drawRoundRect(ctx, 50, paidBoxY, 700, 60, 10, '#ECFDF5', '#10B981', 2);

  // Check circle inside paid box
  ctx.beginPath();
  ctx.arc(85, paidBoxY + 30, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#10B981';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(80, paidBoxY + 30);
  ctx.lineTo(84, paidBoxY + 34);
  ctx.lineTo(91, paidBoxY + 26);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const methodText = PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod;
  ctx.textAlign = 'left';
  ctx.font = '900 13px -apple-system, sans-serif';
  ctx.fillStyle = '#065F46';
  ctx.fillText('VALOR EFETIVAMENTE PAGO NESTE RECIBO', 115, paidBoxY + 28);
  ctx.font = '600 11px -apple-system, sans-serif';
  ctx.fillStyle = '#047857';
  ctx.fillText(`Forma: ${methodText} • Autenticado digitalmente`, 115, paidBoxY + 46);

  ctx.textAlign = 'right';
  ctx.font = '900 24px -apple-system, sans-serif';
  ctx.fillStyle = '#047857';
  ctx.fillText(formatCurrency(payment.amount), 730, paidBoxY + 38);

  // Row 5: Saldo restante warning
  const warnY = hasPrevious ? 695 : 660;
  if (hasRemaining) {
    drawRoundRect(ctx, 50, warnY, 700, 55, 8, '#FFFBEB', '#F59E0B', 1.5);
    ctx.textAlign = 'left';
    ctx.font = '800 13px -apple-system, sans-serif';
    ctx.fillStyle = '#92400E';
    ctx.fillText('SALDO DEVEDOR RESTANTE EM ABERTO:', 70, warnY + 24);
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.fillStyle = '#B45309';
    ctx.fillText('Diferença residual vinculada à fatura e sujeita às condições de pagamento acordadas.', 70, warnY + 41);

    ctx.textAlign = 'right';
    ctx.font = '900 18px -apple-system, sans-serif';
    ctx.fillText(remainingVal, 730, warnY + 33);
  } else {
    drawRoundRect(ctx, 50, warnY, 700, 40, 8, '#F8FAFC', '#E2E8F0', 1);
    ctx.textAlign = 'left';
    ctx.font = '700 12px -apple-system, sans-serif';
    ctx.fillStyle = '#059669';
    ctx.fillText('✓ Saldo Devedor Restante: R$ 0,00 (Nenhuma pendência financeira para este contrato).', 70, warnY + 25);
  }

  // 6. Payment Transaction Details & Security Seal
  drawRoundRect(ctx, 35, 805, 730, 150, 12, '#F8FAFC', '#E2E8F0', 1);

  ctx.textAlign = 'left';
  ctx.font = '800 12px -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('INFORMAÇÕES DA TRANSAÇÃO & AUTENTICAÇÃO', 55, 835);

  ctx.font = '500 13px -apple-system, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Forma de Liquidação: ', 55, 865);
  ctx.font = '800 13px -apple-system, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(methodText, 205, 865);

  ctx.font = '500 13px -apple-system, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Operador / Recebedor: ', 55, 890);
  const operatorName = payment.operatorName || 'Operador Autorizado';
  ctx.font = '700 13px -apple-system, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(operatorName, 215, 890);

  ctx.font = '500 13px -apple-system, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Data e Hora do Pagamento: ', 55, 915);
  ctx.font = '700 13px -apple-system, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(dateFormatted, 230, 915);

  ctx.font = '500 12px -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('Vencimento Original da Fatura: ', 55, 938);
  ctx.font = '700 12px -apple-system, sans-serif';
  ctx.fillStyle = '#2563EB';
  ctx.fillText(formatDate(charge.dueDate), 235, 938);

  // Digital Seal
  const sealCenterX = 645;
  const sealCenterY = 870;
  ctx.beginPath();
  ctx.arc(sealCenterX, sealCenterY, 36, 0, Math.PI * 2);
  ctx.fillStyle = '#EFF6FF';
  ctx.fill();
  ctx.strokeStyle = '#3B82F6';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(sealCenterX, sealCenterY, 30, 0, Math.PI * 2);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(sealCenterX - 12, sealCenterY);
  ctx.lineTo(sealCenterX - 3, sealCenterY + 9);
  ctx.lineTo(sealCenterX + 14, sealCenterY - 8);
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = '900 9px -apple-system, sans-serif';
  ctx.fillStyle = '#1E3A8A';
  ctx.fillText('AUTENTICIDADE DIGITAL', sealCenterX, sealCenterY + 50);
  ctx.font = '600 8px -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('AUTOTEC SISTEMAS', sealCenterX, sealCenterY + 63);

  // 7. Footer
  drawRoundRect(ctx, 35, 970, 730, 120, 12, '#0F172A');

  const footerMsg = company?.receiptFooterMessage || 'Agradecemos a confiança e preferência pelos serviços AUTOTEC!';
  ctx.textAlign = 'center';
  ctx.font = '800 15px -apple-system, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(footerMsg, 400, 1010);

  ctx.font = '500 11px -apple-system, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('AUTOTEC RASTREAMENTO VEICULAR • Gestão Financeira Especializada', 400, 1035);

  ctx.font = '400 10px -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('Documento emitido eletronicamente em formato de alta definição • Válido como comprovante oficial de pagamento.', 400, 1055);

  ctx.beginPath();
  ctx.moveTo(200, 1068);
  ctx.lineTo(600, 1068);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '500 9px -apple-system, sans-serif';
  ctx.fillStyle = '#F59E0B';
  const canvasContact = [whatsapp ? `Suporte e Atendimento: ${whatsapp}` : '', effectiveCompany?.email || company?.email || 'contato@autotec.com.br'].filter(Boolean).join(' • ');
  ctx.fillText(canvasContact, 400, 1082);

  // 8. Convert to PNG Blob
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (pngBlob) => {
          if (pngBlob) {
            resolve(pngBlob);
          } else {
            // Data URL fallback if canvas.toBlob returns null
            try {
              const dataUrl = canvas.toDataURL('image/png', 0.98);
              const binStr = atob(dataUrl.split(',')[1]);
              const len = binStr.length;
              const arr = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                arr[i] = binStr.charCodeAt(i);
              }
              resolve(new Blob([arr], { type: 'image/png' }));
            } catch (fallbackErr) {
              reject(fallbackErr);
            }
          }
        },
        'image/png',
        0.98
      );
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Extracts a fallback receipt context from an SVG string if no context was passed.
 */
function extractContextFromSvg(svgString: string): ReceiptContext {
  const getMatch = (regex: RegExp, fallback: string): string => {
    const m = svgString.match(regex);
    return m && m[1] ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : fallback;
  };

  const clientName = getMatch(/DADOS DO CLIENTE[^>]*>[\s\S]*?<text[^>]*>([^<]+)<\/text>/i, 'Cliente');
  const receiptNumber = getMatch(/RECIBO OFICIAL<\/text>[\s\S]*?<text[^>]*>([^<]+)<\/text>/i, `REC-${Date.now()}`);
  const vehiclePlate = getMatch(/<text[^>]*letter-spacing="2"[^>]*>([^<]+)<\/text>/i, 'ABC1D23');
  const paidMatch = getMatch(/VALOR EFETIVAMENTE PAGO NESTE RECIBO[\s\S]*?font-size="24"[^>]*>([^<]+)<\/text>/i, 'R$ 0,00');
  const numericPaid = parseFloat(paidMatch.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;

  const remainingMatch = getMatch(/SALDO DEVEDOR RESTANTE EM ABERTO:[\s\S]*?font-size="19"[^>]*>([^<]+)<\/text>/i, 'R$ 0,00');
  const numericRemaining = parseFloat(remainingMatch.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;

  const payment: Payment = {
    id: 'pay_extracted',
    chargeId: 'chg_extracted',
    clientId: 'cli_extracted',
    clientName,
    vehicleId: 'veh_extracted',
    vehiclePlate,
    amount: numericPaid,
    remainingAfterPayment: numericRemaining,
    paymentMethod: 'pix',
    paymentDate: new Date().toISOString(),
    receiptNumber,
    notes: '',
    operatorId: 'op_extracted',
    operatorName: 'Operador Autorizado',
    createdAt: new Date().toISOString(),
  };

  const charge: Charge = {
    id: 'chg_extracted',
    clientId: 'cli_extracted',
    clientName,
    vehicleId: 'veh_extracted',
    vehiclePlate,
    vehicleModel: 'Veículo Contratado',
    referenceMonth: 'Mensalidade',
    originalMonthlyValue: numericPaid + numericRemaining,
    previousBalanceCarried: 0,
    discount: 0,
    addition: 0,
    totalAmount: numericPaid + numericRemaining,
    paidAmount: numericPaid,
    remainingBalance: numericRemaining,
    dueDate: new Date().toISOString().split('T')[0],
    status: numericRemaining > 0 ? 'parcial' : 'pago',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { payment, charge };
}

/**
 * Converts an SVG receipt into an ultra high-definition PNG Blob.
 * Uses a robust dual-path architecture:
 * 1. Primary path: Sanitized SVG decoding via HTML Image element.
 * 2. Fail-safe fallback: If browser security sandbox or isolated image context rejects
 *    the SVG image, it seamlessly renders the exact receipt via HTML5 Canvas 2D API.
 */
export async function svgToPngBlob(
  svgString: string,
  scale = 2,
  context?: ReceiptContext
): Promise<Blob> {
  const resolvedContext = context || extractContextFromSvg(svgString);

  // Attempt SVG image rasterization with a quick fallback on any decode failure or timeout
  const trySvgImageRasterization = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        // Strip any XML prolog which breaks SVG in new Image()
        let cleanSvg = svgString.replace(/<\?xml[\s\S]*?\?>/gi, '').trim();

        if (!cleanSvg.includes('xmlns=')) {
          cleanSvg = cleanSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if (!cleanSvg.includes('xmlns:xlink=')) {
          cleanSvg = cleanSvg.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        }

        const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`;
        const img = new Image();

        let timer: any = null;

        const cleanup = () => {
          if (timer) clearTimeout(timer);
          img.onload = null;
          img.onerror = null;
        };

        img.onload = () => {
          cleanup();
          try {
            const width = 800;
            const height = 1150;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas context not available'));
              return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
              (pngBlob) => {
                if (pngBlob) {
                  resolve(pngBlob);
                } else {
                  reject(new Error('Canvas toBlob failed'));
                }
              },
              'image/png',
              0.98
            );
          } catch (err) {
            reject(err);
          }
        };

        img.onerror = (e) => {
          cleanup();
          reject(new Error('SVG Image loader failed'));
        };

        // Safety timeout of 1.5 seconds before triggering direct Canvas fallback
        timer = setTimeout(() => {
          cleanup();
          reject(new Error('SVG Image loader timed out'));
        }, 1500);

        img.src = dataUri;
      } catch (err) {
        reject(err);
      }
    });
  };

  try {
    return await trySvgImageRasterization();
  } catch (primaryErr) {
    // Primary SVG loader hit isolated sandbox or subresource limit; use direct Canvas 2D renderer
    return await renderReceiptDirectToCanvas(resolvedContext, scale);
  }
}

/**
 * Copies the real visual PNG image of the receipt to the system clipboard using ClipboardItem.
 * Never copies raw XML or code characters. If clipboard API is blocked or unsupported,
 * gracefully downloads the PNG file directly as an alternative.
 */
export async function copyReceiptImageToClipboard(
  svgString: string,
  fileName = 'recibo-AUTOTEC.png',
  context?: ReceiptContext
): Promise<{ success: boolean; fallbackTriggered?: boolean; message: string }> {
  try {
    const pngBlob = await svgToPngBlob(svgString, 2, context);

    // Check if ClipboardItem & navigator.clipboard.write are available
    if (
      typeof ClipboardItem !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === 'function'
    ) {
      try {
        const item = new ClipboardItem({ 'image/png': pngBlob });
        await navigator.clipboard.write([item]);
        return {
          success: true,
          message: 'Imagem visual do recibo copiada! Cole diretamente no WhatsApp ou em outro aplicativo (Ctrl+V).',
        };
      } catch (clipErr) {
        // Browser rejected clipboard write (e.g. lack of focus or permission in iframe)
        let cleanName = fileName.replace(/[^a-zA-Z0-9_\-]/g, '_');
        if (!cleanName.toLowerCase().endsWith('.png')) cleanName += '.png';
        downloadBlob(pngBlob, cleanName);
        return {
          success: false,
          fallbackTriggered: true,
          message: 'Acesso à área de transferência restrito pelo navegador. O recibo em PNG foi baixado automaticamente no seu dispositivo!',
        };
      }
    } else {
      // Browser does not support ClipboardItem (common in mobile WebViews / Safari without permission)
      let cleanName = fileName.replace(/[^a-zA-Z0-9_\-]/g, '_');
      if (!cleanName.toLowerCase().endsWith('.png')) cleanName += '.png';
      downloadBlob(pngBlob, cleanName);
      return {
        success: false,
        fallbackTriggered: true,
        message: 'Área de transferência de imagem não suportada neste navegador. O recibo em PNG foi baixado automaticamente no seu dispositivo!',
      };
    }
  } catch (err: any) {
    // If all else fails, attempt direct canvas rendering for download
    try {
      const fallbackBlob = await renderReceiptDirectToCanvas(
        context || extractContextFromSvg(svgString),
        2
      );
      let cleanName = fileName.replace(/[^a-zA-Z0-9_\-]/g, '_');
      if (!cleanName.toLowerCase().endsWith('.png')) cleanName += '.png';
      downloadBlob(fallbackBlob, cleanName);
      return {
        success: false,
        fallbackTriggered: true,
        message: 'Recibo gerado em PNG de alta resolução e baixado no seu dispositivo!',
      };
    } catch (fallbackErr: any) {
      return {
        success: false,
        fallbackTriggered: false,
        message: 'Falha ao processar o recibo: ' + (fallbackErr?.message || 'erro desconhecido'),
      };
    }
  }
}

/**
 * Downloads the original vector SVG receipt.
 */
export function downloadReceiptSvg(svgContent: string, fileName?: string): void {
  let sanitizedName = (fileName || 'recibo-AUTOTEC')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_');

  if (!sanitizedName.toLowerCase().endsWith('.svg')) {
    sanitizedName += '.svg';
  }

  // Prepend XML declaration for valid standalone vector file
  const fullSvg = svgContent.startsWith('<?xml')
    ? svgContent
    : `<?xml version="1.0" encoding="UTF-8"?>\n${svgContent}`;

  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, sanitizedName);
}

/**
 * Downloads the rasterized, high-resolution PNG receipt (ideal for WhatsApp & mobile sharing).
 */
export async function downloadReceiptPng(
  svgContent: string,
  fileName?: string,
  context?: ReceiptContext
): Promise<void> {
  let sanitizedName = (fileName || 'recibo-AUTOTEC')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_');

  if (!sanitizedName.toLowerCase().endsWith('.png')) {
    sanitizedName += '.png';
  }

  const pngBlob = await svgToPngBlob(svgContent, 2, context);
  downloadBlob(pngBlob, sanitizedName);
}

/**
 * Native Web Share API helper for vector SVG files.
 */
export async function shareReceipt(
  svgContent: string,
  title: string
): Promise<boolean> {
  const sanitizedTitle = (title || 'recibo_AUTOTEC').replace(/[^a-zA-Z0-9_\-]/g, '_');

  try {
    const fullSvg = svgContent.startsWith('<?xml')
      ? svgContent
      : `<?xml version="1.0" encoding="UTF-8"?>\n${svgContent}`;
    const svgBlob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
    const svgFile = new File([svgBlob], `${sanitizedTitle}.svg`, { type: 'image/svg+xml' });

    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [svgFile] })) {
      await navigator.share({
        files: [svgFile],
        title: title,
      });
      return true;
    }
  } catch {
    // Unsupported or cancelled
  }

  return false;
}
