import { ChangeEvent, useState } from 'react';
import { motion } from 'framer-motion';

const API_BASE_URL = 'http://localhost:8000';

type ClusterType = 'eks' | 'gke' | 'openshift';
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

const options: Array<{ value: ClusterType; label: string; helper: string }> = [
  { value: 'eks', label: 'EKS', helper: 'Amazon Elastic Kubernetes Service' },
  { value: 'gke', label: 'GKE', helper: 'Google Kubernetes Engine' },
  { value: 'openshift', label: 'OpenShift', helper: 'Red Hat OpenShift' },
];

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
        throw new Error(validateData.detail ?? 'Failed to validate cluster.');
      }

      const confirmResponse = await fetch(`${API_BASE_URL}/k8s/onboarding/confirm`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const confirmData = await confirmResponse.json();
      if (!confirmResponse.ok) {
        throw new Error(confirmData.detail ?? 'Failed to confirm cluster.');
      }

      const createResponse = await fetch(`${API_BASE_URL}/clusters/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: clusterName.trim(),
          cluster_type: clusterType,
          workspace_id: selectedWorkspaceId,
        }),
      });
      const createData = await createResponse.json();
      if (!createResponse.ok) {
        throw new Error(createData.detail ?? 'Failed to save cluster.');
      }

      onClusterCreated(createData as ClusterRecord);
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
            <div className="grid gap-3 md:grid-cols-3">
              {options.map((option) => {
                const active = option.value === clusterType;
                return (
                  <motion.button
                    key={option.value}
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    onClick={() => setClusterType(option.value)}
                    className={`rounded-md border px-4 py-4 text-left transition duration-150 ease-out ${active ? 'border-[#22C55E] bg-[#F0FDF4]' : 'border-[var(--color-border)] bg-white hover:bg-[#F9FAFB]'}`}
                  >
                    <div className="text-sm font-medium text-[var(--color-text-primary)]">{option.label}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{option.helper}</div>
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
