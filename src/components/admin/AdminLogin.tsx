import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      const safeDefault = `${base}/admin/`;
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('returnTo');
      let redirect = safeDefault;
      if (returnTo) {
        try {
          // Parse as URL to sanitize — prevents javascript: scheme and open redirects
          const url = new URL(returnTo, window.location.origin);
          if (url.origin === window.location.origin && url.pathname.startsWith(`${base}/`)) {
            redirect = url.pathname;
          }
        } catch {
          // Invalid URL — use safe default
        }
      }
      window.location.href = redirect;
    }
  }

  return (
    <form
      onSubmit={handleLogin}
      className="relative z-10 bg-surface/85 backdrop-blur-md rounded-2xl shadow-lift border border-primary/5 p-8 w-full max-w-sm animate-fade-up"
    >
      <div className="text-center mb-6">
        <p className="eyebrow text-coral mb-2">Shagadeus Studio</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-primary">
          Admin <span className="text-gradient-warm">Login</span>
        </h1>
        <p className="text-xs text-text-muted mt-2">Sign in to manage classes and registrations.</p>
      </div>

      {error && (
        <div className="bg-coral/10 text-coral-dark border border-coral/20 rounded-xl p-3 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full bg-white/70 border border-primary/10 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition"
        />
      </div>

      <div className="mb-6">
        <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full bg-white/70 border border-primary/10 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 disabled:opacity-50 text-white font-semibold py-3 rounded-full transition-all shadow-[0_8px_22px_-8px_rgba(231,111,81,0.55)]"
      >
        {loading ? 'Signing in...' : 'Sign In →'}
      </button>
    </form>
  );
}
