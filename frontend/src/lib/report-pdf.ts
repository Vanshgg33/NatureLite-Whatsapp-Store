type ReportTable = {
  columns: string[];
  rows: Array<Array<string | number>>;
};

type ReportPdfOptions = {
  title: string;
  subtitle: string;
  meta: Array<{ label: string; value: string | number }>;
  summary: Array<{ label: string; value: string | number }>;
  table: ReportTable;
  filename: string;
  footer?: string;
};

// ── Palette ───────────────────────────────────────────────────
const INK    = '#0F2318';
const GREEN  = '#1E3D2B';
const MID    = '#2F6B47';
const SOFT   = '#EEF7F1';
const ROW2   = '#F2F9F4';
const GOLD   = '#D4A017';
const TEXT   = '#17211A';
const MUTED  = '#6B7C72';
const BORDER = '#D1E6D8';
const WHITE  = '#FFFFFF';

const STAT_ACCENT  = [GREEN,     GOLD,      '#2563EB', '#0891B2'];
const STAT_NUM     = [GREEN,     '#92400E', '#1E40AF', '#0E7490'];
const STAT_BG      = ['#EEF7F1', '#FFFBEB', '#EFF6FF', '#ECFEFF'];

function safeText(value: string | number): string {
  return String(value)
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, '');
}

