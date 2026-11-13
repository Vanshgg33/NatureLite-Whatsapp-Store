'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { parseExpr, printExpr, type Node } from '@/lib/billing/formula-engine';
import { cn } from '@/lib/utils';

export interface NameOption { name: string; label: string }
interface Ctx { names: NameOption[]; disabled?: boolean }

const FN_LABEL: Record<string, string> = {
  round: 'round to nearest', floor: 'round down', ceil: 'round up', min: 'smaller of', max: 'larger of', abs: 'ignore the minus sign of',
};
const OP_GROUPS: Array<[string, Array<[string, string]>]> = [
  ['Arithmetic', [['+', '+'], ['-', '−'], ['*', '×'], ['/', '÷'], ['%', 'remainder of ÷']]],
  ['Compare', [['<', 'is less than'], ['>', 'is more than'], ['<=', 'is at most'], ['>=', 'is at least'], ['==', 'equals'], ['!=', 'is not']]],
  ['Combine', [['&&', 'and'], ['||', 'or']]],
];
/** Native selects are as wide as their longest option; size to the shown label instead. */
const fit = (label: string, min = 4) => ({ width: `${Math.min(36, Math.max(min, label.length + 3))}ch` });
const OP_LABEL: Record<string, string> = Object.fromEntries(OP_GROUPS.flatMap(([, ops]) => ops));
const selectCls = 'rounded-md border border-transparent bg-transparent py-0.5 pl-1 pr-0.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f] disabled:opacity-100';

/**
 * Edits one formula as blocks: pick names, numbers, operators and rounding from dropdowns instead of typing.
 * The text formula stays the source of truth; every edit prints the tree back to text.
 */
export function FormulaBuilder({ value, names, disabled, onChange }: { value: string; names: NameOption[]; disabled?: boolean; onChange: (text: string) => void }) {
  const parsed = useMemo(() => { try { return { ast: parseExpr(value) }; } catch (e: any) { return { error: String(e.message) }; } }, [value]);
  if ('error' in parsed) {
    return <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-800">This formula cannot be shown as blocks ({parsed.error}). Pick a ready-made choice below or fix the text under Advanced.</p>;
  }
  return (
    <div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2"><Block node={parsed.ast} onChange={n => onChange(printExpr(n))} ctx={{ names, disabled }} /></div>
      <p className="mt-1 break-words font-mono text-[11px] text-gray-500">{value}</p>
    </div>
  );
}

