/**
 * Opens the invoice page in a small popup with ?mode=capture.
 * The invoice page auto-generates its PDF with html2canvas and posts
 * the base64 back via postMessage, then closes itself.
 */
export function captureInvoicePdf(invoiceUrl: string, id: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const popup = window.open(
      `${invoiceUrl}${invoiceUrl.includes('?') ? '&' : '?'}mode=capture`,
      '_blank',
      'width=900,height=700,scrollbars=yes,resizable=yes',
    );

    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups for this site and try again.'));
      return;
    }

    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Invoice capture timed out. Please try again.'));
    }, 40_000);

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'INVOICE_PDF_READY' && event.data?.id === id) {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        resolve(event.data.base64 as string);
      } else if (event.data?.type === 'INVOICE_PDF_ERROR' && event.data?.id === id) {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        reject(new Error(event.data.error || 'Invoice capture failed'));
      }
    }

    window.addEventListener('message', onMessage);
  });
}

export function billFilename(docNumber: string): string {
  return `Bill_${docNumber.replace(/[/\\:*?"<>|]/g, '-')}.pdf`;
}

export function base64ToBlob(b64: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}
