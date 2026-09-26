import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Globe,
  Save,
  Check,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Sliders,
  UploadCloud,
  Image as ImageIcon,
  Trash2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { testNeonPostgres, uploadFileToStorage } from '../../services/apiService';

const FAVICON_EMOJI_PRESETS = ['✉️', '📬', '🚀', '⚡', '🛡️', '🌐', '💼', '📧', '📨', '🔥'];

export const AdminSettingsPage: React.FC = () => {
  const { settings, updateSettings, addLog } = useApp();

  const [siteName, setSiteName] = useState(settings.siteName || 'R Sender');
  const [siteLogo, setSiteLogo] = useState(settings.siteLogo || '');
  const [favicon, setFavicon] = useState(settings.favicon || '✉️');
  const [supportEmail, setSupportEmail] = useState(settings.supportEmail || 'support@rsender.io');
  const [neonConnectionString, setNeonConnectionString] = useState(settings.neonConnectionString || '');
  const [maintenanceMode, setMaintenanceMode] = useState(settings.maintenanceMode || false);

  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadMsg, setLogoUploadMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [logoPreviewError, setLogoPreviewError] = useState(false);

  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [faviconUploadMsg, setFaviconUploadMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [faviconPreviewError, setFaviconPreviewError] = useState(false);

  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const faviconFileInputRef = useRef<HTMLInputElement>(null);

  // Sync settings when loaded from DB
  useEffect(() => {
    if (settings) {
      if (settings.siteName) setSiteName(settings.siteName);
      if (settings.siteLogo !== undefined) {
        setSiteLogo(settings.siteLogo);
        setLogoPreviewError(false);
      }
      if (settings.favicon) {
        setFavicon(settings.favicon);
        setFaviconPreviewError(false);
      }
      if (settings.supportEmail) setSupportEmail(settings.supportEmail);
      if (settings.neonConnectionString) setNeonConnectionString(settings.neonConnectionString);
      if (settings.maintenanceMode !== undefined) setMaintenanceMode(settings.maintenanceMode);
    }
  }, [settings]);

  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{
    tested: boolean;
    connected: boolean;
    message: string;
  } | null>(null);

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleLogoFileUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setLogoUploadMsg({ type: 'error', text: 'Logo image exceeds 10MB limit.' });
      return;
    }
    setIsUploadingLogo(true);
    setLogoUploadMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setSiteLogo(dataUrl);
      setLogoPreviewError(false);
      setLogoUploadMsg({ type: 'info', text: 'Uploading logo...' });

      try {
        const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl;
        const res = await uploadFileToStorage({
          fileName: file.name,
          base64Content: base64,
          mimeType: file.type || 'image/png',
          source: 'logo',
          uploadedBy: 'admin',
        });

        if (res.success && res.file?.s3Url) {
          const probeImg = new Image();
          probeImg.onload = () => {
            setSiteLogo(res.file!.s3Url);
            setLogoPreviewError(false);
            setLogoUploadMsg({ type: 'success', text: `Uploaded: ${file.name}` });
          };
          probeImg.onerror = () => {
            setLogoPreviewError(false);
            setLogoUploadMsg({ type: 'info', text: `Logo ready (${file.name})` });
          };
          probeImg.src = res.file.s3Url;
        } else {
          setLogoUploadMsg({ type: 'info', text: `Logo ready (${file.name})` });
        }
      } catch {
        setLogoUploadMsg({ type: 'info', text: `Logo ready (${file.name})` });
      } finally {
        setIsUploadingLogo(false);
      }
    };
    reader.onerror = () => {
      setIsUploadingLogo(false);
      setLogoUploadMsg({ type: 'error', text: 'Failed reading file.' });
    };
    reader.readAsDataURL(file);
  };

  const handleFaviconFileUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFaviconUploadMsg({ type: 'error', text: 'Favicon exceeds 5MB.' });
      return;
    }
    setIsUploadingFavicon(true);
    setFaviconUploadMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setFavicon(dataUrl);
      setFaviconPreviewError(false);
      setFaviconUploadMsg({ type: 'info', text: 'Uploading favicon...' });

      try {
        const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl;
        const res = await uploadFileToStorage({
          fileName: file.name,
          base64Content: base64,
          mimeType: file.type || 'image/x-icon',
          source: 'favicon',
          uploadedBy: 'admin',
        });

        if (res.success && res.file?.s3Url) {
          const probeImg = new Image();
          probeImg.onload = () => {
            setFavicon(res.file!.s3Url);
            setFaviconPreviewError(false);
            setFaviconUploadMsg({ type: 'success', text: `Uploaded: ${file.name}` });
          };
          probeImg.onerror = () => {
            setFaviconPreviewError(false);
            setFaviconUploadMsg({ type: 'info', text: `Favicon ready (${file.name})` });
          };
          probeImg.src = res.file.s3Url;
        } else {
          setFaviconUploadMsg({ type: 'info', text: `Favicon ready (${file.name})` });
        }
      } catch {
        setFaviconUploadMsg({ type: 'info', text: `Favicon ready (${file.name})` });
      } finally {
        setIsUploadingFavicon(false);
      }
    };
    reader.onerror = () => {
      setIsUploadingFavicon(false);
      setFaviconUploadMsg({ type: 'error', text: 'Failed reading favicon.' });
    };
    reader.readAsDataURL(file);
  };

  const handleTestNeon = async () => {
    setIsTestingDb(true);
    setDbTestResult(null);
    try {
      const res = await testNeonPostgres(neonConnectionString.trim() || undefined);
      setDbTestResult({
        tested: true,
        connected: res.connected,
        message: res.message,
      });
      if (res.connected) {
        updateSettings({ neonStatus: 'connected' });
      }
    } catch (err: any) {
      setDbTestResult({
        tested: true,
        connected: false,
        message: err.message || 'Database connection error',
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      siteName: siteName.trim(),
      siteLogo: siteLogo.trim(),
      favicon: favicon.trim(),
      supportEmail: supportEmail.trim(),
      neonConnectionString: neonConnectionString.trim(),
      maintenanceMode,
    });

    setSavedSuccess(true);
    addLog({
      level: 'info',
      message: `Admin updated settings for "${siteName}"`,
    });

    setTimeout(() => {
      setSavedSuccess(false);
    }, 2500);
  };

  const isFaviconUrl =
    favicon.startsWith('http://') ||
    favicon.startsWith('https://') ||
    favicon.startsWith('data:') ||
    favicon.startsWith('/');

  return (
    <div className="p-3.5 md:p-4 max-w-7xl mx-auto space-y-3">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-amber-500/10 text-amber-400">
            <Globe className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-semibold text-white tracking-tight">Platform Settings</h2>
        </div>

        <button
          onClick={handleSaveAll}
          className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors shrink-0 shadow-sm"
        >
          {savedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Save className="w-3.5 h-3.5" />}
          <span>{savedSuccess ? 'Saved!' : 'Save Settings'}</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Settings saved successfully.</span>
        </div>
      )}

      <form onSubmit={handleSaveAll} className="space-y-3">
        {/* BRANDING: LOGO & FAVICON */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Logo Management */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                <h3 className="text-xs font-semibold text-white">Platform Logo</h3>
              </div>
              <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                {siteLogo ? 'Custom' : 'Default'}
              </span>
            </div>

            {/* Logo Preview & Controls */}
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-slate-950 border border-slate-800 rounded flex items-center justify-center p-1 relative shrink-0">
                {siteLogo ? (
                  !logoPreviewError ? (
                    <img
                      src={siteLogo}
                      alt="Logo"
                      className="max-h-12 max-w-[50px] object-contain"
                      onError={() => setLogoPreviewError(true)}
                    />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  )
                ) : (
                  <span className="font-bold text-sm text-indigo-400">
                    {(siteName || 'R').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif,image/x-icon"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoFileUpload(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploadingLogo}
                    onClick={() => logoFileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {isUploadingLogo ? (
                      <>
                        <RotateCw className="w-3 h-3 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-3 h-3" />
                        <span>Upload Logo</span>
                      </>
                    )}
                  </button>

                  {siteLogo && (
                    <button
                      type="button"
                      onClick={() => {
                        setSiteLogo('');
                        setLogoUploadMsg(null);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  value={siteLogo}
                  onChange={(e) => setSiteLogo(e.target.value)}
                  placeholder="Or enter logo image URL..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                />
              </div>
            </div>

            {logoUploadMsg && (
              <p className={`text-[10px] ${logoUploadMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
                {logoUploadMsg.text}
              </p>
            )}
          </div>

          {/* Favicon Management */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <h3 className="text-xs font-semibold text-white">Browser Favicon</h3>
              </div>
              <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded">
                {isFaviconUrl ? 'Custom' : 'Emoji'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-slate-950 border border-slate-800 rounded flex items-center justify-center shrink-0">
                  {isFaviconUrl && !faviconPreviewError ? (
                    <img
                      src={favicon}
                      alt="Favicon"
                      className="w-4 h-4 object-contain"
                      onError={() => setFaviconPreviewError(true)}
                    />
                  ) : (
                    <span className="text-sm">{!isFaviconUrl ? favicon : '✉️'}</span>
                  )}
                </div>

                <div className="flex-1 flex items-center gap-1.5">
                  <input
                    ref={faviconFileInputRef}
                    type="file"
                    accept="image/x-icon,image/png,image/svg+xml,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFaviconFileUpload(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploadingFavicon}
                    onClick={() => faviconFileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {isUploadingFavicon ? (
                      <>
                        <RotateCw className="w-3 h-3 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-3 h-3" />
                        <span>Upload Favicon</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFavicon('✉️');
                      setFaviconUploadMsg(null);
                    }}
                    className="p-1 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors"
                    title="Reset to default emoji"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Emoji Presets */}
              <div className="flex flex-wrap items-center gap-1">
                {FAVICON_EMOJI_PRESETS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setFavicon(emoji);
                      setFaviconUploadMsg(null);
                    }}
                    className={`w-6 h-6 rounded text-xs flex items-center justify-center transition-transform hover:scale-110 ${
                      favicon === emoji
                        ? 'bg-amber-500/20 border border-amber-500 text-white'
                        : 'bg-slate-950 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={favicon}
                onChange={(e) => setFavicon(e.target.value)}
                placeholder="Emoji or favicon URL..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
              />
            </div>

            {faviconUploadMsg && (
              <p className={`text-[10px] ${faviconUploadMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
                {faviconUploadMsg.text}
              </p>
            )}
          </div>
        </div>

        {/* WEBSITE DETAILS & NEON DB */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Website Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              <h3 className="text-xs font-semibold text-white">Website Details</h3>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Brand Name</label>
                <input
                  type="text"
                  required
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="R Sender"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Support Email</label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@rsender.io"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1 text-xs text-white focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Database Connection */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <h3 className="text-xs font-semibold text-white">PostgreSQL Connection</h3>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Connection String (URI)
                </label>
                <textarea
                  rows={2}
                  value={neonConnectionString}
                  onChange={(e) => setNeonConnectionString(e.target.value)}
                  placeholder="postgresql://user:pass@host/db..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded p-2 text-xs font-mono text-cyan-300 placeholder-slate-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestNeon}
                  disabled={isTestingDb}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors disabled:opacity-50"
                >
                  <RotateCw className={`w-3 h-3 ${isTestingDb ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>{isTestingDb ? 'Testing...' : 'Test Connection'}</span>
                </button>
              </div>

              {dbTestResult && (
                <div
                  className={`p-2 rounded border text-xs flex items-center gap-1.5 ${
                    dbTestResult.connected
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {dbTestResult.connected ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="text-[11px] font-mono">{dbTestResult.message}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Maintenance Mode */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <p className="text-xs font-medium text-slate-200">Maintenance Mode</p>
              <p className="text-[10px] text-slate-400">Pause background email task execution</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={maintenanceMode}
            onChange={(e) => setMaintenanceMode(e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 text-amber-600 focus:ring-0 cursor-pointer"
          />
        </div>
      </form>
    </div>
  );
};
