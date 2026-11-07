import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Payment,
  Charge,
  Client,
  Vehicle,
  CompanySettings,
  TechnicalServiceOrder,
  CompanyExpense,
  Technician,
  TechnicianPayment,
} from '../types';
import { formatCurrency, formatDate, formatDateTime } from './calculations';
import { AUTOTEC_LOGO_ORIGINAL_DATA_URI } from '../assets/autotecLogos';

// Corporate Palette
const COLOR_NAVY = [48, 51, 79]; // #30334F
const COLOR_ORANGE = [242, 140, 27]; // #F28C1B
const COLOR_GRAY_BG = [243, 244, 242]; // #F3F4F2
const COLOR_TEXT = [30, 41, 59]; // Slate 800
const COLOR_MUTED = [100, 116, 139]; // Slate 500

/**
 * Draws standard AUTOTEC corporate header on a PDF page
 */
function drawHeader(
  doc: jsPDF,
  title: string,
  company: CompanySettings,
  subtitle?: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top Accent Bar (Navy & Orange)
  doc.setFillColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.rect(0, 0, pageWidth, 5, 'F');
  doc.setFillColor(COLOR_ORANGE[0], COLOR_ORANGE[1], COLOR_ORANGE[2]);
  doc.rect(0, 5, pageWidth, 2, 'F');

  // Logo
  try {
    doc.addImage(AUTOTEC_LOGO_ORIGINAL_DATA_URI, 'PNG', 14, 11, 42, 22);
  } catch (e) {
    // If image fails, fallback to styled text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
    doc.text('AUTOTEC', 14, 22);
  }

  // Company Details (Right side of header)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);

  const companyName = company.companyName || 'AUTOTEC RASTREAMENTO VEICULAR';
  const cnpj = company.cnpj ? `CNPJ: ${company.cnpj}` : '';
  const phone = company.whatsapp || company.phone ? `Tel/WhatsApp: ${company.whatsapp || company.phone}` : '';
  const email = company.email ? `E-mail: ${company.email}` : '';
  const address = company.address ? `${company.address}${company.city ? ` - ${company.city}/${company.state || ''}` : ''}` : '';

  const headerLines = [companyName, [cnpj, phone].filter(Boolean).join(' • '), address, email].filter(Boolean);

  let y = 14;
  headerLines.forEach((line, idx) => {
    doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal');
    doc.setFontSize(idx === 0 ? 9 : 7.5);
    doc.setTextColor(idx === 0 ? COLOR_NAVY[0] : COLOR_MUTED[0], idx === 0 ? COLOR_NAVY[1] : COLOR_MUTED[1], idx === 0 ? COLOR_NAVY[2] : COLOR_MUTED[2]);
    doc.text(line, pageWidth - 14, y, { align: 'right' });
    y += 4;
  });

  // Divider Line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 37, pageWidth - 14, 37);

  // Document Title Banner
  doc.setFillColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.roundedRect(14, 40, pageWidth - 28, 12, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), 18, 48);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(242, 140, 27);
    doc.text(subtitle, pageWidth - 18, 48, { align: 'right' });
  }

  return 56; // Next Y coordinate
}

/**
 * Draws standard page footer with page number and corporate message
 */
function drawFooter(doc: jsPDF, company: CompanySettings): void {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    const footerMsg = company.receiptFooterMessage || 'Agradecemos a confiança e preferência pelos serviços AUTOTEC!';
    doc.text(`"${footerMsg}"`, 14, pageHeight - 10);

    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }
}

