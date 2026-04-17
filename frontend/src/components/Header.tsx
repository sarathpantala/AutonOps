import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Flag,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';

type WorkspaceOption = {
  id: number;
  name: string;
  environment_type: string;
};

type ClusterOption = {
  id: number;
  name: string;
  cluster_type: string;
};

type HeaderProps = {
  workspaces: WorkspaceOption[];
  selectedWorkspaceId: number | null;
  onWorkspaceChange: (workspaceId: number) => void;
  clusters: ClusterOption[];
  selectedClusterId: number | null;
  onClusterChange: (clusterId: number | null) => void;
  themeMode: 'light' | 'auto' | 'dark';
  onThemeChange: (theme: 'light' | 'auto' | 'dark') => void;
  onLogout: () => void;
};

export default function Header({
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  clusters,
  selectedClusterId,
  onClusterChange,
  themeMode,
  onThemeChange,
  onLogout,
}: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces],
  );
  const profileLabel = useMemo(() => {
    const source = selectedWorkspace?.name ?? 'AutonOps';
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [selectedWorkspace?.name]);

  useEffect(() => {
    if (!isProfileOpen) {
      return undefined;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isProfileOpen]);

  return (
    <header className="mb-6 flex min-h-14 flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedWorkspaceId ?? ''}
          onChange={(event) => onWorkspaceChange(Number(event.target.value))}
          className="ui-input min-w-[210px]"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>

        <select
          value={selectedClusterId ?? ''}
          onChange={(event) => onClusterChange(event.target.value ? Number(event.target.value) : null)}
          className="ui-input min-w-[210px]"
          disabled={clusters.length === 0}
        >
          <option value="">{clusters.length === 0 ? 'No clusters connected' : 'Select cluster'}</option>
          {clusters.map((cluster) => (
            <option key={cluster.id} value={cluster.id}>{cluster.name}</option>
          ))}
        </select>
      </div>

      <div className="relative" ref={menuRef}>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          onClick={() => setIsProfileOpen((value) => !value)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text-primary)]"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#111827] text-[11px] font-semibold text-white">{profileLabel}</span>
          <ChevronDown size={18} className="text-[var(--color-text-muted)]" />
        </motion.button>

        <AnimatePresence>
          {isProfileOpen ? (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="absolute right-0 top-12 z-30 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-2 shadow-[0_8px_18px_rgba(17,24,39,0.08)]"
            >
              <div className="px-3 pb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-light)]">Theme</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onThemeChange('light')}
                    className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition ${themeMode === 'light' ? 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]'}`}
                  >
                    <Sun size={16} />
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => onThemeChange('auto')}
                    className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition ${themeMode === 'auto' ? 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]'}`}
                  >
                    <Monitor size={16} />
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => onThemeChange('dark')}
                    className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition ${themeMode === 'dark' ? 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]'}`}
                  >
                    <Moon size={16} />
                    Dark
                  </button>
                </div>
              </div>

              <div className="my-1 h-px bg-[var(--color-border)]" />

              <div className="px-2">
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]">
                  <Settings size={18} />
                  Manage account
                </button>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]">
                  <Flag size={18} />
                  Feature flags
                </button>
              </div>

              <div className="my-1 h-px bg-[var(--color-border)]" />

              <div className="px-2">
                <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[#EF4444] transition hover:bg-[#FEE2E2]">
                  <LogOut size={18} />
                  Logout
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}
