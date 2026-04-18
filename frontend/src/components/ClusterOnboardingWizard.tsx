import { ChangeEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../lib/api';

type ClusterType = 'eks' | 'gke' | 'openshift' | 'kind';
type AuthMethod = 'kubeconfig' | 'service-account';

type WorkspaceOption = {
  id: number;
  name: string;
  environment_type: string;
};

type ClusterRecord = {
  id: number;
  name: string;
  cluster_type: string;
  status: string;
  workspace_id: number;
  created_at: string;
};

type Props = {
  workspaces: WorkspaceOption[];
  selectedWorkspaceId: number | null;
  onWorkspaceChange: (workspaceId: number) => void;
  onClusterCreated: (cluster: ClusterRecord) => void;
};

const EksIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
    <path fill="#FF9900" d="M12 2L2 7l10 5 8-4v6h2V7L12 2z" />
  </svg>
);

const GkeIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
    <path fill="#4285F4" d="M12 2l8 4v8l-8 4-8-4V6z" />
    <circle cx="12" cy="12" r="3" fill="#34A853" />
  </svg>
);

const OpenShiftIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
    <path fill="#EE0000" d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5a4 4 0 110 8h-2a4 4 0 010-8h2z" />
  </svg>
);

const KindIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
    <rect x="3" y="6" width="18" height="12" rx="2" fill="#3B82F6" />
    <rect x="6" y="9" width="4" height="4" fill="white" />
    <rect x="14" y="9" width="4" height="4" fill="white" />
  </svg>
);

const options: Array<{ value: ClusterType; label: string; helper: string; icon: () => JSX.Element }> = [
  { value: 'eks', label: 'EKS', helper: 'Amazon Elastic Kubernetes Service', icon: EksIcon },
  { value: 'gke', label: 'GKE', helper: 'Google Kubernetes Engine', icon: GkeIcon },
  { value: 'openshift', label: 'OpenShift', helper: 'Red Hat OpenShift', icon: OpenShiftIcon },
  { value: 'kind', label: 'Kind', helper: 'Kubernetes in Docker', icon: KindIcon },
];

function toErrorMessage(detail: unknown, fallback: string): string {
  if (!detail) {
    return fallback;
  }

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    const first = detail[0];
    if (typeof first === 'string') {
      return first;
    }
    if (first && typeof first === 'object') {
      const firstObj = first as Record<string, unknown>;
      if (typeof firstObj.msg === 'string') {
        return firstObj.msg;
      }
    }
    return fallback;
  }

  if (typeof detail === 'object') {
    const detailObj = detail as Record<string, unknown>;
    if (typeof detailObj.message === 'string') {
      return detailObj.message;
    }
    if (typeof detailObj.msg === 'string') {
      return detailObj.msg;
    }
    return fallback;
  }

  return fallback;
}

function getAuthHeaders() {
  const storedToken = localStorage.getItem('access_token');
  const cookieMatch = document.cookie.match(/(?:^|; )access_token=([^;]*)/);
  const accessToken = storedToken || cookieMatch?.[1] || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

async function readSelectedFile(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) {
    return null;
  }

  return {
    name: file.name,
    content: await file.text(),
  };
}

