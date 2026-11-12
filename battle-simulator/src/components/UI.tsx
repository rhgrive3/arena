import { useEffect, useId, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, X } from 'lucide-react';

export function Crest({ className = '' }: { className?: string }) {
  return <svg className={`crest ${className}`} viewBox="0 0 48 56" fill="none" aria-hidden="true">
    <path d="M24 3 43 10v19c0 10-11 18-19 23C16 47 5 39 5 29V10L24 3Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="m24 8 14 5v15c0 8-8 14-14 19-6-5-14-11-14-19V13L24 8Z" fill="currentColor" fillOpacity=".08" />
    <path d="m24 13 3 6-2 14h5v3h-5v6h-2v-6h-5v-3h5l-2-14 3-6Z" fill="currentColor" />
    <path d="m13 20 5 3v4l-5-3v-4Zm22 0-5 3v4l5-3v-4Z" fill="currentColor" />
  </svg>;
}

export function Brand({ onClick, compact = false }: { onClick?: () => void; compact?: boolean }) {
  return <button className={`brand ${compact ? 'compact' : ''}`} onClick={onClick} aria-label="メインメニューへ">
    <Crest /><span>EPIC BATTLE<small>SIMULATOR</small></span>
  </button>;
}

export function PrimaryButton({ children, onClick, disabled, className = '', icon = true }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; icon?: boolean;
}) {
  return <button className={`primary-button ${className}`} onClick={onClick} disabled={disabled}>
    <span>{children}</span>{icon && <ArrowUpRight size={22} strokeWidth={1.5} />}
  </button>;
}

export function Dialog({ title, eyebrow, onClose, children, className = '' }: {
  title: string; eyebrow?: string; onClose: () => void; children: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? [])];
      if (!elements.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handle, true);
    return () => { document.removeEventListener('keydown', handle, true); previous?.focus(); };
  }, []);
  return <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div ref={ref} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} onKeyDown={event => event.stopPropagation()}>
      <div className="dialog-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="閉じる"><X size={22} /></button></div>
      {children}
    </motion.div>
  </motion.div>;
}

export function Coin({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="coin" aria-hidden="true"><path d="m10 1.5 7.5 4.25v8.5L10 18.5l-7.5-4.25v-8.5L10 1.5Z" stroke="currentColor" strokeWidth="1.4" /><path d="m10 5 4.4 2.5v5L10 15l-4.4-2.5v-5L10 5Z" fill="currentColor" fillOpacity=".2" /><path d="M10 7v6m-1.7-4.4L10 7l1.7 1.6M8.3 11.4 10 13l1.7-1.6" stroke="currentColor" strokeWidth="1.3" /></svg>;
}

export function StatBars({ hp, damage, range, speed }: { hp: number; damage: number; range: number; speed: number }) {
  return <div className="stat-bars">{[
    ['体力', hp, 700], ['攻撃力', damage, 80], ['射程', range, 40], ['移動速度', speed, 8],
  ].map(([label, value, max]) => <div className="unit-stat" key={label}><span>{label}</span><div className="stat-track"><i style={{ width: `${Math.max(4, Math.min(100, Number(value) / Number(max) * 100))}%` }} /></div><b>{value}</b></div>)}</div>;
}

export function fmtTime(time: number) {
  return `${Math.floor(time / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}`;
}