// ============================================================================
// 1. RECIBO DE MENSALIDADE EM PDF (A4)
// ============================================================================
export function generateMonthlyPaymentReceiptPdf(
  payment: Payment,
  charge: Charge,
  client?: Client,
  vehicle?: Vehicle,
  company?: CompanySettings
): Blob {
  const effectiveCompany: CompanySettings = {
    id: 'default',
    companyName: 'AUTOTEC RASTREAMENTO VEICULAR',
    tradeName: 'AUTOTEC',
    cnpj: '38.450.812/0001-94',
    phone: '(11) 98765-4321',
    whatsapp: '(11) 98765-4321',
    address: 'Atendimento e Suporte em todo o território nacional',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01310-100',
    pixKey: '38.450.812/0001-94',
    pixKeyType: 'CNPJ',
    receiptFooterMessage: 'Agradecemos a confiança e preferência pelos serviços AUTOTEC!',
    ...(company || {}),
    ...(payment.companySnapshot || {}),
  };

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const receiptNum = payment.receiptNumber || `REC-${Date.now()}`;
  let startY = drawHeader(doc, 'Recibo Oficial de Pagamento de Mensalidade', effectiveCompany, `Nº ${receiptNum}`);

  // Resolve Real Data (Eliminate empty or undefined values)
  const clientName = client?.name || payment.clientName || charge.clientName || 'Cliente';
  const clientDoc = client?.document || 'Não informado';
  const clientPhone = client?.whatsapp || client?.phone || 'Não informado';

  const plate = vehicle?.plate || payment.vehiclePlate || charge.vehiclePlate || 'Não informada';
  const vehicleDesc = vehicle
    ? `${vehicle.brand} ${vehicle.model} (${vehicle.color || 'Cor Padrão'})`
    : charge.vehicleModel || 'Veículo Cadastrado';
  const planName = vehicle?.planDescription || 'Plano de Rastreamento Veicular';
  const refMonth = charge.referenceMonth || 'Mensalidade Vigente';

  const originalVal = Number(charge.originalMonthlyValue ?? charge.totalAmount ?? payment.amount ?? 0);
  const prevBalanceVal = Number(charge.previousBalanceCarried || 0);
  const totalChargeVal = Number(charge.totalAmount || (originalVal + prevBalanceVal));
  const paidVal = Number(payment.amount || 0);
  const remainingVal = Number(payment.remainingAfterPayment || Math.max(0, totalChargeVal - paidVal));
  const isPaid = remainingVal <= 0.009;

  // Box: Client and Vehicle Information
  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(14, startY, pageWidth - 28, 36, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, pageWidth - 28, 36, 2, 2, 'S');

  // Left: Client
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(COLOR_ORANGE[0], COLOR_ORANGE[1], COLOR_ORANGE[2]);
  doc.text('DADOS DO CLIENTE / PAGADOR', 18, startY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(clientName, 18, startY + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`CPF / CNPJ: ${clientDoc}`, 18, startY + 19);
  doc.text(`Telefone / WhatsApp: ${clientPhone}`, 18, startY + 24);
  doc.text(`Data de Emissão: ${formatDateTime(payment.paymentDate || payment.createdAt)}`, 18, startY + 29);

  // Vertical divider inside box
  doc.line(pageWidth / 2, startY + 4, pageWidth / 2, startY + 32);

  // Right: Vehicle
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(COLOR_ORANGE[0], COLOR_ORANGE[1], COLOR_ORANGE[2]);
  doc.text('DADOS DO VEÍCULO', pageWidth / 2 + 6, startY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(`Placa: ${plate.toUpperCase()}`, pageWidth / 2 + 6, startY + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`Modelo: ${vehicleDesc}`, pageWidth / 2 + 6, startY + 19);
  doc.text(`Plano: ${planName}`, pageWidth / 2 + 6, startY + 24);
  doc.text(`Mês de Referência: ${refMonth}`, pageWidth / 2 + 6, startY + 29);

  startY += 42;

  // Status Badge Banner
  if (isPaid) {
    doc.setFillColor(220, 252, 231); // Light emerald
    doc.roundedRect(14, startY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(22, 101, 52); // Emerald 800
    doc.text('✓ STATUS DA COBRANÇA: TOTALMENTE PAGA E QUITADA', 18, startY + 6.5);
  } else {
    doc.setFillColor(254, 243, 199); // Light amber
    doc.roundedRect(14, startY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(146, 64, 14); // Amber 800
    doc.text(`⚠ STATUS DA COBRANÇA: PAGAMENTO PARCIAL (SALDO RESTANTE: ${formatCurrency(remainingVal)})`, 18, startY + 6.5);
  }

  startY += 15;

  // Table: Breakdown of Values
  const tableRows = [
    ['Valor Original da Mensalidade Contratada', formatCurrency(originalVal)],
  ];
  if (prevBalanceVal > 0) {
    tableRows.push(['(+) Saldo Devedor Anterior Transferido', formatCurrency(prevBalanceVal)]);
  }
  tableRows.push(['Total da Cobrança Gerada', formatCurrency(totalChargeVal)]);
  tableRows.push(['Valor Efetivamente Recebido Neste Recibo', formatCurrency(paidVal)]);
  tableRows.push(['Saldo Devedor Restante em Aberto', formatCurrency(remainingVal)]);

  autoTable(doc, {
    startY,
    head: [['DISCRIMINAÇÃO DOS VALORES DA MENSALIDADE', 'VALOR (R$)']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Highlight the paid amount row
      if (data.row.index === (prevBalanceVal > 0 ? 3 : 2)) {
        data.cell.styles.fillColor = [236, 253, 245];
        data.cell.styles.textColor = [4, 120, 87];
        data.cell.styles.fontStyle = 'bold';
      }
      // Highlight remaining balance if positive
      if (data.row.index === (prevBalanceVal > 0 ? 4 : 3) && remainingVal > 0) {
        data.cell.styles.fillColor = [255, 251, 235];
        data.cell.styles.textColor = [180, 83, 9];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // Payment Details Card
  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(14, finalY, pageWidth - 28, 26, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, finalY, pageWidth - 28, 26, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('INFORMAÇÕES DA TRANSAÇÃO & AUTENTICAÇÃO', 18, finalY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`Forma de Liquidação: ${payment.paymentMethod ? payment.paymentMethod.toUpperCase() : 'PIX'}`, 18, finalY + 12);
  doc.text(`Operador / Recebedor: ${payment.operatorName || 'Operador Autorizado'}`, 18, finalY + 17);
  doc.text(`Data e Hora do Pagamento: ${formatDateTime(payment.paymentDate || payment.createdAt)}`, 18, finalY + 22);

  if (charge.dueDate) {
    doc.text(`Vencimento Original: ${formatDate(charge.dueDate)}`, pageWidth / 2 + 6, finalY + 12);
  }
  if (effectiveCompany.pixKey) {
    doc.text(`Chave PIX AUTOTEC: ${effectiveCompany.pixKey}`, pageWidth / 2 + 6, finalY + 17);
  }

  drawFooter(doc, effectiveCompany);

  return doc.output('blob');
}

// ============================================================================
// 2. RECIBO DE SERVIÇOS TÉCNICOS EM PDF (A4)
// ============================================================================
export function generateTechnicalServiceReceiptPdf(
  order: TechnicalServiceOrder,
  company?: CompanySettings
): Blob {
  const effectiveCompany: CompanySettings = {
    id: 'default',
    companyName: 'AUTOTEC RASTREAMENTO VEICULAR',
    tradeName: 'AUTOTEC',
    cnpj: '38.450.812/0001-94',
    phone: '(11) 98765-4321',
    whatsapp: '(11) 98765-4321',
    address: 'Atendimento e Suporte em todo o território nacional',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01310-100',
    pixKey: '38.450.812/0001-94',
    pixKeyType: 'CNPJ',
    receiptFooterMessage: 'Agradecemos a confiança e preferência pelos serviços AUTOTEC!',
    ...(company || {}),
  };

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const orderNum = order.orderNumber || `OS-${Date.now()}`;
  const receiptNum = order.receiptNumber || `REC-ST-${Date.now()}`;
  let startY = drawHeader(doc, 'Recibo de Prestação de Serviços Técnicos', effectiveCompany, `O.S. ${orderNum}`);

  // Client & Vehicle Card
  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(14, startY, pageWidth - 28, 30, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, pageWidth - 28, 30, 2, 2, 'S');

  // Client
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(COLOR_ORANGE[0], COLOR_ORANGE[1], COLOR_ORANGE[2]);
  doc.text('DADOS DO CLIENTE', 18, startY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(order.clientName || 'Cliente', 18, startY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`Telefone: ${order.clientPhone || 'Não informado'}`, 18, startY + 18);
  doc.text(`Técnico Responsável: ${order.technicianName || 'Técnico Autorizado AUTOTEC'}`, 18, startY + 24);

  // Vehicle
  doc.line(pageWidth / 2, startY + 4, pageWidth / 2, startY + 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(COLOR_ORANGE[0], COLOR_ORANGE[1], COLOR_ORANGE[2]);
  doc.text('DADOS DO VEÍCULO', pageWidth / 2 + 6, startY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(`Placa: ${(order.vehiclePlate || 'Não informada').toUpperCase()}`, pageWidth / 2 + 6, startY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`Modelo: ${order.vehicleModel || 'Veículo'} (${order.vehicleColor || 'Cor Padrão'})`, pageWidth / 2 + 6, startY + 18);
  doc.text(`Data de Execução: ${formatDate(order.executionDate || order.createdAt)}`, pageWidth / 2 + 6, startY + 24);

  startY += 36;

  // Table of Service Items
  const itemsRows = (order.items || []).map((item, idx) => [
    String(idx + 1),
    item.category || 'Serviço',
    item.description || 'Execução de serviço técnico especializado',
    formatCurrency(Number(item.value || 0)),
  ]);

  autoTable(doc, {
    startY,
    head: [['#', 'CATEGORIA', 'DESCRIÇÃO DO SERVIÇO', 'VALOR (R$)']],
    body: itemsRows,
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 35, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
    },
  });

  const tableBottomY = (doc as any).lastAutoTable.finalY + 6;

  // Financial Summary Card
  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const totalAmount = Number(order.totalAmount || (subtotal - discount));
  const paidAmount = Number(order.paidAmount || 0);
  const remainingBalance = Number(order.remainingBalance || Math.max(0, totalAmount - paidAmount));

  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(pageWidth - 100, tableBottomY, 86, 36, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(pageWidth - 100, tableBottomY, 86, 36, 2, 2, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text('Subtotal dos Serviços:', pageWidth - 96, tableBottomY + 7);
  doc.text(formatCurrency(subtotal), pageWidth - 18, tableBottomY + 7, { align: 'right' });

  doc.text('Desconto Aplicado:', pageWidth - 96, tableBottomY + 13);
  doc.setTextColor(220, 38, 38);
  doc.text(`- ${formatCurrency(discount)}`, pageWidth - 18, tableBottomY + 13, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(pageWidth - 96, tableBottomY + 16, pageWidth - 18, tableBottomY + 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('VALOR TOTAL DA O.S.:', pageWidth - 96, tableBottomY + 22);
  doc.text(formatCurrency(totalAmount), pageWidth - 18, tableBottomY + 22, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setTextColor(22, 101, 52); // green
  doc.text('Valor Pago:', pageWidth - 96, tableBottomY + 28);
  doc.text(formatCurrency(paidAmount), pageWidth - 18, tableBottomY + 28, { align: 'right' });

  doc.setTextColor(remainingBalance > 0 ? 180 : 100, remainingBalance > 0 ? 83 : 116, remainingBalance > 0 ? 9 : 139);
  doc.text('Saldo Restante:', pageWidth - 96, tableBottomY + 33);
  doc.text(formatCurrency(remainingBalance), pageWidth - 18, tableBottomY + 33, { align: 'right' });

  // Payment details (Left)
  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(14, tableBottomY, pageWidth - 120, 36, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, tableBottomY, pageWidth - 120, 36, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('DETALHES DO PAGAMENTO', 18, tableBottomY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`Forma: ${order.paymentMethod ? order.paymentMethod.toUpperCase() : 'PIX'}`, 18, tableBottomY + 14);
  doc.text(`Status: ${(order.status || 'pago').toUpperCase()}`, 18, tableBottomY + 20);
  if (order.notes) {
    doc.text(`Obs: ${order.notes}`, 18, tableBottomY + 26, { maxWidth: pageWidth - 130 });
  }

  drawFooter(doc, effectiveCompany);

  return doc.output('blob');
}

// ============================================================================
// 3. COMPROVANTE DE DESPESA DA EMPRESA EM PDF (A4)
// ============================================================================
export function generateCompanyExpenseVoucherPdf(
  expense: CompanyExpense,
  company?: CompanySettings
): Blob {
  const effectiveCompany: CompanySettings = {
    id: 'default',
    companyName: 'AUTOTEC RASTREAMENTO VEICULAR',
    tradeName: 'AUTOTEC',
    cnpj: '38.450.812/0001-94',
    phone: '(11) 98765-4321',
    whatsapp: '(11) 98765-4321',
    address: 'Atendimento e Suporte em todo o território nacional',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01310-100',
    pixKey: '38.450.812/0001-94',
    pixKeyType: 'CNPJ',
    receiptFooterMessage: 'Comprovante interno de despesa emitido para fins contábeis e de controle financeiro.',
    ...(company || {}),
  };

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const expNum = expense.expenseNumber || `DESP-${Date.now()}`;
  const vouchNum = expense.voucherNumber || `COMP-${Date.now()}`;
  let startY = drawHeader(doc, 'Comprovante de Despesa', effectiveCompany, `Nº ${vouchNum}`);

  // Supplier & Date Card
  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(14, startY, pageWidth - 28, 24, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, pageWidth - 28, 24, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(COLOR_ORANGE[0], COLOR_ORANGE[1], COLOR_ORANGE[2]);
  doc.text('FORNECEDOR / BENEFICIÁRIO', 18, startY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(expense.supplier || 'Fornecedor', 18, startY + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`Data da Compra: ${formatDate(expense.date || expense.createdAt)}`, 18, startY + 19);

  doc.text(`Nº da Despesa: ${expNum}`, pageWidth / 2 + 6, startY + 13);
  doc.text(`Forma de Pagamento: ${(expense.paymentMethod || 'PIX').replace('_', ' ').toUpperCase()}`, pageWidth / 2 + 6, startY + 19);

  startY += 30;

  // Items Table
  const itemsRows = (expense.items || []).map((item, idx) => [
    String(idx + 1),
    item.category || 'Gasto',
    item.description || 'Material / Despesa',
    String(item.quantity || 1),
    formatCurrency(Number(item.unitPrice || 0)),
    formatCurrency(Number(item.subtotal || 0)),
  ]);

  autoTable(doc, {
    startY,
    head: [['#', 'CATEGORIA', 'DESCRIÇÃO DO ITEM / MATERIAL', 'QTD', 'UNITÁRIO (R$)', 'SUBTOTAL (R$)']],
    body: itemsRows,
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 35, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
    },
  });

  const tableBottomY = (doc as any).lastAutoTable.finalY + 6;

  // Financial Summary
  const subtotal = Number(expense.subtotal || 0);
  const discount = Number(expense.discount || 0);
  const totalAmount = Number(expense.totalAmount || (subtotal - discount));
  const paidAmount = Number(expense.paidAmount || 0);
  const remainingBalance = Number(expense.remainingBalance || Math.max(0, totalAmount - paidAmount));

  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(pageWidth - 100, tableBottomY, 86, 36, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(pageWidth - 100, tableBottomY, 86, 36, 2, 2, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text('Subtotal dos Itens:', pageWidth - 96, tableBottomY + 7);
  doc.text(formatCurrency(subtotal), pageWidth - 18, tableBottomY + 7, { align: 'right' });

  doc.text('Desconto / Abatimento:', pageWidth - 96, tableBottomY + 13);
  doc.setTextColor(22, 101, 52);
  doc.text(`- ${formatCurrency(discount)}`, pageWidth - 18, tableBottomY + 13, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(pageWidth - 96, tableBottomY + 16, pageWidth - 18, tableBottomY + 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(220, 38, 38); // Red
  doc.text('TOTAL DA DESPESA:', pageWidth - 96, tableBottomY + 22);
  doc.text(formatCurrency(totalAmount), pageWidth - 18, tableBottomY + 22, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setTextColor(22, 101, 52);
  doc.text('Valor Quitado:', pageWidth - 96, tableBottomY + 28);
  doc.text(formatCurrency(paidAmount), pageWidth - 18, tableBottomY + 28, { align: 'right' });

  doc.setTextColor(remainingBalance > 0 ? 220 : 100, remainingBalance > 0 ? 38 : 116, remainingBalance > 0 ? 38 : 139);
  doc.text('Saldo a Quitar:', pageWidth - 96, tableBottomY + 33);
  doc.text(formatCurrency(remainingBalance), pageWidth - 18, tableBottomY + 33, { align: 'right' });

  // Notes Box (Left)
  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(14, tableBottomY, pageWidth - 120, 36, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, tableBottomY, pageWidth - 120, 36, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('INFORMAÇÕES DE QUITAÇÃO', 18, tableBottomY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`Status: ${(expense.status || 'pago').toUpperCase()}`, 18, tableBottomY + 14);
  if (expense.notes) {
    doc.text(`Observações: ${expense.notes}`, 18, tableBottomY + 20, { maxWidth: pageWidth - 130 });
  }

  drawFooter(doc, effectiveCompany);

  return doc.output('blob');
}

// ============================================================================
// 4. RELATÓRIOS INDIVIDUAIS ANALÍTICOS EM PDF (A4)
// ============================================================================
export interface ReportFilterOptions {
  periodLabel: string;
  startDate?: string;
  endDate?: string;
  clientName?: string;
  vehiclePlate?: string;
  category?: string;
  supplier?: string;
  status?: string;
}

/**
 * 4.1 Relatório de Serviços Técnicos em PDF
 */
export function generateTechnicalServicesReportPdf(
  services: TechnicalServiceOrder[],
  company: CompanySettings,
  filters: ReportFilterOptions
): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let startY = drawHeader(doc, 'Relatório Analítico de Serviços Técnicos', company, `Período: ${filters.periodLabel}`);

  // Filter Info Banner
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(
    `Gerado em: ${new Date().toLocaleString('pt-BR')} • Total de Ordens: ${services.length}${
      filters.status ? ` • Status: ${filters.status.toUpperCase()}` : ''
    }`,
    14,
    startY
  );

  startY += 4;

  const rows = services.map((s) => [
    s.orderNumber,
    formatDate(s.executionDate || s.createdAt),
    s.clientName,
    s.vehiclePlate,
    s.technicianName || 'Não informado',
    s.items.map((i) => i.category).join(', '),
    formatCurrency(s.totalAmount),
    formatCurrency(s.discount),
    formatCurrency(s.paidAmount),
    formatCurrency(s.remainingBalance),
    s.paymentMethod.toUpperCase(),
    s.status.toUpperCase(),
  ]);

  const totalBilled = services.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  const totalPaid = services.reduce((acc, s) => acc + (s.paidAmount || 0), 0);
  const totalRemaining = services.reduce((acc, s) => acc + (s.remainingBalance || 0), 0);

  autoTable(doc, {
    startY,
    head: [['O.S.', 'DATA', 'CLIENTE', 'PLACA', 'TÉCNICO', 'CATEGORIAS', 'TOTAL (R$)', 'DESC.', 'PAGO (R$)', 'SALDO (R$)', 'FORMA', 'STATUS']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      4: { fontStyle: 'normal' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right' },
      8: { halign: 'right', textColor: [22, 101, 52] },
      9: { halign: 'right', textColor: [180, 83, 9] },
      11: { halign: 'center', fontStyle: 'bold' },
    },
    foot: [
      ['TOTAIS:', '', '', '', '', `${services.length} ordens`, formatCurrency(totalBilled), '', formatCurrency(totalPaid), formatCurrency(totalRemaining), '', ''],
    ],
    footStyles: {
      fillColor: [243, 244, 242],
      textColor: [48, 51, 79],
      fontStyle: 'bold',
      fontSize: 8,
    },
  });

  drawFooter(doc, company);
  return doc.output('blob');
}

/**
 * 4.2 Relatório de Gastos da Empresa em PDF
 */
export function generateCompanyExpensesReportPdf(
  expenses: CompanyExpense[],
  company: CompanySettings,
  filters: ReportFilterOptions
): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let startY = drawHeader(doc, 'Relatório Analítico de Gastos da Empresa', company, `Período: ${filters.periodLabel}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(
    `Gerado em: ${new Date().toLocaleString('pt-BR')} • Total de Despesas: ${expenses.length}${
      filters.category ? ` • Categoria: ${filters.category}` : ''
    }${filters.supplier ? ` • Fornecedor: ${filters.supplier}` : ''}`,
    14,
    startY
  );

  startY += 4;

  const rows = expenses.map((e) => [
    e.expenseNumber,
    formatDate(e.date || e.createdAt),
    e.supplier,
    e.items.map((i) => `${i.quantity}x ${i.category}`).join(', '),
    e.items.map((i) => i.description).join('; '),
    formatCurrency(e.totalAmount),
    formatCurrency(e.discount),
    formatCurrency(e.paidAmount),
    formatCurrency(e.remainingBalance),
    (e.paymentMethod || 'PIX').replace('_', ' ').toUpperCase(),
    e.status.toUpperCase(),
  ]);

  const totalExpense = expenses.reduce((acc, e) => acc + (e.totalAmount || 0), 0);
  const totalPaid = expenses.reduce((acc, e) => acc + (e.paidAmount || 0), 0);
  const totalRemaining = expenses.reduce((acc, e) => acc + (e.remainingBalance || 0), 0);

  autoTable(doc, {
    startY,
    head: [['DESPESA', 'DATA', 'FORNECEDOR', 'ITENS / CATEGORIAS', 'DESCRIÇÃO RESUMIDA', 'TOTAL (R$)', 'DESC.', 'PAGO (R$)', 'SALDO (R$)', 'FORMA', 'STATUS']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      5: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] },
      6: { halign: 'right' },
      7: { halign: 'right', textColor: [22, 101, 52] },
      8: { halign: 'right', textColor: [180, 83, 9] },
      10: { halign: 'center', fontStyle: 'bold' },
    },
    foot: [
      ['TOTAIS:', '', '', `${expenses.length} despesas`, '', formatCurrency(totalExpense), '', formatCurrency(totalPaid), formatCurrency(totalRemaining), '', ''],
    ],
    footStyles: {
      fillColor: [243, 244, 242],
      textColor: [48, 51, 79],
      fontStyle: 'bold',
      fontSize: 8,
    },
  });

  drawFooter(doc, company);
  return doc.output('blob');
}

/**
 * 4.3 Relatório de Mensalidades em PDF
 */
export function generateMonthlyChargesReportPdf(
  charges: Charge[],
  payments: Payment[],
  company: CompanySettings,
  filters: ReportFilterOptions
): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const todayStr = new Date().toISOString().slice(0, 10);

  let startY = drawHeader(doc, 'Relatório Analítico de Mensalidades e Cobranças', company, `Período: ${filters.periodLabel}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(
    `Gerado em: ${new Date().toLocaleString('pt-BR')} • Total de Registros: ${charges.length}`,
    14,
    startY
  );

  startY += 4;

  const rows = charges.map((c) => {
    const isPaid = (c.remainingBalance <= 0.009) || (c.status === 'pago');
    const isPartial = !isPaid && (c.paidAmount > 0 || c.status === 'parcial');
    const isOverdue = !isPaid && !isPartial && (c.dueDate < todayStr);
    const situation = isPaid ? 'PAGA' : isPartial ? 'PARCIAL' : isOverdue ? 'VENCIDA' : 'PENDENTE';

    const linked = payments.filter((p) => p.chargeId === c.id).sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''));
    let paymentInfo = '-';
    if (isPaid) {
      paymentInfo = linked.length > 0 ? `Pago em ${formatDate(linked[linked.length - 1].paymentDate)}` : 'Quitado';
    } else if (isPartial) {
      if (linked.length > 0) {
        paymentInfo = linked.map((p) => `${formatDate(p.paymentDate)}: ${formatCurrency(p.amount)}`).join('; ');
      } else {
        paymentInfo = `Pago: ${formatCurrency(c.paidAmount)}`;
      }
    }

    return [
      c.clientName,
      `${c.vehiclePlate} (${c.vehicleModel || 'Veículo'})`,
      c.referenceMonth,
      formatDate(c.dueDate),
      formatCurrency(c.originalMonthlyValue),
      formatCurrency(c.totalAmount),
      formatCurrency(c.paidAmount),
      formatCurrency(c.remainingBalance),
      situation,
      paymentInfo,
    ];
  });

  const totalOriginal = charges.reduce((acc, c) => acc + (c.originalMonthlyValue || 0), 0);
  const totalContracted = charges.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const totalPaid = charges.reduce((acc, c) => acc + (c.paidAmount || 0), 0);
  const totalRemaining = charges.reduce((acc, c) => acc + (c.remainingBalance || 0), 0);

  autoTable(doc, {
    startY,
    head: [['CLIENTE', 'VEÍCULO / PLACA', 'COMPETÊNCIA', 'VENCIMENTO', 'VALOR ORIGINAL', 'TOTAL COBRADO', 'VALOR PAGO', 'SALDO RESTANTE', 'SITUAÇÃO', 'PAGAMENTO / HISTÓRICO']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38 },
      1: { cellWidth: 32 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
      6: { halign: 'right', textColor: [22, 101, 52], cellWidth: 22 },
      7: { halign: 'right', textColor: [180, 83, 9], cellWidth: 22 },
      8: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
      9: { cellWidth: 'auto', fontSize: 6.5 },
    },
    foot: [
      ['TOTAIS:', `${charges.length} cobranças`, '', '', formatCurrency(totalOriginal), formatCurrency(totalContracted), formatCurrency(totalPaid), formatCurrency(totalRemaining), '', ''],
    ],
    footStyles: {
      fillColor: [243, 244, 242],
      textColor: [48, 51, 79],
      fontStyle: 'bold',
      fontSize: 8,
    },
  });

  drawFooter(doc, company);
  return doc.output('blob');
}

/**
 * 4.4 Relatório de Clientes em PDF
 */
export function generateClientsReportPdf(
  clients: Client[],
  vehicles: Vehicle[],
  company: CompanySettings,
  filters: ReportFilterOptions
): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let startY = drawHeader(doc, 'Relatório Cadastral de Clientes', company, `Filtro: ${filters.periodLabel}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(
    `Gerado em: ${new Date().toLocaleString('pt-BR')} • Total de Clientes: ${clients.length}`,
    14,
    startY
  );

  startY += 4;

  const rows = clients.map((c) => {
    const clientVehicles = vehicles.filter((v) => v.clientId === c.id);
    const vehicleCount = clientVehicles.length;
    const plates = clientVehicles.map((v) => v.plate).join(', ') || 'Nenhum';

    return [
      c.name,
      c.document || 'Não informado',
      c.whatsapp || c.phone || 'Não informado',
      c.email || 'Não informado',
      c.address || 'Não informado',
      formatDate(c.createdAt),
      String(vehicleCount),
      plates,
      (c.status || 'ativo').toUpperCase(),
    ];
  });

  autoTable(doc, {
    startY,
    head: [['NOME DO CLIENTE', 'CPF / CNPJ', 'TELEFONE / WHATSAPP', 'E-MAIL', 'ENDEREÇO', 'CADASTRO', 'VEÍCULOS', 'PLACAS VINCULADAS', 'STATUS']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      6: { halign: 'center', fontStyle: 'bold' },
      8: { halign: 'center', fontStyle: 'bold' },
    },
  });

  drawFooter(doc, company);
  return doc.output('blob');
}

/**
 * 4.5 Relatório de Veículos e Rastreadores em PDF
 */
export function generateVehiclesReportPdf(
  vehicles: Vehicle[],
  clients: Client[],
  company: CompanySettings,
  filters: ReportFilterOptions
): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let startY = drawHeader(doc, 'Relatório de Veículos & Rastreamento', company, `Filtro: ${filters.periodLabel}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(
    `Gerado em: ${new Date().toLocaleString('pt-BR')} • Total de Veículos: ${vehicles.length}`,
    14,
    startY
  );

  startY += 4;

  const clientMap = new Map<string, string>();
  clients.forEach((c) => clientMap.set(c.id, c.name));

  const rows = vehicles.map((v) => [
    v.plate,
    v.brand,
    v.model,
    v.color || 'Não informada',
    clientMap.get(v.clientId) || 'Cliente não identificado',
    v.planDescription || 'Padrão',
    formatCurrency(v.monthlyValue),
    v.contractStartDate ? formatDate(v.contractStartDate) : '-',
    v.trackerModel || '4G Standard',
    v.trackerSerial || 'Não informado',
    (v.status || 'ativo').toUpperCase(),
  ]);

  const totalMonthly = vehicles.reduce((acc, v) => acc + (v.monthlyValue || 0), 0);

  autoTable(doc, {
    startY,
    head: [['PLACA', 'MARCA', 'MODELO', 'COR', 'CLIENTE VINCULADO', 'PLANO CONTRATADO', 'MENSALIDADE', 'INÍCIO CONTRATO', 'RASTREADOR', 'Nº SÉRIE', 'SITUAÇÃO']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      6: { halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
      10: { halign: 'center', fontStyle: 'bold' },
    },
    foot: [
      ['TOTAIS:', '', '', '', '', `${vehicles.length} veículos`, formatCurrency(totalMonthly), '', '', '', ''],
    ],
    footStyles: {
      fillColor: [243, 244, 242],
      textColor: [48, 51, 79],
      fontStyle: 'bold',
      fontSize: 8,
    },
  });

  drawFooter(doc, company);
  return doc.output('blob');
}

/**
 * 4.5 Relatório de Histórico Individual e Extrato Cronológico do Cliente em PDF
 */
export function generateClientDossierPdf(
  client: Client,
  vehicles: Vehicle[],
  charges: Charge[],
  services: TechnicalServiceOrder[],
  payments: Payment[],
  company: CompanySettings
): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const todayStr = new Date().toISOString().slice(0, 10);
  const pageWidth = doc.internal.pageSize.getWidth();

  let startY = drawHeader(doc, 'Dossiê Financeiro e Histórico Individual do Cliente', company, `Cliente: ${client.name}`);

  // Client Info Box
  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(14, startY, pageWidth - 28, 26, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, pageWidth - 28, 26, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_ORANGE[0], COLOR_ORANGE[1], COLOR_ORANGE[2]);
  doc.text('DADOS CADASTRAIS DO CLIENTE', 18, startY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(client.name, 18, startY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`CPF / CNPJ: ${client.document || 'Não informado'}`, 18, startY + 17);
  doc.text(`Telefone / WhatsApp: ${client.whatsapp || client.phone || 'Não informado'}`, 18, startY + 22);

  doc.text(`E-mail: ${client.email || 'Não informado'}`, pageWidth / 2, startY + 12);
  doc.text(`Endereço: ${client.address || 'Não informado'}`, pageWidth / 2, startY + 17);
  const vehiclesStr = vehicles.map((v) => `${v.plate} (${v.brand} ${v.model} - ${formatCurrency(v.monthlyValue)}/mês)`).join('; ') || 'Nenhum veículo';
  doc.text(`Veículos & Planos: ${vehiclesStr}`, pageWidth / 2, startY + 22);

  startY += 32;

  // Financial Breakdown Box (Strictly separated: Mensalidades vs Serviços)
  const totalChargesBilled = charges.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const totalChargesPaid = charges.reduce((acc, c) => acc + (c.paidAmount || 0), 0);
  const totalChargesRemaining = charges.reduce((acc, c) => acc + (c.remainingBalance || 0), 0);

  const totalServicesBilled = services.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  const totalServicesPaid = services.reduce((acc, s) => acc + (s.paidAmount || 0), 0);
  const totalServicesRemaining = services.reduce((acc, s) => acc + (s.remainingBalance || 0), 0);

  const totalGeneralPaid = totalChargesPaid + totalServicesPaid;
  const totalGeneralRemaining = totalChargesRemaining + totalServicesRemaining;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);

  // Card 1: Mensalidades
  doc.roundedRect(14, startY, 86, 20, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('MENSALIDADES DE RASTREAMENTO', 18, startY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`Total Lançado: ${formatCurrency(totalChargesBilled)}`, 18, startY + 10);
  doc.text(`Recebido: ${formatCurrency(totalChargesPaid)}`, 18, startY + 14);
  doc.setTextColor(totalChargesRemaining > 0 ? 180 : 100, totalChargesRemaining > 0 ? 83 : 116, totalChargesRemaining > 0 ? 9 : 139);
  doc.setFont('helvetica', 'bold');
  doc.text(`Pendente: ${formatCurrency(totalChargesRemaining)}`, 18, startY + 18);

  // Card 2: Serviços Técnicos
  doc.roundedRect(104, startY, 86, 20, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('SERVIÇOS TÉCNICOS / ORDENS DE SERVIÇO', 108, startY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`Total Cobrado: ${formatCurrency(totalServicesBilled)}`, 108, startY + 10);
  doc.text(`Recebido: ${formatCurrency(totalServicesPaid)}`, 108, startY + 14);
  doc.setTextColor(totalServicesRemaining > 0 ? 180 : 100, totalServicesRemaining > 0 ? 83 : 116, totalServicesRemaining > 0 ? 9 : 139);
  doc.setFont('helvetica', 'bold');
  doc.text(`Pendente: ${formatCurrency(totalServicesRemaining)}`, 108, startY + 18);

  // Card 3: Posição Geral Consolidada
  doc.roundedRect(194, startY, pageWidth - 208, 20, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_ORANGE[0], COLOR_ORANGE[1], COLOR_ORANGE[2]);
  doc.text('POSIÇÃO FINANCEIRA GERAL DO CLIENTE', 198, startY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(22, 101, 52);
  doc.text(`Total Efetivamente Quitado: ${formatCurrency(totalGeneralPaid)}`, 198, startY + 11);
  doc.setTextColor(totalGeneralRemaining > 0 ? 190 : 100, totalGeneralRemaining > 0 ? 24 : 116, totalGeneralRemaining > 0 ? 24 : 139);
  doc.setFont('helvetica', 'bold');
  doc.text(`Saldo Total em Aberto: ${formatCurrency(totalGeneralRemaining)}`, 198, startY + 17);

  startY += 26;

  // 1. Tabela de Mensalidades
  const chargeRows = charges.map((c) => {
    const isPaid = (c.remainingBalance <= 0.009) || (c.status === 'pago');
    const isPartial = !isPaid && (c.paidAmount > 0 || c.status === 'parcial');
    const isOverdue = !isPaid && !isPartial && (c.dueDate < todayStr);
    const situation = isPaid ? 'PAGA' : isPartial ? 'PARCIAL' : isOverdue ? 'VENCIDA' : 'PENDENTE';

    const linked = payments.filter((p) => p.chargeId === c.id);
    let pInfo = '-';
    if (isPaid) {
      pInfo = linked.length > 0 ? formatDate(linked[linked.length - 1].paymentDate) : 'Quitado';
    } else if (isPartial && linked.length > 0) {
      pInfo = linked.map((p) => `${formatDate(p.paymentDate)} (${formatCurrency(p.amount)})`).join('; ');
    }

    return [
      c.referenceMonth,
      formatDate(c.dueDate),
      c.vehiclePlate,
      formatCurrency(c.originalMonthlyValue),
      formatCurrency(c.totalAmount),
      formatCurrency(c.paidAmount),
      formatCurrency(c.remainingBalance),
      situation,
      pInfo,
    ];
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('1. HISTÓRICO DE MENSALIDADES DE RASTREAMENTO', 14, startY - 1);

  autoTable(doc, {
    startY,
    head: [['COMPETÊNCIA', 'VENCIMENTO', 'PLACA', 'VALOR ORIGINAL', 'VALOR COBRADO', 'VALOR PAGO', 'SALDO RESTANTE', 'SITUAÇÃO', 'PAGAMENTOS']],
    body: chargeRows.length > 0 ? chargeRows : [['Sem mensalidades cadastradas', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    bodyStyles: {
      fontSize: 6.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'center' },
      1: { halign: 'center' },
      2: { fontStyle: 'bold' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right', textColor: [22, 101, 52] },
      6: { halign: 'right', textColor: [180, 83, 9] },
      7: { halign: 'center', fontStyle: 'bold' },
      8: { fontSize: 6 },
    },
  });

  startY = (doc as any).lastAutoTable.finalY + 8;

  // 2. Tabela de Serviços Técnicos
  if (startY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    startY = drawHeader(doc, 'Dossiê Financeiro do Cliente (Continuação)', company, `Cliente: ${client.name}`);
  }

  const serviceRows = services.map((s) => [
    s.orderNumber,
    formatDate(s.executionDate || s.createdAt),
    s.items.map((i) => i.category).join(', ') || 'Serviço',
    s.vehiclePlate,
    s.technicianName || '-',
    s.items.map((i) => i.description).join('; ') || '-',
    formatCurrency(s.totalAmount),
    formatCurrency(s.paidAmount),
    formatCurrency(s.remainingBalance),
    s.status.toUpperCase(),
  ]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('2. HISTÓRICO DE SERVIÇOS TÉCNICOS E ORDENS DE SERVIÇO', 14, startY - 1);

  autoTable(doc, {
    startY,
    head: [['O.S.', 'DATA', 'TIPO SERVIÇO', 'PLACA', 'TÉCNICO', 'DESCRIÇÃO', 'VALOR COBRADO', 'VALOR RECEBIDO', 'SALDO PENDENTE', 'SITUAÇÃO']],
    body: serviceRows.length > 0 ? serviceRows : [['Nenhum serviço técnico cadastrado', '', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    bodyStyles: {
      fontSize: 6.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'center' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right', textColor: [22, 101, 52] },
      8: { halign: 'right', textColor: [180, 83, 9] },
      9: { halign: 'center', fontStyle: 'bold' },
    },
  });

  startY = (doc as any).lastAutoTable.finalY + 8;

  // 3. Extrato Cronológico Unificado
  if (startY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    startY = drawHeader(doc, 'Dossiê Financeiro do Cliente (Extrato Cronológico)', company, `Cliente: ${client.name}`);
  }

  // Unified Chronological events
  interface TimelineEvent {
    date: string;
    type: string;
    ref: string;
    plate: string;
    description: string;
    inflow: number; // Entrada / Recebimento
    outflow: number; // Débito lançado / Saldo
  }

  const events: TimelineEvent[] = [];

  // Add charges launches
  charges.forEach((c) => {
    events.push({
      date: c.dueDate || c.createdAt.slice(0, 10),
      type: 'Mensalidade Lançada',
      ref: `Competência ${c.referenceMonth}`,
      plate: c.vehiclePlate,
      description: `Fatura de rastreamento veicular (${c.vehicleModel || 'Veículo'})`,
      inflow: 0,
      outflow: c.totalAmount,
    });
  });

  // Add payments
  payments.filter((p) => p.clientId === client.id).forEach((p) => {
    events.push({
      date: p.paymentDate || p.createdAt.slice(0, 10),
      type: 'Pagamento de Mensalidade',
      ref: `Recibo #${p.receiptNumber}`,
      plate: p.vehiclePlate || '-',
      description: `Baixa de mensalidade via ${(p.paymentMethod || 'PIX').toUpperCase()}`,
      inflow: p.amount,
      outflow: 0,
    });
  });

  // Add services
  services.forEach((s) => {
    events.push({
      date: (s.executionDate || s.createdAt).slice(0, 10),
      type: 'Ordem de Serviço (Cobrança)',
      ref: s.orderNumber,
      plate: s.vehiclePlate,
      description: s.items.map((i) => i.description).join('; ') || 'Serviço técnico realizado',
      inflow: 0,
      outflow: s.totalAmount,
    });

    if (s.paidAmount > 0) {
      events.push({
        date: s.paymentDate || (s.executionDate || s.createdAt).slice(0, 10),
        type: 'Recebimento de O.S.',
        ref: `Recibo O.S. #${s.receiptNumber}`,
        plate: s.vehiclePlate,
        description: `Recebimento de serviço técnico via ${(s.paymentMethod || 'PIX').toUpperCase()}`,
        inflow: s.paidAmount,
        outflow: 0,
      });
    }
  });

  // Sort descending by date
  events.sort((a, b) => b.date.localeCompare(a.date));

  const timelineRows = events.map((ev) => [
    formatDate(ev.date),
    ev.type,
    ev.ref,
    ev.plate,
    ev.description,
    ev.inflow > 0 ? formatCurrency(ev.inflow) : '-',
    ev.outflow > 0 ? formatCurrency(ev.outflow) : '-',
  ]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('3. EXTRATO CRONOLÓGICO UNIFICADO (HISTÓRICO FINANCEIRO INTEGRAL)', 14, startY - 1);

  autoTable(doc, {
    startY,
    head: [['DATA', 'OPERAÇÃO', 'REFERÊNCIA', 'PLACA', 'DETALHES / HISTÓRICO', 'ENTRADA / PAGO (+)', 'VALOR LANÇADO (-)']],
    body: timelineRows.length > 0 ? timelineRows : [['Nenhum lançamento no extrato', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    bodyStyles: {
      fontSize: 6.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold' },
      1: { fontStyle: 'bold' },
      2: { fontStyle: 'normal' },
      5: { halign: 'right', textColor: [22, 101, 52], fontStyle: 'bold' },
      6: { halign: 'right', textColor: [180, 83, 9] },
    },
  });

  drawFooter(doc, company);
  return doc.output('blob');
}

/**
 * 4.6 Relatório de Controle Individual e Pagamentos de Técnicos em PDF
 */
export function generateTechnicianDossierPdf(
  technician: Technician,
  services: TechnicalServiceOrder[],
  payments: TechnicianPayment[],
  company: CompanySettings,
  periodLabel: string
): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let startY = drawHeader(doc, 'Relatório Individual de Serviços e Pagamentos do Técnico', company, `Técnico: ${technician.name}`);

  // Technician Info Box
  doc.setFillColor(COLOR_GRAY_BG[0], COLOR_GRAY_BG[1], COLOR_GRAY_BG[2]);
  doc.roundedRect(14, startY, pageWidth - 28, 24, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, pageWidth - 28, 24, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_ORANGE[0], COLOR_ORANGE[1], COLOR_ORANGE[2]);
  doc.text('DADOS DO TÉCNICO RESPONSÁVEL', 18, startY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(technician.name, 18, startY + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(`CPF: ${technician.cpf || 'Não informado'} • Telefone/WhatsApp: ${technician.whatsapp || technician.phone || 'Não informado'}`, 18, startY + 16.5);
  doc.text(`Endereço: ${technician.address || 'Não informado'} • Período Consultado: ${periodLabel}`, 18, startY + 21);

  startY += 29;

  // Financial Summary Cards
  const totalDue = services.reduce((acc, s) => acc + (s.technicianFee || 0), 0);
  const totalPaid = services.reduce((acc, s) => acc + (s.technicianPaidAmount || 0), 0);
  const totalPending = services.reduce((acc, s) => acc + (s.technicianRemainingBalance || Math.max(0, (s.technicianFee || 0) - (s.technicianPaidAmount || 0))), 0);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);

  // Card 1
  doc.roundedRect(14, startY, 60, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text('SERVIÇOS PRESTADOS', 18, startY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text(`${services.length} ordens de serviço`, 18, startY + 12);

  // Card 2
  doc.roundedRect(78, startY, 60, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text('VALOR TOTAL DEVIDO AO TÉCNICO', 82, startY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text(formatCurrency(totalDue), 82, startY + 12);

  // Card 3
  doc.roundedRect(142, startY, 60, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text('VALOR JÁ PAGO PELA EMPRESA', 146, startY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(22, 101, 52);
  doc.text(formatCurrency(totalPaid), 146, startY + 12);

  // Card 4
  doc.roundedRect(206, startY, pageWidth - 220, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text('SALDO PENDENTE A PAGAR', 210, startY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(totalPending > 0 ? 180 : 100, totalPending > 0 ? 83 : 116, totalPending > 0 ? 9 : 139);
  doc.text(formatCurrency(totalPending), 210, startY + 12);

  startY += 22;

  // Services table
  const serviceRows = services.map((s) => {
    const fee = s.technicianFee !== undefined ? formatCurrency(s.technicianFee) : 'Não definido';
    const paid = s.technicianPaidAmount !== undefined ? formatCurrency(s.technicianPaidAmount) : 'R$ 0,00';
    const rem = s.technicianRemainingBalance !== undefined ? formatCurrency(s.technicianRemainingBalance) : fee;
    const st = (s.technicianPaymentStatus || 'pendente').toUpperCase();

    return [
      s.orderNumber,
      formatDate(s.executionDate || s.createdAt),
      s.clientName,
      `${s.vehiclePlate} (${s.vehicleModel})`,
      s.items.map((i) => i.category).join(', '),
      s.items.map((i) => i.description).join('; '),
      formatCurrency(s.totalAmount),
      fee,
      paid,
      rem,
      st,
    ];
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('1. SERVIÇOS TÉCNICOS PRESTADOS E VALORES DEVIDOS', 14, startY - 1);

  autoTable(doc, {
    startY,
    head: [['O.S.', 'DATA', 'CLIENTE', 'VEÍCULO', 'TIPO', 'DESCRIÇÃO', 'COBRADO DO CLIENTE', 'DEVIDO AO TÉCNICO', 'PAGO AO TÉCNICO', 'SALDO PENDENTE', 'STATUS PGTO']],
    body: serviceRows.length > 0 ? serviceRows : [['Nenhum serviço registrado para este técnico', '', '', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    bodyStyles: {
      fontSize: 6.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'center' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'right', textColor: [22, 101, 52] },
      9: { halign: 'right', textColor: [180, 83, 9] },
      10: { halign: 'center', fontStyle: 'bold' },
    },
    foot: [
      ['TOTAIS:', `${services.length} serviços`, '', '', '', '', '', formatCurrency(totalDue), formatCurrency(totalPaid), formatCurrency(totalPending), ''],
    ],
    footStyles: {
      fillColor: [243, 244, 242],
      textColor: [48, 51, 79],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
  });

  startY = (doc as any).lastAutoTable.finalY + 8;

  // Payments History table
  if (startY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    startY = drawHeader(doc, 'Relatório Individual do Técnico (Pagamentos Realizados)', company, `Técnico: ${technician.name}`);
  }

  const paymentRows = payments.map((p) => [
    formatDate(p.paymentDate || p.createdAt),
    p.receiptNumber || `REC-${p.id.slice(-6)}`,
    (p.serviceOrderNumbers && p.serviceOrderNumbers.length > 0) ? p.serviceOrderNumbers.join(', ') : 'Serviços do Técnico',
    (p.paymentMethod || 'PIX').replace('_', ' ').toUpperCase(),
    formatCurrency(p.amount),
    p.notes || '-',
  ]);

  const totalPaymentsMade = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(COLOR_NAVY[0], COLOR_NAVY[1], COLOR_NAVY[2]);
  doc.text('2. HISTÓRICO DE PAGAMENTOS REALIZADOS PELA EMPRESA AO TÉCNICO', 14, startY - 1);

  autoTable(doc, {
    startY,
    head: [['DATA', 'COMPROVANTE', 'ORDENS DE SERVIÇO VINCULADAS', 'FORMA DE PGTO', 'VALOR PAGO (R$)', 'OBSERVAÇÕES']],
    body: paymentRows.length > 0 ? paymentRows : [['Nenhum pagamento registrado no período', '', '', '', '', '']],
    theme: 'grid',
    headStyles: {
      fillColor: [48, 51, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    bodyStyles: {
      fontSize: 6.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold' },
      1: { fontStyle: 'bold' },
      4: { halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
    },
    foot: [
      ['TOTAIS:', `${payments.length} comprovantes`, '', '', formatCurrency(totalPaymentsMade), ''],
    ],
    footStyles: {
      fillColor: [243, 244, 242],
      textColor: [48, 51, 79],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
  });

  drawFooter(doc, company);
  return doc.output('blob');
}
