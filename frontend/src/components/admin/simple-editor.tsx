'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Heading2, Heading3, Link, Minus } from 'lucide-react';

interface SimpleEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function SimpleEditor({ value, onChange, placeholder = 'Write here...', minHeight = 180 }: SimpleEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    if (!editorRef.current) return;
    if (isInternalUpdate.current) { isInternalUpdate.current = false; return; }
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const exec = useCallback((command: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleInput = () => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    onChange(editorRef.current.innerHTML);
  };

  const handleLink = () => {
    const url = prompt('Enter URL:');
    if (url) exec('createLink', url);
  };

  const tools: { icon: React.ReactNode; action: () => void; title: string }[] = [
    { icon: <Bold className="h-3.5 w-3.5" />, action: () => exec('bold'), title: 'Bold' },
    { icon: <Italic className="h-3.5 w-3.5" />, action: () => exec('italic'), title: 'Italic' },
    { icon: <Underline className="h-3.5 w-3.5" />, action: () => exec('underline'), title: 'Underline' },
    { icon: <Heading2 className="h-3.5 w-3.5" />, action: () => exec('formatBlock', '<h2>'), title: 'Heading 2' },
    { icon: <Heading3 className="h-3.5 w-3.5" />, action: () => exec('formatBlock', '<h3>'), title: 'Heading 3' },
    { icon: <List className="h-3.5 w-3.5" />, action: () => exec('insertUnorderedList'), title: 'Bullet list' },
    { icon: <ListOrdered className="h-3.5 w-3.5" />, action: () => exec('insertOrderedList'), title: 'Numbered list' },
    { icon: <Link className="h-3.5 w-3.5" />, action: handleLink, title: 'Link' },
    { icon: <Minus className="h-3.5 w-3.5" />, action: () => exec('insertHorizontalRule'), title: 'Divider' },
  ];

  return (
    <div className="border border-input rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/40">
        {tools.map((t) => (
          <button
            key={t.title}
            type="button"
            title={t.title}
            onMouseDown={(e) => { e.preventDefault(); t.action(); }}
            className="p-1.5 rounded hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className="px-3 py-2.5 text-sm outline-none prose prose-sm max-w-none
          [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground
          [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1
          [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
          [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
          [&_a]:text-primary [&_a]:underline"
      />
    </div>
  );
}
