/**
 * Standardized Export and Sharing Helpers for AUTOTEC
 * Strictly supporting:
 * 1. Compartilhar em SVG
 * 2. Baixar em SVG
 * 3. Baixar em PDF
 *
 * NOTE ON WHATSAPP & SVG COMPATIBILITY:
 * In Android and iOS, WhatsApp's internal media pipeline strictly supports raster images
 * (JPEG, PNG, GIF, WebP) in its photo sharing intent. When an 'image/svg+xml' file is shared
 * through the native share sheet, WhatsApp often opens the chat compose box or displays a draft preview,
 * but fails to upload or transmit the file to the recipient because WhatsApp requires vector SVG files
 * to be sent as a "Document" (anexo de documento).
 *
 * Web Share API does not guarantee delivery; resolving navigator.share() ONLY means the operating
 * system presented the intent to the target app. We must NEVER simulate or claim that the message
 * or file was delivered.
 */

/**
 * Prepares a complete, valid and standalone SVG document with XML declaration,
 * explicit dimensions, and namespace attributes.
 */
export function prepareStandaloneSvg(svgContent: string): string {
  let content = (svgContent || '').trim();

  // 1. Ensure XML Declaration for standalone vector files
  if (!content.startsWith('<?xml')) {
    content = `<?xml version="1.0" encoding="UTF-8"?>\n${content}`;
  }

  // 2. Ensure standalone pixel width/height based on viewBox to prevent
  // zero-dimension collapse in external vector viewers and apps
  content = content.replace(
    /(<svg\b[^>]*?viewBox="0 0 (\d+) (\d+)"[^>]*?)width="100%" height="100%"/i,
    '$1width="$2" height="$3"'
  );

  return content;
}

/**
 * Downloads a Blob directly to the client's device with safe object URL lifecycle
 */
export function downloadBlobFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Allow ample time for the mobile browser download manager to complete file transfer
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore if already revoked
    }
  }, 15000);
}

/**
 * Downloads a complete and valid standalone SVG file
 */
export function downloadSvgFile(svgContent: string, rawFileName: string): void {
  let cleanName = (rawFileName || 'documento_AUTOTEC')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-zA-Z0-9_\-]/g, '_');

  if (!cleanName.toLowerCase().endsWith('.svg')) {
    cleanName += '.svg';
  }

  const fullSvg = prepareStandaloneSvg(svgContent);
  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlobFile(blob, cleanName);
}

export interface ShareResult {
  success: boolean;
  status: 'shared_intent_opened' | 'cancelled' | 'unsupported' | 'error';
  fallbackTriggered?: boolean;
  message: string;
}

/**
 * Shares an authentic SVG vector file using the Web Share API.
 * 
 * Rules strictly followed:
 * - Does NOT pass 'text' alongside 'files' to avoid the Android text-collision bug
 *   where WhatsApp prioritizes text and drops the file stream.
 * - Checks navigator.canShare with the exact File object.
 * - Does NOT claim successful delivery (differentiates OS intent handoff vs recipient delivery).
 * - Clearly advises the user regarding WhatsApp's document requirement for SVG.
 */
export async function shareSvgFile(
  svgContent: string,
  rawFileName: string,
  title?: string
): Promise<ShareResult> {
  let cleanName = (rawFileName || 'documento_AUTOTEC')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_');

  if (!cleanName.toLowerCase().endsWith('.svg')) {
    cleanName += '.svg';
  }

  const fullSvg = prepareStandaloneSvg(svgContent);
  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  const file = new File([blob], cleanName, {
    type: 'image/svg+xml',
    lastModified: Date.now(),
  });

  const hasNavigatorShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  let canShareFiles = false;

  if (hasNavigatorShare && typeof navigator.canShare === 'function') {
    try {
      canShareFiles = navigator.canShare({ files: [file] });
    } catch {
      canShareFiles = false;
    }
  }

  // If the browser/device does not support sharing this file type directly
  if (!hasNavigatorShare || !canShareFiles) {
    downloadBlobFile(blob, cleanName);
    return {
      success: false,
      status: 'unsupported',
      fallbackTriggered: true,
      message:
        'Seu navegador ou dispositivo não suporta compartilhamento direto de arquivos SVG. O arquivo SVG original foi baixado para você anexar manualmente.',
    };
  }

  // Trigger native share sheet with ONLY files and clean title (NO text to avoid WhatsApp text-drop bug)
  try {
    await navigator.share({
      files: [file],
      title: title || cleanName,
    });

    // NOTE: Resolving navigator.share only means the OS share sheet received the intent.
    // It does NOT confirm that WhatsApp or another app transmitted it to the recipient.
    return {
      success: true,
      status: 'shared_intent_opened',
      message:
        'Menu de compartilhamento acionado. AVISO: No WhatsApp, arquivos SVG podem não ser entregues diretamente. Se o destinatário não receber, use "Baixar em SVG" e anexe como Documento (Clipe 📎 > Documento).',
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        success: false,
        status: 'cancelled',
        message: 'Compartilhamento cancelado pelo usuário.',
      };
    }

    // On unhandled sharing error, fall back to downloading the SVG file
    downloadBlobFile(blob, cleanName);
    return {
      success: false,
      status: 'error',
      fallbackTriggered: true,
      message:
        'O aplicativo de destino não aceitou o arquivo SVG. O arquivo original foi baixado no seu dispositivo para envio manual.',
    };
  }
}

/**
 * Downloads a PDF file from a Blob
 */
export function downloadPdfFile(pdfBlob: Blob, rawFileName: string): void {
  let cleanName = (rawFileName || 'documento_AUTOTEC')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_');

  if (!cleanName.toLowerCase().endsWith('.pdf')) {
    cleanName += '.pdf';
  }
  downloadBlobFile(pdfBlob, cleanName);
}
