import React, { useState, useEffect } from 'react';
import {   ArrowRight, ShieldAlert, KeyRound, ArrowLeft, RefreshCw, Eye, EyeOff, Wrench } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { checkSetupStatus } from '../../services/apiService';

export const AdminLogin: React.FC = () => {
  const { loginAdmin, setIsAdminMode, setIsSetupMode, settings } = useApp();
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [noAdminDetected, setNoAdminDetected] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [settings.siteLogo]);

  useEffect(() => {
    checkSetupStatus().then((status) => {
      if (!status.adminExists) {
        setNoAdminDetected(true);
      } else {
        setNoAdminDetected(false);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setError('Please enter the administrator password.');
      return;
    }

    setLoading(true);
    setError('');
    const res = await loginAdmin(adminPassword.trim(), adminEmail.trim());
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Access Denied: Invalid master administrator credentials.');
    }
  };

  const handleReturnToUser = () => {
    window.history.pushState({}, '', '/');
    setIsAdminMode(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-sm overflow-hidden p-5 sm:p-6 space-y-4">
        {/* Admin Header */}
        <div className="text-center space-y-1.5">
          {settings.siteLogo && !logoError ? (
            <img
              src={settings.siteLogo}
              alt={settings.siteName || 'Logo'}
              onError={() => setLogoError(true)}
              className="w-11 h-11 rounded-lg object-contain mx-auto shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 mx-auto">
              <ShieldAlert className="w-5 h-5" />
            </div>
          )}
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-white tracking-tight">
              {settings.siteName || 'R Sender'} Admin Gateway
            </h2>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-[10px] font-medium">
              <span>/vcon</span>
              <span>·</span>
              <span>Protected Console</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-normal">
            Master control node protected with PBKDF2 cryptography.
          </p>
        </div>

        {noAdminDetected && (
          <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2">
            <span className="text-[11px] font-normal">No admin detected in database yet.</span>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/setup');
                setIsSetupMode(true);
                setIsAdminMode(false);
              }}
              className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-medium shrink-0"
            >
              Run Setup
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="font-normal text-[11px]">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Admin Email
            </label>
            <input
              type="email"
              required
              placeholder="admin@yourdomain.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Admin Master Password
            </label>
            <div className="relative">
              <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                placeholder="Enter admin password..."
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors font-mono"
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
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Authenticate Admin</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Links */}
        <div className="text-center pt-2 border-t border-slate-800 space-y-1.5">
          <div>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/setup');
                setIsSetupMode(true);
                setIsAdminMode(false);
              }}
              className="text-[11px] text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 transition-colors font-normal"
            >
              <Wrench className="w-3 h-3" />
              <span>Initial Setup (/setup)</span>
            </button>
          </div>
          <div>
            <button
              type="button"
              onClick={handleReturnToUser}
              className="text-[11px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 transition-colors font-normal"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Return to User Workspace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
