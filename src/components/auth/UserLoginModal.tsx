import { ArrowRight, Eye, EyeOff, Lock, Mail, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export const UserLoginModal: React.FC = () => {
  const { loginUser, settings } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [settings.siteLogo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError('');
    const res = await loginUser(email.trim(), password);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Authentication failed. Please check your credentials.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-sm overflow-hidden p-5 sm:p-6 space-y-4">
        {/* Brand Header */}
        <div className="text-center space-y-1">
          {settings.siteLogo && !logoError ? (
            <img
              src={settings.siteLogo}
              alt={settings.siteName || 'Logo'}
              onError={() => setLogoError(true)}
              className="w-10 h-10 rounded-lg object-contain mx-auto shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded bg-indigo-600 flex items-center justify-center text-white font-semibold text-base mx-auto">
              {(settings.siteName || 'R').charAt(0).toUpperCase()}
            </div>
          )}
          <h2 className="text-base font-semibold text-white tracking-tight">
            Sign in to {settings.siteName || 'R Sender'}
          </h2>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-normal">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400">Secure Authentication</span>
            <span>·</span>
            <span>PBKDF2 Encrypted</span>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-3">
          {error && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="font-normal">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoFocus
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying credentials...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="pt-2 text-center border-t border-slate-800">
          <p className="text-[10px] text-slate-500 font-normal">
            Need an account? Contact your platform administrator.
          </p>
        </div>
      </div>
    </div>
  );
};