export default function ClusterOnboardingWizard({ workspaces, selectedWorkspaceId, onWorkspaceChange, onClusterCreated }: Props) {
  const [clusterType, setClusterType] = useState<ClusterType>('eks');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('kubeconfig');
  const [clusterName, setClusterName] = useState('');
  const [kubeconfigContent, setKubeconfigContent] = useState('');
  const [serviceAccountText, setServiceAccountText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const parseServiceAccountPayload = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(serviceAccountText) as Record<string, unknown>;
    } catch {
      throw new Error('Service account JSON is invalid.');
    }

    const apiServerUrl = typeof parsed.apiServerUrl === 'string' ? parsed.apiServerUrl : typeof parsed.api_server_url === 'string' ? parsed.api_server_url : '';
    const bearerToken = typeof parsed.bearerToken === 'string' ? parsed.bearerToken : typeof parsed.bearer_token === 'string' ? parsed.bearer_token : '';

    if (!apiServerUrl || !bearerToken) {
      throw new Error('Service account JSON must include apiServerUrl and bearerToken.');
    }

    return {
      api_server_url: apiServerUrl,
      bearer_token: bearerToken,
      ca_cert: typeof parsed.caCert === 'string' ? parsed.caCert : typeof parsed.ca_cert === 'string' ? parsed.ca_cert : undefined,
      namespace: typeof parsed.namespace === 'string' ? parsed.namespace : undefined,
      skip_tls_verify: typeof parsed.skipTlsVerify === 'boolean' ? parsed.skipTlsVerify : typeof parsed.skip_tls_verify === 'boolean' ? parsed.skip_tls_verify : false,
    };
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = await readSelectedFile(event);
    if (!file) {
      return;
    }
    setUploadedFileName(file.name);
    if (authMethod === 'kubeconfig') {
      setKubeconfigContent(file.content);
    } else {
      setServiceAccountText(file.content);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!selectedWorkspaceId) {
        throw new Error('Select a workspace first.');
      }
      if (!clusterName.trim()) {
        throw new Error('Cluster name is required.');
      }

      const payload = authMethod === 'kubeconfig'
        ? {
            cluster_name: clusterName.trim(),
            cluster_type: clusterType,
            auth_method: authMethod,
            kubeconfig_content: kubeconfigContent,
          }
        : {
            cluster_name: clusterName.trim(),
            cluster_type: clusterType,
            auth_method: authMethod,
            service_account: parseServiceAccountPayload(),
          };

      const validateResponse = await fetch(`${API_BASE_URL}/k8s/onboarding/validate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const validateData = await validateResponse.json();
      if (!validateResponse.ok) {
        throw new Error(toErrorMessage(validateData.detail, 'Failed to validate cluster.'));
      }

      const confirmResponse = await fetch(`${API_BASE_URL}/k8s/onboarding/confirm?workspace_id=${selectedWorkspaceId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const confirmData = await confirmResponse.json();
      if (!confirmResponse.ok) {
        throw new Error(toErrorMessage(confirmData.detail, 'Failed to confirm cluster.'));
      }

      onClusterCreated({
        id: Number(confirmData.cluster_id),
        name: clusterName.trim(),
        cluster_type: clusterType,
        status: 'connected',
        workspace_id: selectedWorkspaceId,
        created_at: new Date().toISOString(),
      });
      setSuccess('Cluster validated and added successfully.');
      setClusterName('');
      setKubeconfigContent('');
      setServiceAccountText('');
      setUploadedFileName('');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to add cluster.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="ui-card p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Add cluster</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Select type, configure authentication, then validate the connection.</p>
      </div>

      <div className="ui-card p-6">
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Workspace</label>
            <select value={selectedWorkspaceId ?? ''} onChange={(event) => onWorkspaceChange(Number(event.target.value))} className="ui-input w-full">
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Cluster type</label>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {options.map((option) => {
                const active = option.value === clusterType;
                const Icon = option.icon;
                return (
                  <motion.button
                    key={option.value}
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    onClick={() => setClusterType(option.value)}
                    className={`rounded-lg border px-3 py-3 text-left transition duration-150 ease-out ${active ? 'border-[#22C55E] bg-[#F0FDF4] shadow-sm' : 'border-[var(--color-border)] bg-white hover:bg-[#F9FAFB]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${active ? 'border-[#22C55E] bg-[#DCFCE7]' : 'border-gray-200 bg-gray-50'}`}>
                        <Icon />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{option.label}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--color-text-secondary)]">{option.helper}</div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Cluster name</label>
            <input value={clusterName} onChange={(event) => setClusterName(event.target.value)} placeholder="production-us-east-1" className="ui-input w-full" />
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Authentication</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAuthMethod('kubeconfig')} className={authMethod === 'kubeconfig' ? 'ui-secondary-btn' : 'ui-ghost-btn border border-[var(--color-border)]'}>
                Kubeconfig
              </button>
              <button type="button" onClick={() => setAuthMethod('service-account')} className={authMethod === 'service-account' ? 'ui-secondary-btn' : 'ui-ghost-btn border border-[var(--color-border)]'}>
                Service account
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="ui-ghost-btn w-fit border border-[var(--color-border)] cursor-pointer">
              Upload file
              <input type="file" accept={authMethod === 'kubeconfig' ? '.yaml,.yml,.conf,.txt' : '.json,.txt'} className="hidden" onChange={handleUpload} />
            </label>
            {uploadedFileName ? <p className="text-xs text-[var(--color-text-secondary)]">Loaded file: {uploadedFileName}</p> : null}
            <textarea
              rows={8}
              value={authMethod === 'kubeconfig' ? kubeconfigContent : serviceAccountText}
              onChange={(event) => authMethod === 'kubeconfig' ? setKubeconfigContent(event.target.value) : setServiceAccountText(event.target.value)}
              placeholder={authMethod === 'kubeconfig' ? 'Paste kubeconfig content...' : 'Paste service account JSON...'}
              className="ui-input h-auto w-full py-3"
            />
          </div>

          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

          <div className="flex justify-end">
            <button type="button" onClick={handleConnect} disabled={loading} className="ui-primary-btn">
              {loading ? 'Validating...' : 'Validate and Add Cluster'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
