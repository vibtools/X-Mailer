import React, { useState, useEffect } from 'react';
import {
  Settings,
  Mail,
  Send,
  Check,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  User,
  Shield,
  Key,
  Lock,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { sendEmailViaResend } from '../../services/apiService';

export const SettingsPage: React.FC = () => {
  const { currentUser, settings, updateSettings, apis, addLog, changePassword } = useApp();

  const [defaultSenderName, setDefaultSenderName] = useState(settings.defaultSenderName || 'R Sender Dispatcher');
  const [defaultSenderEmail, setDefaultSenderEmail] = useState(settings.defaultSenderEmail || 'sender@yourdomain.com');
  const [defaultDelayMs, setDefaultDelayMs] = useState(settings.defaultDelayMs || 3000);
  const [companyName, setCompanyName] = useState(settings.companyName || 'Your Company');
  const [companyAddress, setCompanyAddress] = useState(settings.companyAddress || '123 Business Rd, City, Country');

  // Sync settings when loaded from DB
  useEffect(() => {
    if (settings) {
      if (settings.defaultSenderName) setDefaultSenderName(settings.defaultSenderName);
      if (settings.defaultSenderEmail) setDefaultSenderEmail(settings.defaultSenderEmail);
      if (settings.defaultDelayMs) setDefaultDelayMs(settings.defaultDelayMs);
      if (settings.companyName) setCompanyName(settings.companyName);
      if (settings.companyAddress) setCompanyAddress(settings.companyAddress);
    }
  }, [settings]);

  // Password Management State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ success?: boolean; message: string } | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Test Email Tester tool
  const [testRecipient, setTestRecipient] = useState(currentUser?.email || 'mytest@domain.com');
  const [selectedApiKeyId, setSelectedApiKeyId] = useState(apis[0]?.id || '');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      defaultSenderName,
      defaultSenderEmail,
      defaultDelayMs: Number(defaultDelayMs),
      companyName,
      companyAddress,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleSendTestEmail = async () => {
    if (!testRecipient.trim()) {
      alert('Please enter a recipient email for testing.');
      return;
    }
    const chosenApi = apis.find((a) => a.id === selectedApiKeyId) || apis[0];
    if (!chosenApi) {
      alert('Please add and select an API key first.');
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);

    try {
      const res = await sendEmailViaResend({
        apiKey: chosenApi.key,
        from: `${defaultSenderName} <${chosenApi.senderEmail}>`,
        to: testRecipient.trim(),
        subject: '🧪 R Sender Live Delivery Diagnostic',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #4f46e5;">R Sender Delivery Verified! ✅</h2>
            <p>This is a live test email sent via API key: <strong>${chosenApi.name}</strong>.</p>
            <p>Timestamp: ${new Date().toLocaleString()}</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
            <small style="color: #64748b;">Dispatched via R Sender Automation Engine</small>
          </div>
        `,
        text: `R Sender Delivery Verified! This is a test email sent via API key: ${chosenApi.name}.`,
      });

      if (res.success) {
        setTestResult({
          success: true,
          message: `Email successfully delivered to ${testRecipient}! (ID: ${res.id})`,
        });
        addLog({
          level: 'success',
          apiName: chosenApi.name,
          recipient: testRecipient,
          message: `Inbox test email delivered successfully to ${testRecipient}`,
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Failed to dispatch test email',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Error executing test send',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordStatus({ success: false, message: 'New password must be at least 6 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ success: false, message: 'New passwords do not match.' });
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordStatus(null);
    try {
      const res = await changePassword(currentPassword, newPassword);
      if (res.success) {
        setPasswordStatus({ success: true, message: 'Password updated successfully!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordStatus({ success: false, message: res.error || 'Failed to update password' });
      }
    } catch (err: any) {
      setPasswordStatus({ success: false, message: err.message || 'Error changing password' });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="p-4 md:p-5 max-w-7xl mx-auto space-y-3.5">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm md:text-base font-semibold text-white tracking-tight">User Account & Sending Defaults</h2>
          <span className="text-[10px] font-medium text-slate-400 font-mono">· Preferences</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* User Account Details */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-slate-950 border border-slate-800 text-indigo-400 flex items-center justify-center font-normal">
              <User className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs font-medium text-slate-200">Active Profile</h3>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5 font-normal">Full Name</label>
              <input
                type="text"
                disabled
                value={currentUser?.name || 'Account User'}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 font-normal cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5 font-normal">Email Address</label>
              <input
                type="email"
                disabled
                value={currentUser?.email || ''}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 font-normal cursor-not-allowed font-mono"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-800">
              <p className="font-medium text-slate-200 text-xs">Account Tier</p>
              <span className="text-[10px] font-medium uppercase text-indigo-400 font-mono">
                {currentUser?.role || 'user'}
              </span>
            </div>
          </div>
        </div>

        {/* Global Dispatch Defaults */}
        <form onSubmit={handleSaveDefaults} className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              <span>Default Sending Config</span>
            </h3>
            {savedSuccess && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-normal">
                <Check className="w-3 h-3" /> Saved!
              </span>
            )}
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5 font-normal">Default Sender Name</label>
              <input
                type="text"
                value={defaultSenderName}
                onChange={(e) => setDefaultSenderName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5 font-normal">Default Fallback From Email</label>
              <input
                type="email"
                value={defaultSenderEmail}
                onChange={(e) => setDefaultSenderEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none font-mono transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5 font-normal">Throttle Interval (ms)</label>
              <input
                type="number"
                min="100"
                max="60000"
                step="50"
                value={defaultDelayMs}
                onChange={(e) => setDefaultDelayMs(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors"
          >
            Save Default Preferences
          </button>
        </form>

        {/* Company Details (CAN-SPAM) */}
        <form onSubmit={handleSaveDefaults} className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-slate-950 border border-slate-800 text-indigo-400">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-medium text-slate-200">Company Details (CAN-SPAM Compliance)</h3>
            </div>
            {savedSuccess && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-normal">
                <Check className="w-3 h-3" /> Saved!
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5 font-normal">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corp LLC"
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5 font-normal">Postal Address</label>
              <input
                type="text"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                placeholder="e.g. 123 Business Rd, NY 10001, USA"
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            These details are automatically injected via the <code>{`{sender_company}`}</code> and <code>{`{company_address}`}</code> tags to meet Anti-Spam laws.
          </p>
          <button
            type="submit"
            className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors"
          >
            Save Company Details
          </button>
        </form>

        {/* Security & Password Change Card */}
        <form onSubmit={handleChangePassword} className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-slate-950 border border-slate-800 text-indigo-400">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-medium text-slate-200">Account Security</h3>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">
              · PBKDF2 Encrypted
            </span>
          </div>

          {passwordStatus && (
            <div
              className={`p-2 rounded border text-xs flex items-center gap-2 ${
                passwordStatus.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {passwordStatus.success ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              )}
              <span className="text-[11px] font-mono">{passwordStatus.message}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-normal text-slate-400 mb-0.5">Current Password</label>
              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-normal text-slate-400 mb-0.5">New Password (min 6)</label>
              <input
                type="password"
                required
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-normal text-slate-400 mb-0.5">Confirm New Password</label>
              <input
                type="password"
                required
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex justify-end pt-0.5">
            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isUpdatingPassword ? (
                <>
                  <RotateCw className="w-3 h-3 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-3 h-3" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Inbox Tester Card */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-slate-950 border border-slate-800 text-emerald-400">
              <Mail className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs font-medium text-slate-200">Inbox Deliverability Diagnostic</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-normal text-slate-400 mb-0.5">Select API Key</label>
              <select
                value={selectedApiKeyId || (apis[0]?.id || '')}
                onChange={(e) => setSelectedApiKeyId(e.target.value)}
                disabled={apis.length === 0}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none disabled:opacity-50"
              >
                {apis.length === 0 ? (
                  <option value="" disabled>No API Key connected</option>
                ) : (
                  apis.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.senderEmail})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-normal text-slate-400 mb-0.5">Your Test Recipient Email</label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  placeholder="you@yourdomain.com"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
                >
                  <RotateCw className={`w-3 h-3 ${isSendingTest ? 'animate-spin' : ''}`} />
                  <span>{isSendingTest ? 'Sending...' : 'Send Test'}</span>
                </button>
              </div>
            </div>
          </div>

          {testResult && (
            <div
              className={`p-2.5 rounded border text-xs flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              )}
              <span className="text-[11px] font-mono">{testResult.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