function Block({ node, onChange, ctx }: { node: Node; onChange: (n: Node) => void; ctx: Ctx }) {
  const first = ctx.names[0]?.name ?? 'qty';
  const sub = (n: Node, set: (x: Node) => void) => <Block node={n} onChange={set} ctx={ctx} />;
  const group = (children: ReactNode) => <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-1.5 py-1">{children}</span>;
  const word = (w: string) => <span className="text-xs text-gray-500">{w}</span>;

  let body: ReactNode;
  switch (node.t) {
    case 'num': body = <NumberChip v={node.v} disabled={ctx.disabled} onChange={v => onChange({ t: 'num', v })} />; break;
    case 'var': {
      const known = ctx.names.some(n => n.name === node.n);
      body = (
        <select aria-label="Value" style={fit(ctx.names.find(n => n.name === node.n)?.label ?? node.n)} disabled={ctx.disabled} value={node.n} onChange={e => onChange({ t: 'var', n: e.target.value })} className={cn(selectCls, 'bg-[#2d7a4f]/10 text-[#1A3625]')}>
          {!known && <option value={node.n}>{node.n}</option>}
          {ctx.names.map(n => <option key={n.name} value={n.name}>{n.label}</option>)}
        </select>
      );
      break;
    }
    case 'un':
      body = group(<>{word(node.op === '-' ? 'minus' : 'not')}{sub(node.e, e => onChange({ ...node, e }))}</>);
      break;
    case 'bin':
      body = group(<>
        {sub(node.l, l => onChange({ ...node, l }))}
        <select aria-label="Operator" style={fit(OP_LABEL[node.op] ?? node.op, 7)} disabled={ctx.disabled} value={node.op} onChange={e => onChange({ ...node, op: e.target.value })} className={cn(selectCls, 'bg-gray-100')}>
          {OP_GROUPS.map(([g, ops]) => <optgroup key={g} label={g}>{ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}
        </select>
        {sub(node.r, r => onChange({ ...node, r }))}
      </>);
      break;
    case 'call':
      body = group(<>
        <select aria-label="Function" style={fit(FN_LABEL[node.f] ?? node.f)} disabled={ctx.disabled} value={node.f} className={cn(selectCls, 'bg-gray-100')}
          onChange={e => {
            const f = e.target.value, want = f === 'min' || f === 'max' ? 2 : 1;
            const args = [...node.args.slice(0, want)];
            while (args.length < want) args.push({ t: 'num', v: 0 });
            onChange({ t: 'call', f, args });
          }}>
          {Object.entries(FN_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {node.args.map((a, i) => <span key={i} className="inline-flex items-center gap-1.5">{i > 0 && word('and')}{sub(a, x => onChange({ ...node, args: node.args.map((o, j) => (j === i ? x : o)) }))}</span>)}
      </>);
      break;
    case 'if':
      body = group(<>
        {word('if')}{sub(node.c, c => onChange({ ...node, c }))}
        {word('then')}{sub(node.a, a => onChange({ ...node, a }))}
        {word('otherwise')}{sub(node.b, b => onChange({ ...node, b }))}
      </>);
      break;
  }

  const menu: Array<[string, string, () => void]> = [
    ['calc', 'Add a calculation (+ − × ÷)', () => onChange({ t: 'bin', op: '+', l: node, r: { t: 'num', v: 0 } })],
    ['round', 'Round this', () => onChange({ t: 'call', f: 'round', args: [node] })],
    ['if', 'Make this conditional (if / otherwise)', () => onChange({ t: 'if', c: { t: 'var', n: first }, a: node, b: { t: 'num', v: 0 } })],
  ];
  if (node.t !== 'num') menu.push(['num', 'Replace with a number', () => onChange({ t: 'num', v: 0 })]);
  if (node.t !== 'var') menu.push(['var', 'Replace with a value', () => onChange({ t: 'var', n: first })]);
  if (node.t === 'bin') menu.push(['l', 'Keep only the left part', () => onChange(node.l)], ['r', 'Keep only the right part', () => onChange(node.r)]);
  if (node.t === 'call') menu.push(['inner', 'Remove this function', () => onChange(node.args[0])]);
  if (node.t === 'un') menu.push(['inner', 'Remove the sign', () => onChange(node.e)]);
  if (node.t === 'if') menu.push(['then', 'Keep only the “then” part', () => onChange(node.a)], ['else', 'Keep only the “otherwise” part', () => onChange(node.b)]);

  return (
    <span className="inline-flex flex-wrap items-center gap-0.5 align-middle">
      {body}
      {!ctx.disabled && (
        <select aria-label="Change this part" value="" onChange={e => menu.find(m => m[0] === e.target.value)?.[2]()}
          className="w-5 appearance-none cursor-pointer rounded-md border-0 bg-transparent py-0.5 text-center text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]">
          <option value="">⋯</option>
          {menu.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      )}
    </span>
  );
}

function NumberChip({ v, onChange, disabled }: { v: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [txt, setTxt] = useState(String(v));
  useEffect(() => { if (Number(txt || 0) !== v) setTxt(String(v)); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input aria-label="Number" inputMode="decimal" disabled={disabled} value={txt} size={Math.max(2, txt.length)}
      className="rounded-md bg-amber-100 px-1.5 py-0.5 text-center text-sm font-medium text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f] disabled:opacity-100"
      onChange={e => {
        const s = e.target.value;
        if (!/^\d*\.?\d*$/.test(s)) return;
        setTxt(s);
        const n = s === '' || s === '.' ? 0 : Number(s);
        if (n !== v) onChange(n);
      }} />
  );
}
