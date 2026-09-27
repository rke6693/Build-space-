import type { ReactElement } from 'react';
import { Analytics } from './Analytics';
import { Causality } from './Causality';
import { Compare } from './Compare';
import { EventLog } from './Events';
import { IconChart, IconChevronLeft, IconChevronRight, IconCompare, IconGraph, IconInspect, IconList } from './icons';
import { Inspector } from './Inspector';
import { type RightTab, store, useUI } from './store';

const TABS: { id: RightTab; label: string; icon: ReactElement }[] = [
  { id: 'inspector', label: 'Inspect', icon: <IconInspect /> },
  { id: 'analytics', label: 'Analytics', icon: <IconChart /> },
  { id: 'events', label: 'Events', icon: <IconList /> },
  { id: 'causality', label: 'Causes', icon: <IconGraph /> },
  { id: 'compare', label: 'Compare', icon: <IconCompare /> },
];

export function RightPanel() {
  const open = useUI((s) => s.rightOpen);
  const tab = useUI((s) => s.rightTab);
  return (
    <aside className={`side right panel chrome ${open ? '' : 'collapsed'}`} aria-label="Inspector and analytics" data-tour="inspector">
      <div className="panel-head">
        <button className="icon-btn" aria-label={open ? 'Collapse panel' : 'Expand panel'} onClick={() => store.set({ rightOpen: !open })} title="Toggle panel (])">
          {open ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
        <div className="tabs" role="tablist" aria-label="Right panel sections">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} title={t.label} onClick={() => store.set({ rightTab: t.id, rightOpen: true })} data-testid={`right-tab-${t.id}`}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body" role="tabpanel">
        {tab === 'inspector' && <Inspector />}
        {tab === 'analytics' && <Analytics />}
        {tab === 'events' && <EventLog />}
        {tab === 'causality' && <Causality />}
        {tab === 'compare' && <Compare />}
      </div>
    </aside>
  );
}
