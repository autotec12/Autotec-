import { Charge, CompanySettings, Client, Vehicle } from '../types';
import { formatCurrency, formatDate } from './calculations';

export type WhatsAppMessageType = 'aviso_antecipado' | 'vencimento_dia' | 'atrasada' | 'saldo_parcial';

export function cleanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function generateWhatsAppMessage(
  type: WhatsAppMessageType,
  charge: Charge,
  company: CompanySettings,
  client?: Client,
  vehicle?: Vehicle
): string {
  const companyName = company.companyName || 'AUTOTEC RASTREAMENTO VEICULAR';
  const clientName = client?.name || charge.clientName || 'Cliente';
  const plate = vehicle?.plate || charge.vehiclePlate || 'Veículo';
  const vehicleModel = vehicle?.model ? `(${vehicle.model})` : charge.vehicleModel ? `(${charge.vehicleModel})` : '';
  const dueDate = formatDate(charge.dueDate);
  const remaining = formatCurrency(charge.remainingBalance);
  const original = formatCurrency(charge.originalMonthlyValue);
  const pixKey = company.pixKey ? `\n\nChave PIX: *${company.pixKey}* (${company.pixKeyType || 'PIX'})` : '';

  let message = '';

  switch (type) {
    case 'aviso_antecipado':
      message = `Olá, *${clientName}*! Tudo bem?\n\n` +
        `Passando para lembrar que a mensalidade do serviço de rastreamento do veículo *${plate}* ${vehicleModel} vence em *${dueDate}*.\n\n` +
        `*Valor da mensalidade:* ${remaining}` +
        `${charge.previousBalanceCarried > 0 ? `\n(Inclui saldo anterior de ${formatCurrency(charge.previousBalanceCarried)})` : ''}` +
        `${pixKey}\n\n` +
        `Qualquer dúvida ou caso já tenha efetuado o pagamento, por favor desconsidere.\n` +
        `Atenciosamente,\n*${companyName}*`;
      break;

    case 'vencimento_dia':
      message = `Olá, *${clientName}*! Tudo bem?\n\n` +
        `Lembramos que sua mensalidade de rastreamento do veículo *${plate}* ${vehicleModel} vence *HOJE (${dueDate})*.\n\n` +
        `*Valor:* ${remaining}` +
        `${pixKey}\n\n` +
        `Caso já tenha efetuado o pagamento, nos envie o comprovante por aqui.\n` +
        `Agradecemos a confiança!\n*${companyName}*`;
      break;

    case 'atrasada':
      message = `Olá, *${clientName}*.\n\n` +
        `Consta em nosso sistema que a mensalidade do veículo *${plate}* ${vehicleModel}, com vencimento em *${dueDate}*, ainda se encontra em aberto.\n\n` +
        `*Valor em aberto:* ${remaining}\n` +
        `Evite a interrupção do monitoramento regular mantendo suas mensalidades em dia.\n` +
        `${pixKey}\n\n` +
        `Se já realizou o pagamento, por gentileza encaminhe o comprovante para darmos baixa imediata.\n` +
        `*${companyName}*`;
      break;

    case 'saldo_parcial':
      message = `Olá, *${clientName}*.\n\n` +
        `Confirmamos o recebimento parcial referente ao veículo *${plate}* ${vehicleModel}.\n\n` +
        `*Valor original da mensalidade:* ${original}\n` +
        `*Total já pago:* ${formatCurrency(charge.paidAmount)}\n` +
        `*Saldo pendente restante:* *${remaining}*\n` +
        `${charge.balanceScheduledDate ? `*Data combinada para quitação:* ${formatDate(charge.balanceScheduledDate)}\n` : ''}` +
        `${pixKey}\n\n` +
        `Estamos à disposição para qualquer esclarecimento.\n` +
        `*${companyName}*`;
      break;
  }

  return message;
}

export function openWhatsAppLink(phone: string, text: string) {
  const cleaned = cleanPhone(phone);
  const encoded = encodeURIComponent(text);
  const url = cleaned ? `https://wa.me/${cleaned}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
}
