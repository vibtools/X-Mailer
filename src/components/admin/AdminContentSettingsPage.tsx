import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Mail,
  Link,
  EyeOff,
  Search,
  Sparkles,
  Paperclip,
  Check,
  FileCode,
  Info,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SystemSettings } from '../../types';

export const AdminContentSettingsPage: React.FC = () => {
  const { settings, updateSettings, addLog } = useApp();

  // Local form state initialized from current settings
  const [formData, setFormData] = useState<Partial<SystemSettings>>({
    defaultUnsubscribeUrl: settings.defaultUnsubscribeUrl || 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}',
    enableOneClickUnsubscribe: settings.enableOneClickUnsubscribe !== false,
    enableGlobalUnsubscribe: settings.enableGlobalUnsubscribe !== false,
    enableResendTracking: settings.enableResendTracking === true,
    enableAutoReplyTo: settings.enableAutoReplyTo !== false,
    defaultSenderName: settings.defaultSenderName || 'Support Team',
    defaultSubject: settings.defaultSubject || 'Update regarding your account {name}',
    enableDynamicTags: settings.enableDynamicTags !== false,
    enableDeliverabilityScanner: settings.enableDeliverabilityScanner !== false,
    enableAttachments: settings.enableAttachments !== false,
    enablePlainTextFallback: settings.enablePlainTextFallback !== false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Sync state when settings change
  useEffect(() => {
    setFormData({
      defaultUnsubscribeUrl: settings.defaultUnsubscribeUrl || 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}',
      enableOneClickUnsubscribe: settings.enableOneClickUnsubscribe !== false,
      enableGlobalUnsubscribe: settings.enableGlobalUnsubscribe !== false,
      enableResendTracking: settings.enableResendTracking === true,
      enableAutoReplyTo: settings.enableAutoReplyTo !== false,
      defaultSenderName: settings.defaultSenderName || 'Support Team',
      defaultSubject: settings.defaultSubject || 'Update regarding your account {name}',
      enableDynamicTags: settings.enableDynamicTags !== false,
      enableDeliverabilityScanner: settings.enableDeliverabilityScanner !== false,
      enableAttachments: settings.enableAttachments !== false,
      enablePlainTextFallback: settings.enablePlainTextFallback !== false,
    });
  }, [settings]);

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => {
      setSaveToast(null);
    }, 3200);
  };

  const handleToggle = (key: keyof SystemSettings) => {
    setFormData((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleChange = (key: keyof SystemSettings, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      await updateSettings(formData);
      addLog({
        level: 'info',
        message: `Admin updated Content Settings & Global Deliverability Defaults`,
      });
      showToast('Content settings saved and applied successfully!');
    } catch (err: any) {
      alert(`Error saving content settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (!window.confirm('Reset all content settings to recommended production defaults?')) return;
    setFormData({
      defaultUnsubscribeUrl: 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}',
      enableOneClickUnsubscribe: true,
      enableGlobalUnsubscribe: true,
      enableResendTracking: false,
      enableAutoReplyTo: true,
      defaultSenderName: 'Support Team',
      defaultSubject: 'Update regarding your account {name}',
      enableDynamicTags: true,
      enableDeliverabilityScanner: true,
      enableAttachments: true,
      enablePlainTextFallback: true,
    });
    showToast('Reset to recommended production defaults. Click Save to persist.');
  };

  // Preview computed headers based on current settings
  const sampleEmail = 'recipient@example.com';
  const encodedEmail = encodeURIComponent(sampleEmail);
  const rawUrl = (formData.defaultUnsubscribeUrl || 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}').trim();
  const previewUnsubUrl = rawUrl.includes('{EMAIL}') || rawUrl.includes('{email}')
    ? rawUrl.replace(/\{EMAIL\}|\{email\}/g, encodedEmail)
    : rawUrl.includes('?') ? `${rawUrl}&email=${encodedEmail}` : `${rawUrl}?email=${encodedEmail}`;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Sliders className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-white tracking-tight">Content & Deliverability Settings</h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-900/40 disabled:opacity-50 transition-all"
          >
            {isSaving ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs font-medium rounded-xl shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* SECTION 1: GLOBAL UNSUBSCRIBE & RFC 8058 ENGINE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Link className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Global Unsubscribe Engine & RFC 8058 Compliance</h2>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
            Phase 1 Hardened
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Master Global Unsubscribe Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="pr-3">
              <span className="text-xs font-semibold text-slate-200">Enforce Global Unsubscribe Fallback</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle('enableGlobalUnsubscribe')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.enableGlobalUnsubscribe ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  formData.enableGlobalUnsubscribe ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* RFC 8058 One-Click Header Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="pr-3">
              <span className="text-xs font-semibold text-slate-200">RFC 8058 One-Click Unsubscribe Header</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle('enableOneClickUnsubscribe')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.enableOneClickUnsubscribe ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  formData.enableOneClickUnsubscribe ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Default Unsubscribe URL Input */}
        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span>Admin Default Unsubscribe URL</span>
            <span className="text-[10px] text-slate-500 font-mono">Variables: &#123;EMAIL&#125;, &#123;domain&#125;</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={formData.defaultUnsubscribeUrl || ''}
              onChange={(e) => handleChange('defaultUnsubscribeUrl', e.target.value)}
              placeholder="https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
        </div>

        {/* Live Header Inspection Card */}
        <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-lg space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
            <FileCode className="w-3.5 h-3.5 text-indigo-400" />
            <span>Live Outgoing RFC Headers Preview (Generated per dispatch)</span>
          </div>
          <div className="font-mono text-[11px] text-slate-300 bg-slate-900/90 p-2.5 rounded border border-slate-800 space-y-1 overflow-x-auto">
            {formData.enableGlobalUnsubscribe ? (
              <>
                <div className="text-emerald-400">
                  <span className="text-slate-500">List-Unsubscribe:</span> &lt;{previewUnsubUrl}&gt;
                </div>
                {formData.enableOneClickUnsubscribe && (
                  <div className="text-amber-400">
                    <span className="text-slate-500">List-Unsubscribe-Post:</span> List-Unsubscribe=One-Click
                  </div>
                )}
              </>
            ) : (
              <div className="text-rose-400">
                // Global Unsubscribe is OFF — Unconfigured templates will lack RFC 8058 headers (Spam risk)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: TRACKING & ANTI-PHISHING ENGINE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <EyeOff className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Tracking & Anti-Phishing Safeguards</h2>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            Inbox Defense
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Master Resend Tracking Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="pr-3">
              <span className="text-xs font-semibold text-slate-200">Resend Open & Click Tracking</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle('enableResendTracking')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.enableResendTracking ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  formData.enableResendTracking ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Pre-flight Deliverability Scanner */}
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="pr-3">
              <span className="text-xs font-semibold text-slate-200">Pre-flight Deliverability Spam Scanner</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle('enableDeliverabilityScanner')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.enableDeliverabilityScanner ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  formData.enableDeliverabilityScanner ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: SENDER IDENTITY & ROUTING DEFAULTS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Sender Identity & Default Routing</h2>
            <p className="text-xs text-slate-400">
              Configure initial defaults for new tasks and fallback routing policies.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Default Sender Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Default Sender Display Name</label>
            <input
              type="text"
              value={formData.defaultSenderName || ''}
              onChange={(e) => handleChange('defaultSenderName', e.target.value)}
              placeholder="Support Team"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Default Subject */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Default Subject Line</span>
              <span className="text-[10px] text-slate-500 font-mono">Variables: &#123;name&#125;</span>
            </label>
            <input
              type="text"
              value={formData.defaultSubject || ''}
              onChange={(e) => handleChange('defaultSubject', e.target.value)}
              placeholder="Update regarding your account {name}"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Auto Reply-To Routing */}
        <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
          <div className="pr-3">
            <span className="text-xs font-semibold text-slate-200">Auto Reply-To Header Alignment</span>
          </div>
          <button
            type="button"
            onClick={() => handleToggle('enableAutoReplyTo')}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              formData.enableAutoReplyTo ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                formData.enableAutoReplyTo ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* SECTION 4: CONTENT FORMATTING & MIME ENGINE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Content Formatting & MIME Features</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Dynamic Tags */}
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="pr-2">
              <span className="text-xs font-semibold text-slate-200">Dynamic Tags Engine</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle('enableDynamicTags')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.enableDynamicTags ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  formData.enableDynamicTags ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Plain Text Fallback */}
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="pr-2">
              <span className="text-xs font-semibold text-slate-200">Plain-Text MIME Fallback</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle('enablePlainTextFallback')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.enablePlainTextFallback ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  formData.enablePlainTextFallback ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Attachments Support */}
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="pr-2">
              <span className="text-xs font-semibold text-slate-200">S3 File Attachments</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle('enableAttachments')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.enableAttachments ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  formData.enableAttachments ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Save Button Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleResetDefaults}
          className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          Reset to Defaults
        </button>
        <button
          type="button"
          onClick={() => handleSave()}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/50 disabled:opacity-50 transition-all"
        >
          {isSaving ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          <span>{isSaving ? 'Saving Changes...' : 'Save Content Settings'}</span>
        </button>
      </div>
    </div>
  );
};