async function buildPdf(options: ReportPdfOptions) {
  const { default: jsPDF } = await import('jspdf');
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W     = pdf.internal.pageSize.getWidth();   // 210
  const H     = pdf.internal.pageSize.getHeight();  // 297
  const M     = 14;
  const CW    = W - M * 2;                           // 182
  const FH    = 13;                                  // footer height
  const FY    = H - FH;                              // footer y
  const HDR   = 57;                                  // header bottom y
  let   y     = HDR + 9;
  let   page  = 1;

  // ── Helpers ────────────────────────────────────────────────

  const drawFooter = () => {
    pdf.setFillColor(INK);
    pdf.rect(0, FY, W, FH, 'F');
    pdf.setDrawColor(GOLD);
    pdf.setLineWidth(0.5);
    pdf.line(0, FY, W, FY);
    pdf.setTextColor(GOLD);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.text('NATURE LITE ADMIN PANEL', M, FY + 8);
    pdf.setTextColor('#4A7A5A');
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Page ${page}`, W / 2, FY + 8, { align: 'center' });
    const ts = safeText(options.footer || new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }));
    pdf.setTextColor('#3A6A4A');
    pdf.text(ts, W - M, FY + 8, { align: 'right' });
  };

  const sectionPill = (label: string) => {
    pdf.setFillColor(SOFT);
    pdf.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');
    pdf.setFillColor(GREEN);
    pdf.roundedRect(M, y, 3.5, 9, 1.5, 1.5, 'F');
    pdf.rect(M + 2, y, 1.5, 9, 'F');
    pdf.setTextColor(GREEN);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(label.toUpperCase(), M + 9, y + 6);
    y += 13;
  };

  const newPage = (label: string) => {
    drawFooter();
    page++;
    pdf.addPage();
    // Thin continuation header
    pdf.setFillColor(GOLD);
    pdf.rect(0, 0, W, 2.5, 'F');
    pdf.setFillColor(INK);
    pdf.rect(0, 2.5, W, 10, 'F');
    pdf.setTextColor(GOLD);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('NATURE LITE  |  ' + safeText(options.title), M, 9.5);
    y = 19;
    sectionPill(label);
  };

  // ── Page 1: Header ─────────────────────────────────────────

  // Gold top bar
  pdf.setFillColor(GOLD);
  pdf.rect(0, 0, W, 3.5, 'F');

  // Dark green header background
  pdf.setFillColor(INK);
  pdf.rect(0, 3.5, W, HDR - 3.5, 'F');

  // Decorative circles — top-right, mostly off-page
  pdf.setFillColor('#162D1F');
  pdf.circle(W + 6,  -6,  54, 'F');
  pdf.setFillColor('#192E22');
  pdf.circle(W - 6,  16,  36, 'F');
  pdf.setFillColor('#1C3828');
  pdf.circle(W - 20, 38,  20, 'F');

  // Dot-grid texture — bottom-left of header
  pdf.setFillColor('#1A3826');
  for (let dc = 0; dc < 7; dc++) {
    for (let dr = 0; dr < 3; dr++) {
      pdf.circle(M + dc * 6, 38 + dr * 7, 0.9, 'F');
    }
  }

  // Brand pill
  pdf.setFillColor('#1A3826');
  pdf.roundedRect(M, 10, 36, 8.5, 2, 2, 'F');
  pdf.setTextColor(GOLD);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.text('NATURE LITE', M + 3.5, 15.6);

  // "Admin panel" label + gold rule
  pdf.setTextColor('#4A8060');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.text('ADMIN PANEL  |  CONFIDENTIAL REPORT', M, 25.5);
  pdf.setDrawColor(GOLD);
  pdf.setLineWidth(0.35);
  pdf.line(M, 27.5, M + 55, 27.5);

  // Main title
  pdf.setTextColor(WHITE);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(safeText(options.title), M, 40);

  // Subtitle
  pdf.setTextColor('#8ABF9F');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text(safeText(options.subtitle), M, 50);

  // Gold bottom border of header
  pdf.setDrawColor(GOLD);
  pdf.setLineWidth(0.45);
  pdf.line(M, HDR, W - M, HDR);

  // ── Meta cards ─────────────────────────────────────────────

  const mCount = options.meta.length;
  const mGap   = 3;
  const mW     = (CW - mGap * (mCount - 1)) / mCount;

  options.meta.forEach((item, i) => {
    const x = M + i * (mW + mGap);
    // Shadow
    pdf.setFillColor('#CFDDD3');
    pdf.roundedRect(x + 0.8, y + 0.8, mW, 21, 2.5, 2.5, 'F');
    // Card
    pdf.setFillColor(SOFT);
    pdf.roundedRect(x, y, mW, 21, 2.5, 2.5, 'F');
    // Left accent
    pdf.setFillColor(GREEN);
    pdf.roundedRect(x, y, 3.5, 21, 2.5, 2.5, 'F');
    pdf.rect(x + 2, y, 1.5, 21, 'F');
    // Label
    pdf.setTextColor(MUTED);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.text(safeText(item.label).toUpperCase(), x + 8, y + 8);
    // Value
    pdf.setTextColor(TEXT);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    const v = safeText(item.value);
    pdf.text(v.length > 22 ? v.slice(0, 20) + '..' : v, x + 8, y + 16.5);
  });

  y += 27;

  // ── Summary / stat cards ───────────────────────────────────

  sectionPill('Overview');

  const sCount = options.summary.length;
  const sGap   = 2.5;
  const sW     = (CW - sGap * (sCount - 1)) / sCount;

  options.summary.forEach((item, i) => {
    const x   = M + i * (sW + sGap);
    const acc = STAT_ACCENT[i % 4];
    const num = STAT_NUM[i % 4];
    const bg  = STAT_BG[i % 4];
    // Shadow
    pdf.setFillColor('#C8D5CC');
    pdf.roundedRect(x + 0.9, y + 0.9, sW, 28, 3, 3, 'F');
    // Card body
    pdf.setFillColor(bg);
    pdf.roundedRect(x, y, sW, 28, 3, 3, 'F');
    // Top accent (rounded top only — draw rounded rect then square off bottom half)
    pdf.setFillColor(acc);
    pdf.roundedRect(x, y, sW, 4.5, 3, 3, 'F');
    pdf.rect(x, y + 2.5, sW, 2, 'F');
    // Subtle thin top border line
    pdf.setDrawColor(acc);
    pdf.setLineWidth(0.2);
    pdf.line(x + 3, y, x + sW - 3, y);
    // Value
    const val = safeText(item.value);
    const fs  = val.length > 9 ? 10 : val.length > 6 ? 12 : 14;
    pdf.setTextColor(num);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fs);
    pdf.text(val, x + sW / 2, y + 19.5, { align: 'center' });
    // Label
    pdf.setTextColor(MUTED);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    const lbl = safeText(item.label).toUpperCase();
    pdf.text(lbl.length > 17 ? lbl.slice(0, 15) + '..' : lbl, x + sW / 2, y + 25.5, { align: 'center' });
  });

  y += 34;

  // ── Table ──────────────────────────────────────────────────

  sectionPill('Detailed Data');

  const cols   = options.table.columns;
  const colW   = CW / cols.length;
  const ROW_H  = 8.5;
  const THDR_H = 10.5;

  const drawTHead = () => {
    // Header rounded-top background
    pdf.setFillColor(GREEN);
    pdf.roundedRect(M, y, CW, THDR_H, 2, 2, 'F');
    pdf.rect(M, y + 4, CW, THDR_H - 4, 'F');
    // Gold underline on header
    pdf.setDrawColor(GOLD);
    pdf.setLineWidth(0.35);
    pdf.line(M, y + THDR_H, M + CW, y + THDR_H);
    // Column labels
    pdf.setTextColor(WHITE);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    cols.forEach((col, ci) => {
      pdf.text(safeText(col), M + ci * colW + 4, y + 7);
    });
    y += THDR_H + 0.5;
  };

  drawTHead();

  options.table.rows.forEach((row, ri) => {
    if (y + ROW_H > FY - 4) {
      newPage('Detailed Data (continued)');
      drawTHead();
    }

    const even = ri % 2 === 0;
    // Row background
    pdf.setFillColor(even ? WHITE : ROW2);
    pdf.rect(M, y, CW, ROW_H, 'F');
    // Left micro-accent
    pdf.setFillColor(even ? '#C8E6D0' : '#A8D4B8');
    pdf.rect(M, y, 2.5, ROW_H, 'F');

    // Row cells
    row.forEach((cell, ci) => {
      const txt = safeText(cell);
      const max = Math.floor((colW - 7) / 2.4);
      const out = txt.length > max ? txt.slice(0, max - 2) + '..' : txt;
      pdf.setTextColor(TEXT);
      pdf.setFont('helvetica', ci === 0 ? 'bold' : 'normal');
      pdf.setFontSize(7);
      pdf.text(out, M + ci * colW + 5, y + 5.7);
    });

    // Row separator
    pdf.setDrawColor(BORDER);
    pdf.setLineWidth(0.15);
    pdf.line(M + 3, y + ROW_H, M + CW, y + ROW_H);

    y += ROW_H;
  });

  // End-of-table rule
  pdf.setDrawColor(MID);
  pdf.setLineWidth(0.5);
  pdf.line(M, y, M + CW, y);

  // Footer on last page
  drawFooter();

  return pdf;
}

export async function downloadReportPdf(options: ReportPdfOptions): Promise<void> {
  const pdf = await buildPdf(options);
  pdf.save(options.filename);
}

export async function generateReportPdfBase64(options: ReportPdfOptions): Promise<string> {
  const pdf = await buildPdf(options);
  // pdf.output('datauristring') in jsPDF v4 embeds a filename param that breaks
  // the backend regex. Use arraybuffer → btoa instead to get a stable format.
  const buf = pdf.output('arraybuffer') as ArrayBuffer;
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:application/pdf;base64,' + btoa(binary);
}
