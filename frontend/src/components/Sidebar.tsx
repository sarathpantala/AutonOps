import {
  Activity,
  AlertTriangle,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import autonopsLogo from '../assets/autonops-logo.svg';

type SidebarProps = {
  activeSection: string;
  onSelect: (section: string) => void;
  userLabel: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Incidents', icon: AlertTriangle },
  { label: 'Services', icon: Activity },
  { label: 'Chat', icon: Sparkles },
];

function CollapsedTooltip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 rounded-md bg-[#111827] px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm invisible transition-all duration-150 delay-150 group-hover:visible group-hover:opacity-100 group-hover:translate-x-0">
      {label}
    </div>
  );
}

export default function Sidebar({
  activeSection,
  onSelect,
  userLabel,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] py-5 transition-[width] duration-200 ease-in-out lg:flex ${collapsed ? 'w-[72px] px-2' : 'w-[220px] px-3'}`}
    >
      <div className={`mb-5 px-1 ${collapsed ? 'flex justify-center' : ''}`}>
        <div className="group relative">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`flex w-full items-center overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 ease-out hover:scale-[1.05] hover:bg-[var(--color-surface-elevated)] ${collapsed ? 'h-11 w-11 justify-center px-0' : 'gap-3 px-3 py-2.5 text-left'}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'AutonOps' : undefined}
          >
            <img src={autonopsLogo} alt="AutonOps" className="h-8 w-8 shrink-0" />
            <div className={`min-w-0 transition-all duration-200 ease-out ${collapsed ? 'max-w-0 -translate-x-2 opacity-0' : 'max-w-[140px] translate-x-0 opacity-100'}`}>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">AutonOps</p>
              <p className="text-xs text-[var(--color-text-muted)]">AI-powered SRE</p>
            </div>
          </button>

          {collapsed ? <CollapsedTooltip label="AutonOps" /> : null}
        </div>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = item.label === activeSection;
          const Icon = item.icon;
          return (
            <div key={item.label} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(item.label)}
                title={collapsed ? item.label : undefined}
                className={`flex w-full items-center rounded-md py-2 text-left text-sm transition-all duration-200 ease-out ${collapsed ? 'justify-center px-0 hover:scale-[1.05]' : 'gap-3 px-3'} ${active ? 'bg-[#E5E7EB] font-semibold text-[#111827]' : 'font-medium text-[#374151] hover:bg-[#F3F4F6]'}`}
              >
                <Icon size={19} className={active ? 'text-[#111827]' : 'text-[#6B7280]'} />
                <span className={`transition-all duration-200 ease-out ${collapsed ? 'max-w-0 -translate-x-2 overflow-hidden opacity-0' : 'max-w-[120px] translate-x-0 opacity-100'}`}>
                  {item.label}
                </span>
              </button>

              {collapsed ? <CollapsedTooltip label={item.label} /> : null}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-[var(--color-border)] pt-4">
        <div className="group relative">
          <div className={`flex rounded-md px-2 py-2 transition-all duration-200 ease-out ${collapsed ? 'justify-center' : 'items-center gap-3'}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-xs font-semibold text-white">{userLabel}</div>
            <div className={`transition-all duration-200 ease-out ${collapsed ? 'max-w-0 -translate-x-2 overflow-hidden opacity-0' : 'max-w-[120px] translate-x-0 opacity-100'}`}>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Operator</p>
              <p className="text-xs text-[var(--color-text-muted)]">Workspace admin</p>
            </div>
          </div>

          {collapsed ? <CollapsedTooltip label="Operator" /> : null}
        </div>
      </div>
    </aside>
  );
}
