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

  const rows = charges.map((c) => [
    c.clientName,
    c.vehiclePlate,
    c.vehicleModel || 'Veículo',
    c.referenceMonth,
    formatDate(c.dueDate),
    formatCurrency(c.originalMonthlyValue),
    formatCurrency(c.totalAmount),
    formatCurrency(c.paidAmount),
    formatCurrency(c.remainingBalance),
    c.status.toUpperCase(),
  ]);

  const totalContracted = charges.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const totalPaid = charges.reduce((acc, c) => acc + (c.paidAmount || 0), 0);
  const totalRemaining = charges.reduce((acc, c) => acc + (c.remainingBalance || 0), 0);

  autoTable(doc, {
    startY,
    head: [['CLIENTE', 'PLACA', 'MODELO', 'COMPETÊNCIA', 'VENCIMENTO', 'VALOR ORIGINAL', 'VALOR COBRADO', 'VALOR PAGO', 'SALDO DEVEDOR', 'SITUAÇÃO']],
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
      1: { fontStyle: 'bold' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right', textColor: [22, 101, 52] },
      8: { halign: 'right', textColor: [180, 83, 9] },
      9: { halign: 'center', fontStyle: 'bold' },
    },
    foot: [
      ['TOTAIS:', '', '', `${charges.length} cobranças`, '', '', formatCurrency(totalContracted), formatCurrency(totalPaid), formatCurrency(totalRemaining), ''],
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
