import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Layers,
  LayoutDashboard,
  Plus,
  Server,
  Sparkles,
  Zap,
} from 'lucide-react';

type SidebarProps = {
  activeSection: string;
  onSelect: (section: string) => void;
  workspaceName: string;
  userLabel: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Incidents', icon: AlertTriangle },
  { label: 'Services', icon: Activity },
  { label: 'Clusters', icon: Server },
  { label: 'Actions', icon: Zap },
  { label: 'Workspace', icon: Layers },
  { label: 'Add Cluster', icon: Plus },
  { label: 'Chat', icon: Sparkles },
];

export default function Sidebar({
  activeSection,
  onSelect,
  workspaceName,
  userLabel,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] py-5 transition-[width] duration-200 ease-in-out lg:flex ${collapsed ? 'w-[72px] px-2' : 'w-[220px] px-3'}`}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        className="absolute -right-3 top-6 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] shadow-sm transition hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
      <div className={`mb-5 flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-1`}>
        <div className="flex items-center gap-3 overflow-hidden">
          <img src="/favicon.svg" alt="AutonOps" className="h-8 w-8 shrink-0" />
          {!collapsed ? (
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">AutonOps</p>
              <p className="text-xs text-[var(--color-text-muted)]">AI-powered SRE</p>
            </div>
          ) : null}
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
                className={`flex w-full items-center rounded-md py-2 text-left text-sm transition-colors ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${active ? 'bg-[#E5E7EB] font-semibold text-[#111827]' : 'font-medium text-[#374151] hover:bg-[#F3F4F6]'}`}
              >
                <Icon size={19} className={active ? 'text-[#111827]' : 'text-[#6B7280]'} />
                {!collapsed ? <span>{item.label}</span> : null}
              </button>

              {collapsed ? (
                <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 rounded-md bg-[#111827] px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
                  {item.label}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-[var(--color-border)] pt-4">
        {!collapsed ? (
          <div className="px-2">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-light)]">Workspace</p>
            <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{workspaceName}</p>
          </div>
        ) : null}
        <div className={`flex rounded-md px-2 py-2 ${collapsed ? 'justify-center' : 'items-center gap-3'}`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-xs font-semibold text-white">{userLabel}</div>
          {!collapsed ? (
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Operator</p>
              <p className="text-xs text-[var(--color-text-muted)]">Workspace admin</p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
