import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { checkSetupStatus, getNeonHealth } from '../../services/apiService';

type SetupStep = 'welcome' | 'health' | 'admin';

export const AdminSetupPage: React.FC = () => {
  const { setupAdmin, setIsAdminMode, setIsSetupMode, settings } = useApp();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);
  const [step, setStep] = useState<SetupStep>('welcome');
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthLogs, setHealthLogs] = useState<string[]>([]);
  const [healthStatus, setHealthStatus] = useState<{ connected: boolean; database?: string; endpoint?: string } | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [settings?.siteLogo]);

  useEffect(() => {
    checkSetupStatus().then((status) => {
      setIsCheckingExisting(false);
      setAlreadyConfigured(status.adminExists);
      if (status.adminExists) {
        setStep('admin');
      }
    });
  }, []);

  const handleCheckExistingAdmin = async () => {
    setCheckingAdmin(true);
    setError('');

    try {
      const status = await checkSetupStatus();
      if (status.adminExists) {
        setAlreadyConfigured(true);
        setStep('admin');
      } else {
        setAlreadyConfigured(false);
        setStep('admin');
        if (status.error) {
          setError(`Database response: ${status.error}. If no admin exists yet, you can register below.`);
        } else {
          setError('No admin user was found in the database. You can register the first administrator below.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check database for an existing admin user.');
    } finally {
      setCheckingAdmin(false);
    }
  };

  const handleCheckHealth = async () => {
    setHealthLoading(true);
    setError('');
    const logs: string[] = [];
    logs.push('Initializing Neon PostgreSQL health check...');
    setHealthLogs(logs);

    try {
      const result = await getNeonHealth();
      const connected = Boolean(result && result.connected);
      const counts = result?.counts ?? { apis: 0, users: 0, tasks: 0, logs: 0 };
      logs.push(`Database connected: ${connected ? 'yes' : 'no'}`);
      logs.push(`Connected to database: ${result?.database || 'unknown'}`);
      logs.push(`Endpoint: ${result?.endpoint || 'unknown'}`);
      logs.push(`PG version: ${result?.pgVersion || 'unknown'}`);
      logs.push(`Users: ${counts.users} | APIs: ${counts.apis} | Tasks: ${counts.tasks} | Logs: ${counts.logs}`);
      setHealthStatus({
        connected,
        database: result?.database || 'unknown',
        endpoint: result?.endpoint || 'unknown',
      });
      setHealthLogs(logs);

      if (!connected) {
        setError('Database health check reported a failure. Please verify the Neon DATABASE_URL and database connectivity.');
      }
    } catch (err: any) {
      logs.push(`Database health check failed: ${err.message || 'Unknown error'}`);
      setHealthStatus({ connected: false });
      setHealthLogs(logs);
      setError('Database health check failed. Please verify your Neon connection settings.');
    } finally {
      setHealthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter the administrator name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid administrator email address.');
      return;
    }
    if (password.length < 6) {
      setError('Master password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please retype carefully.');
      return;
    }

    setLoading(true);
    const res = await setupAdmin({
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
    });
    setLoading(false);

    if (!res.success) {
      const errLower = (res.error || '').toLowerCase();
      if (
        res.adminExists ||
        errLower.includes('already configured') ||
        errLower.includes('already exists') ||
        errLower.includes('already has a master')
      ) {
        setAlreadyConfigured(true);
        return;
      }
      setError(res.error || 'Failed to create administrator. Please check details.');
    }
  };

  if (isCheckingExisting) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Checking system setup status with Neon...</p>
        </div>
      </div>
    );
  }

  if (alreadyConfigured) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-sm p-5 text-center space-y-3">
          <div className="w-10 h-10 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-semibold text-white">Platform Already Initialized</h2>
          <p className="text-xs text-slate-400 font-normal">
            A master administrator account already exists. Continue with the secure admin login.
          </p>
          <div className="pt-1">
            <button
              onClick={() => {
                window.history.pushState({}, '', '/vcon');
                setIsSetupMode(false);
                setIsAdminMode(true);
              }}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium transition-colors"
            >
              Go to Admin Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-md overflow-hidden p-5 sm:p-6 space-y-4">
          <div className="text-center space-y-2">
            {settings?.siteLogo && !logoError ? (
              <img
                src={settings.siteLogo}
                alt={settings.siteName || 'Logo'}
                onError={() => setLogoError(true)}
                className="w-11 h-11 rounded-lg object-contain mx-auto shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
            )}
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold text-white tracking-tight">
                Welcome to {settings?.siteName || 'R Sender'}
              </h2>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-[10px] font-medium">
                <span>Initial Setup</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 max-w-sm mx-auto font-normal">
              This setup will verify your database connection, confirm system health, and create the first master administrator account.
            </p>
          </div>

          <div className="space-y-2 rounded border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <span className="font-normal text-[11px]">Validate Neon PostgreSQL connection and schema health.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <span className="font-normal text-[11px]">Review health status and diagnostics.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <span className="font-normal text-[11px]">Create first admin account and continue to console.</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep('health')}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium transition-colors"
          >
            <span>Start</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <div className="text-center pt-1 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/vcon');
                setIsSetupMode(false);
                setIsAdminMode(true);
              }}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-normal transition-colors"
            >
              Already configured? Go to Admin Login (/vcon) →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'health') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-md overflow-hidden p-5 sm:p-6 space-y-4">
          <div className="text-center space-y-1.5">
            <div className="w-10 h-10 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mx-auto">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-white">Database & Health Check</h2>
            <p className="text-[11px] text-slate-400 font-normal">
              Run connection diagnostics before creating the first administrator.
            </p>
          </div>

          {error && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="font-normal text-[11px]">{error}</span>
            </div>
          )}

          <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-300 font-medium text-[11px]">System Status</span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-medium ${healthStatus?.connected === false ? 'bg-rose-500/10 text-rose-300' : healthStatus?.connected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>
                <Activity className="w-3 h-3" />
                {healthStatus ? (healthStatus.connected ? 'Healthy' : 'Not Ready') : 'Waiting'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCheckHealth}
              disabled={healthLoading}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-60"
            >
              {healthLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking database...</span>
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" />
                  <span>Run Diagnostics</span>
                </>
              )}
            </button>

            {healthLogs.length > 0 && (
              <div className="space-y-1 border-t border-slate-800 pt-2">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-mono">Progress log</p>
                <div className="max-h-32 overflow-auto rounded bg-slate-950 border border-slate-800 p-2 font-mono text-[10px] text-slate-300 space-y-0.5">
                  {healthLogs.map((log, index) => (
                    <div key={`${log}-${index}`}>{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCheckExistingAdmin}
                disabled={checkingAdmin}
                className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-950 text-slate-200 text-xs font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 text-center"
              >
                {checkingAdmin ? 'Checking...' : 'Check Existing'}
              </button>
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '/vcon');
                  setIsSetupMode(false);
                  setIsAdminMode(true);
                }}
                className="px-2.5 py-1.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium transition-colors text-center"
              >
                Go to Login (/vcon)
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep('admin')}
                className="flex-1 px-3 py-1.5 rounded border border-slate-700 bg-slate-950 text-slate-300 text-xs font-medium hover:bg-slate-800 transition-colors"
              >
                Skip & Next
              </button>
              <button
                type="button"
                onClick={() => setStep('admin')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
              >
                <span>Next</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-sm overflow-hidden p-5 sm:p-6 space-y-4">
        <div className="text-center space-y-1.5">
          <div className="w-10 h-10 rounded bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 mx-auto">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-white tracking-tight">First-Time Admin Setup</h2>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-[10px] font-medium">
              <span>/setup</span>
              <span>·</span>
              <span>Initialize Master Node</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto font-normal">
            No administrator account found. Please create your master credentials.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCheckExistingAdmin}
            disabled={checkingAdmin}
            className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-950 text-slate-200 text-xs font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 text-center"
          >
            {checkingAdmin ? 'Checking...' : 'Check Existing'}
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/vcon');
              setIsSetupMode(false);
              setIsAdminMode(true);
            }}
            className="px-2.5 py-1.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium transition-colors text-center"
          >
            Go to Login (/vcon)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="font-normal text-[11px]">{error}</span>
              </div>
              {(error.toLowerCase().includes('already configured') ||
                error.toLowerCase().includes('already exists') ||
                error.toLowerCase().includes('already has a master')) && (
                <div className="pt-1.5 border-t border-rose-500/20">
                  <button
                    type="button"
                    onClick={() => {
                      window.history.pushState({}, '', '/vcon');
                      setIsSetupMode(false);
                      setIsAdminMode(true);
                    }}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-medium transition-colors"
                  >
                    Open Master Admin Login (/vcon) →
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Administrator Name
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="e.g. Master Administrator"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Administrator Email
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="admin@yourdomain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors font-mono"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5 font-normal">This email will be used to log into /vcon</p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Master Password (min 6 characters)
            </label>
            <div className="relative">
              <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Create strong password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
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

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Confirm Master Password
            </label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Retype master password..."
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
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
                <span>Creating administrator...</span>
              </>
            ) : (
              <>
                <span>Create Master Administrator</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/vcon');
              setIsSetupMode(false);
              setIsAdminMode(true);
            }}
            className="text-amber-400 hover:text-amber-300 font-normal text-[11px] transition-colors"
          >
            Go to Admin Login (/vcon) →
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/');
              setIsSetupMode(false);
              setIsAdminMode(false);
            }}
            className="text-slate-400 hover:text-slate-200 text-[11px] transition-colors font-normal"
          >
            Return to Workspace
          </button>
        </div>
      </div>
    </div>
  );
};
