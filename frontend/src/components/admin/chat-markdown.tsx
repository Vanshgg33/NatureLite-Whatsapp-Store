import { cn } from '@/lib/utils';

// ── Markdown renderer ──────────────────────────────────────────────────────────

// Tokenises **bold**, `code`, and _italic_ in a single left-to-right pass.
function parseInlineStyles(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match bold first so ** doesn't get confused with single *
  const TOKEN_RE = /(\*\*[^*\n]+?\*\*|`[^`\n]+?`|_[^_\n]+?_)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;

  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    const token = m[1];
    if (token.startsWith('**'))
      parts.push(<strong key={k++} className="font-semibold text-gray-900 dark:text-white">{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`'))
      parts.push(<code key={k++} className="bg-gray-100 dark:bg-gray-700 text-[#c0392b] dark:text-red-400 px-1.5 py-0.5 rounded font-mono text-[11px] font-medium">{token.slice(1, -1)}</code>);
    else
      parts.push(<em key={k++} className="italic text-gray-500 dark:text-gray-400">{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
  return parts.length ? parts : [<span key={0}>{text}</span>];
}

function renderTable(tableText: string, key: string): React.ReactNode {
  const rows = tableText.trim().split('\n').filter(r => r.trim().startsWith('|'));
  if (rows.length < 2) return null;
  const parseRow = (row: string) => row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim());
  const headers = parseRow(rows[0]);
  const body = rows.slice(2).map(parseRow);
  return (
    <div key={key} className="overflow-x-auto my-3 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm">
      <table className="w-full text-xs">
        <thead className="bg-[#1E3D2B]/8 dark:bg-[#E8A838]/10">
          <tr>{headers.map((h, i) => <th key={i} className="px-3 py-2.5 text-left font-bold text-[#1E3D2B] dark:text-[#E8A838] whitespace-nowrap text-[11px] tracking-wide uppercase">{parseInlineStyles(h)}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={cn('border-t border-gray-100 dark:border-white/5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]', ri % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-gray-50/40 dark:bg-white/[0.02]')}>
              {row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-gray-700 dark:text-gray-300 text-[12px] leading-relaxed">{parseInlineStyles(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let seg = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    // ── Fenced code block ───────────────────────────────────────────────────
    if (t.startsWith('```')) {
      const lang = t.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <pre key={`cb-${seg++}`} className="bg-gray-900 dark:bg-black/40 rounded-xl p-4 overflow-x-auto my-3 border border-white/10">
          {lang && <div className="text-[10px] text-gray-500 font-mono mb-2 uppercase tracking-wider">{lang}</div>}
          <code className="text-xs text-green-300 font-mono whitespace-pre leading-relaxed">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // ── Markdown table ──────────────────────────────────────────────────────
    if (t.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const tbl = renderTable(tableLines.join('\n'), `tbl-${seg++}`);
      if (tbl) elements.push(tbl);
      continue;
    }

    // ── H1 ──────────────────────────────────────────────────────────────────
    if (t.startsWith('# ') && !t.startsWith('##')) {
      elements.push(
        <h2 key={`h1-${seg++}`} className="text-base font-bold text-[#1E3D2B] dark:text-white mt-5 mb-2 pb-1.5 border-b border-gray-200 dark:border-white/10">
          {parseInlineStyles(t.slice(2).trim())}
        </h2>
      );
      i++; continue;
    }

    // ── H2 ──────────────────────────────────────────────────────────────────
    if (t.startsWith('## ') && !t.startsWith('###')) {
      elements.push(
        <h3 key={`h2-${seg++}`} className="text-sm font-bold text-[#1E3D2B] dark:text-[#E8A838] mt-4 mb-1.5">
          {parseInlineStyles(t.slice(3).trim())}
        </h3>
      );
      i++; continue;
    }

    // ── H3 ──────────────────────────────────────────────────────────────────
    if (t.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${seg++}`} className="text-[13px] font-semibold text-[#1E3D2B] dark:text-[#E8A838] mt-3 mb-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E8A838] shrink-0" />
          {parseInlineStyles(t.slice(4).trim())}
        </h4>
      );
      i++; continue;
    }

    // ── Blockquote — colour by content ──────────────────────────────────────
    if (t.startsWith('> ')) {
      const content = t.slice(2).trim();
      const isWarning = /⚠️|❌|partial|unavailable|error/i.test(content);
      const isSuccess = /✅|sent|success/i.test(content);
      const isAction = /📧|ready.to.send/i.test(content);
      const cls = isWarning
        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 text-amber-900 dark:text-amber-300'
        : isSuccess
        ? 'bg-green-50 dark:bg-green-950/20 border-green-500 text-green-800 dark:text-green-300'
        : isAction
        ? 'bg-[#1E3D2B]/5 dark:bg-[#E8A838]/10 border-[#1E3D2B] dark:border-[#E8A838] text-[#1E3D2B] dark:text-[#E8A838]'
        : 'bg-blue-50 dark:bg-blue-950/20 border-blue-400 text-blue-800 dark:text-blue-300';
      elements.push(
        <div key={`bq-${seg++}`} className={`border-l-4 px-3 py-2 rounded-r-lg my-2 text-[13px] leading-relaxed ${cls}`}>
          {parseInlineStyles(content)}
        </div>
      );
      i++; continue;
    }

    // ── Horizontal rule ─────────────────────────────────────────────────────
    if (t === '---' || t === '***' || t === '___') {
      elements.push(<hr key={`hr-${seg++}`} className="my-3 border-gray-100 dark:border-white/10" />);
      i++; continue;
    }

    // ── Unordered list — collect consecutive items into one <ul> ────────────
    if (t.startsWith('- ') || t.startsWith('* ')) {
      const items: { content: string; nested: boolean }[] = [];
      while (i < lines.length) {
        const lt = lines[i];
        const ltt = lt.trim();
        if (ltt.startsWith('- ') || ltt.startsWith('* ')) {
          items.push({ content: ltt.slice(2).trim(), nested: lt.startsWith('  ') || lt.startsWith('\t') });
          i++;
        } else if (ltt === '' && i + 1 < lines.length && (lines[i + 1].trim().startsWith('- ') || lines[i + 1].trim().startsWith('* '))) {
          i++; // absorb blank line between list items
        } else {
          break;
        }
      }
      elements.push(
        <ul key={`ul-${seg++}`} className="my-2 space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className={cn('flex items-start gap-2.5 text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed', item.nested && 'pl-5')}>
              <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-[#1E3D2B]/40 dark:bg-[#E8A838]/60 shrink-0" />
              <span>{parseInlineStyles(item.content)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Ordered list — collect consecutive items into one <ol> ──────────────
    if (/^\d+\.\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const nm = lines[i].trim().match(/^\d+\.\s(.*)/);
        if (nm) items.push(nm[1].trim());
        i++;
      }
      elements.push(
        <ol key={`ol-${seg++}`} className="my-2 space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
              <span className="shrink-0 h-5 w-5 rounded-full bg-[#1E3D2B]/8 dark:bg-[#E8A838]/20 text-[#1E3D2B] dark:text-[#E8A838] text-[10px] font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
              <span>{parseInlineStyles(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Empty line ───────────────────────────────────────────────────────────
    if (t === '') { elements.push(<div key={`sp-${seg++}`} className="h-1.5" />); i++; continue; }

    // ── Paragraph ───────────────────────────────────────────────────────────
    elements.push(
      <p key={`p-${seg++}`} className="text-[13px] leading-relaxed text-gray-800 dark:text-gray-200 my-0.5">
        {parseInlineStyles(t)}
      </p>
    );
    i++;
  }

  return elements;
}
