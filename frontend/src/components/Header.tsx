import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Flag,
  Layers,
  Link,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  Trash2,
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
  pageTitle: string;
  pageSubtitle: string;
  workspaces: WorkspaceOption[];
  selectedWorkspaceId: number | null;
  onWorkspaceChange: (workspaceId: number) => void;
  onCreateWorkspace: () => void;
  clusters: ClusterOption[];
  selectedClusterId: number | null;
  onClusterChange: (clusterId: number | null) => void;
  onConnectCluster: () => void;
  onDeleteCluster: (clusterId: number) => Promise<void>;
  userName: string;
  userEmail: string;
  userAvatarUrl: string;
  themeMode: 'light' | 'auto' | 'dark';
  onThemeChange: (theme: 'light' | 'auto' | 'dark') => void;
  onLogout: () => void;
};

function DropdownContainer({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="absolute right-0 top-12 z-30 w-72 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-2 shadow-[0_8px_18px_rgba(17,24,39,0.08)]"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function Header({
  pageTitle,
  pageSubtitle,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  onCreateWorkspace,
  clusters,
  selectedClusterId,
  onClusterChange,
  onConnectCluster,
  onDeleteCluster,
  userName,
  userEmail,
  userAvatarUrl,
  themeMode,
  onThemeChange,
  onLogout,
}: HeaderProps) {
  const [openMenu, setOpenMenu] = useState<'workspace' | 'cluster' | 'profile' | null>(null);
  const [clusterToDelete, setClusterToDelete] = useState<ClusterOption | null>(null);
  const [deleteClusterBusy, setDeleteClusterBusy] = useState(false);
  const [deleteClusterError, setDeleteClusterError] = useState('');
  const headerRef = useRef<HTMLDivElement | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces],
  );

  const selectedCluster = useMemo(
    () => clusters.find((cluster) => cluster.id === selectedClusterId) ?? null,
    [selectedClusterId, clusters],
  );

  useEffect(() => {
    if (!openMenu) {
      return undefined;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [openMenu]);

  const menuButtonClass =
    'inline-flex h-10 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-text-primary)] transition duration-150 ease-out hover:bg-[var(--color-surface-elevated)]';

  return (
    <header className="mb-6 border-b border-[var(--color-border)] pb-4" ref={headerRef}>
      <div className="flex min-h-14 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{pageTitle}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{pageSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={() => setOpenMenu((current) => (current === 'workspace' ? null : 'workspace'))}
              className={menuButtonClass}
            >
              <Layers size={16} className="text-[var(--color-text-muted)]" />
              <span className="max-w-[140px] truncate">{selectedWorkspace?.name ?? 'Select workspace'}</span>
              <ChevronDown size={16} className="text-[var(--color-text-light)]" />
            </motion.button>

            <DropdownContainer open={openMenu === 'workspace'}>
              <div className="px-2">
                {workspaces.map((workspace) => {
                  const active = workspace.id === selectedWorkspaceId;
                  return (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => {
                        onWorkspaceChange(workspace.id);
                        setOpenMenu(null);
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-[var(--color-text-secondary)] transition duration-150 ease-out hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
                    >
                      <div>
                        <p className={`font-medium ${active ? 'text-[var(--color-text-primary)]' : ''}`}>{workspace.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{workspace.environment_type}</p>
                      </div>
                      {active ? <Check size={16} className="text-[var(--color-primary)]" /> : null}
                    </button>
                  );
                })}
              </div>

              <div className="my-1 h-px bg-[var(--color-border)]" />

              <div className="px-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onCreateWorkspace();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-[var(--color-primary-strong)] transition duration-150 ease-out hover:bg-[#F0FDF4]"
                >
                  + Create workspace
                </button>
              </div>
            </DropdownContainer>
          </div>

          <div className="relative">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={() => setOpenMenu((current) => (current === 'cluster' ? null : 'cluster'))}
              className={menuButtonClass}
            >
              <Link size={16} className="text-[var(--color-text-muted)]" />
              <span className="max-w-[140px] truncate">{selectedCluster?.name ?? 'Select cluster'}</span>
              <ChevronDown size={16} className="text-[var(--color-text-light)]" />
            </motion.button>

            <DropdownContainer open={openMenu === 'cluster'}>
              <div className="px-2">
                {clusters.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-[var(--color-text-muted)]">No connected clusters.</div>
                ) : (
                  clusters.map((cluster) => {
                    const active = cluster.id === selectedClusterId;
                    return (
                      <button
                        key={cluster.id}
                        type="button"
                        onClick={() => {
                          onClusterChange(cluster.id);
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-[var(--color-text-secondary)] transition duration-150 ease-out hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
                      >
                        <div>
                          <p className={`font-medium ${active ? 'text-[var(--color-text-primary)]' : ''}`}>{cluster.name}</p>
                          <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{cluster.cluster_type}</p>
                        </div>
                        {active ? <Check size={16} className="text-[var(--color-primary)]" /> : null}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="my-1 h-px bg-[var(--color-border)]" />

              <div className="px-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onConnectCluster();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-[var(--color-primary-strong)] transition duration-150 ease-out hover:bg-[#F0FDF4]"
                >
                  + Connect cluster
                </button>
                {selectedCluster ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteClusterError('');
                      setClusterToDelete(selectedCluster);
                      setOpenMenu(null);
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-red-600 transition duration-150 ease-out hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                    Delete selected cluster
                  </button>
                ) : null}
              </div>
            </DropdownContainer>
          </div>

          <div className="relative">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={() => setOpenMenu((current) => (current === 'profile' ? null : 'profile'))}
              className={menuButtonClass}
            >
              <img src={userAvatarUrl} alt={userName} className="h-7 w-7 rounded-full border border-[var(--color-border)] object-cover" />
              <ChevronDown size={16} className="text-[var(--color-text-light)]" />
            </motion.button>

            <DropdownContainer open={openMenu === 'profile'}>
              <div className="px-3 pb-2">
                <div className="flex items-center gap-3 rounded-md px-2 py-2">
                  <img src={userAvatarUrl} alt={userName} className="h-9 w-9 rounded-full border border-[var(--color-border)] object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{userName}</p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">{userEmail}</p>
                  </div>
                </div>

                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-light)]">Theme</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onThemeChange('light')}
                    className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition duration-150 ease-out ${themeMode === 'light' ? 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]'}`}
                  >
                    <Sun size={16} />
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => onThemeChange('auto')}
                    className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition duration-150 ease-out ${themeMode === 'auto' ? 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]'}`}
                  >
                    <Monitor size={16} />
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => onThemeChange('dark')}
                    className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition duration-150 ease-out ${themeMode === 'dark' ? 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]'}`}
                  >
                    <Moon size={16} />
                    Dark
                  </button>
                </div>
              </div>

              <div className="my-1 h-px bg-[var(--color-border)]" />

              <div className="px-2">
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--color-text-secondary)] transition duration-150 ease-out hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]">
                  <Settings size={18} />
                  Manage account
                </button>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--color-text-secondary)] transition duration-150 ease-out hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]">
                  <Flag size={18} />
                  Feature flags
                </button>
              </div>

              <div className="my-1 h-px bg-[var(--color-border)]" />

              <div className="px-2">
                <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[#EF4444] transition duration-150 ease-out hover:bg-[#FEE2E2]">
                  <LogOut size={18} />
                  Sign out
                </button>
              </div>
            </DropdownContainer>
          </div>
        </div>
      </div>

      {clusterToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
            <div className="mb-3 flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Delete Cluster</h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Are you sure you want to delete this cluster?
                </p>
              </div>
            </div>

            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className="font-medium">{clusterToDelete.name}</span> will be permanently removed. This action cannot be undone.
            </div>

            {deleteClusterError ? (
              <p className="mt-3 text-xs text-red-600">{deleteClusterError}</p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (deleteClusterBusy) return;
                  setClusterToDelete(null);
                  setDeleteClusterError('');
                }}
                className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] transition duration-150 hover:bg-[var(--color-surface-elevated)]"
                disabled={deleteClusterBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDeleteClusterError('');
                  setDeleteClusterBusy(true);
                  try {
                    await onDeleteCluster(clusterToDelete.id);
                    setClusterToDelete(null);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Failed to delete cluster.';
                    setDeleteClusterError(message);
                  } finally {
                    setDeleteClusterBusy(false);
                  }
                }}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition duration-150 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={deleteClusterBusy}
              >
                {deleteClusterBusy ? 'Deleting...' : 'Delete cluster'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
