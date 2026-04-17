import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../lib/api';

export default function OAuthCallback() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code) {
        setError('Authorization code not found');
        setLoading(false);
        return;
      }

      try {
        // Exchange code for token
        const response = await fetch(
          `${API_BASE_URL}/auth/google/callback?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail ?? 'Failed to authenticate');
        }

        document.cookie = `access_token=${data.access_token}; path=/; samesite=lax; max-age=${60 * 60 * 24}`;
        localStorage.setItem('access_token', data.access_token);

        // Redirect to root which will route based on workspace status
        window.location.replace('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-300">Completing sign in...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-6 max-w-md">
            <h2 className="text-red-800 dark:text-red-200 font-semibold mb-2">Authentication Failed</h2>
            <p className="text-red-700 dark:text-red-300 text-sm mb-4">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}