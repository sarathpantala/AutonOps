import { useState } from 'react';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../lib/api';

type LoginPageProps = {
  onLogin?: (email: string, password: string) => Promise<void>;
  onSignup?: (name: string, email: string, password: string) => Promise<void>;
  onGoogleLogin?: () => Promise<void>;
};

function AutonOpsLogo() {
  return (
    <div className="flex items-center gap-3">
      <motion.svg width="32" height="32" viewBox="0 0 32 32">
        <motion.circle
          cx="16"
          cy="16"
          r="12"
          stroke="#22C55E"
          strokeWidth="2"
          fill="none"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
          style={{ transformOrigin: '16px 16px' }}
        />
        <motion.circle
          cx="16"
          cy="16"
          r="4"
          fill="#22C55E"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          style={{ transformOrigin: '16px 16px' }}
        />
      </motion.svg>
      <span className="text-base font-semibold text-[var(--color-text-primary)]">AutonOps</span>
    </div>
  );
}

export default function LoginPage({ onLogin, onSignup, onGoogleLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email || !password) {
      setError('Enter both email and password.');
      return;
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Enter your name.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setError('');
    setLoading(true);

    try {
      if (mode === 'login' && onLogin) {
        await onLogin(email, password);
      } else if (mode === 'signup' && onSignup) {
        await onSignup(name.trim(), email, password);
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);

    try {
      if (onGoogleLogin) {
        await onGoogleLogin();
      } else {
        window.location.assign(`${API_BASE_URL}/auth/google/login?redirect=true`);
      }
    } catch {
      setError('Google login failed.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <div className="mx-auto grid min-h-screen max-w-[1120px] grid-cols-1 gap-12 px-6 py-10 lg:grid-cols-2 lg:items-center">
        <div className="space-y-6">
          <AutonOpsLogo />
          <div>
            <h1 className="text-[40px] font-semibold leading-[1.15] text-[var(--color-text-primary)]">Your Autonomous SRE for Kubernetes</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
              Detect, diagnose, and fix production issues faster with AI-powered automation built for EKS, GKE, and OpenShift.
            </p>
          </div>

          <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <p>• Detect incidents instantly</p>
            <p>• Identify root cause automatically</p>
            <p>• Apply safe remediation safely</p>
          </div>
        </div>

        <div className="ui-card p-6 lg:p-8">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Continue to your workspace</p>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={handleGoogle}
            disabled={loading || googleLoading}
            className="ui-primary-btn mt-6 w-full"
          >
            {googleLoading ? 'Connecting...' : 'Continue with Google'}
          </motion.button>

          <div className="my-5 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            or
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' ? (
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" className="ui-input w-full" />
            ) : null}

            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="ui-input w-full" />
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="ui-input w-full" />

            {mode === 'signup' ? (
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" className="ui-input w-full" />
            ) : null}

            {error ? <p className="text-sm text-rose-500">{error}</p> : null}

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              disabled={loading || googleLoading}
              className="ui-secondary-btn w-full"
            >
              {loading ? 'Processing...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </motion.button>
          </form>

          <p className="mt-5 text-sm text-[var(--color-text-secondary)]">
            {mode === 'login' ? 'No account?' : 'Already have an account?'}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setName('');
                setEmail('');
                setPassword('');
                setConfirmPassword('');
                setError('');
              }}
              className="ml-2 font-medium text-[var(--color-text-primary)]"
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
