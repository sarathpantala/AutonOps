import { useState } from 'react';
import { API_BASE_URL } from '../lib/api';

interface WorkspaceOnboardingProps {
  onWorkspaceCreated: (workspaceId: number, workspaceName: string) => void;
}

export default function WorkspaceOnboarding({ onWorkspaceCreated }: WorkspaceOnboardingProps) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!workspaceName.trim()) {
      setError('Please enter a workspace name.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/workspaces/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: workspaceName.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? 'Failed to create workspace.');
      }

      onWorkspaceCreated(data.id, data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center px-6 py-12">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-20 h-80 w-80 rounded-full bg-gradient-to-br from-sky-500 via-blue-500 to-transparent opacity-20 blur-3xl animate-pulse" />
        <div className="absolute top-1/2 -right-24 h-96 w-96 rounded-full bg-gradient-to-bl from-indigo-500 via-purple-500 to-transparent opacity-15 blur-3xl animate-pulse [animation-delay:1s]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-white/[0.08] p-8 shadow-2xl">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-white">Create your workspace</h1>
            <p className="mt-3 text-sm text-slate-400">
              Name your first workspace. You can manage multiple workspaces and teams later in settings.
            </p>
          </div>

          {/* Form */}
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="workspace-name" className="block text-sm font-medium text-slate-200 mb-2">
                Workspace name
              </label>
              <input
                id="workspace-name"
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g., Production, Staging, Development"
                className="h-11 w-full rounded-lg bg-white/[0.05] px-4 text-sm text-white placeholder:text-slate-500 outline-none transition border border-white/10 focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <p className="text-sm text-red-300 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-sky-600 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-500/20"
            >
              {loading ? 'Creating workspace...' : 'Create Workspace'}
            </button>
          </form>

          {/* Help text */}
          <p className="mt-6 text-center text-xs text-slate-500">
            You'll configure clusters and services next.
          </p>
        </div>
      </div>
    </div>
  );
}
