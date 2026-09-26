import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Save,
  Key,
  Globe,
  UploadCloud,
  FileText,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  FolderLock,
} from 'lucide-react';
import { SupabaseStorageConfig, UploadedFileRecord } from '../../types';
import {
  getStorageConfig,
  saveStorageConfig,
  testStorageConnection,
  uploadFileToStorage,
  getUploadedFiles,
  deleteUploadedFile,
} from '../../services/apiService';
import { useApp } from '../../context/AppContext';

export const AdminStorageSettingsPage: React.FC = () => {
  const { addLog } = useApp();

  const [config, setConfig] = useState<SupabaseStorageConfig>({
    provider: 'supabase_s3',
    endpoint: '',
    region: 'us-east-1',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    publicUrlBase: '',
    forcePathStyle: true,
    isEnabled: true,
    status: 'unconfigured',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [testResult, setTestResult] = useState<{
    tested: boolean;
    connected: boolean;
    message: string;
    pingMs?: number;
  } | null>(null);

  // Uploaded files telemetry
  const [files, setFiles] = useState<UploadedFileRecord[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [testUploading, setTestUploading] = useState(false);
  const [testUploadMsg, setTestUploadMsg] = useState<{ success: boolean; text: string; url?: string } | null>(null);

  useEffect(() => {
    loadConfigAndFiles();
  }, []);

  const loadConfigAndFiles = async () => {
    setLoading(true);
    try {
      const cfg = await getStorageConfig();
      setConfig(cfg);
      await loadFiles();
    } catch (err: any) {
      console.error('Failed to load storage config:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    setLoadingFiles(true);
    try {
      const data = await getUploadedFiles(100);
      setFiles(data);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testStorageConnection(config);
      setTestResult({
        tested: true,
        connected: res.connected,
        message: res.message,
        pingMs: res.pingMs,
      });
      if (res.connected) {
        setConfig((prev) => ({ ...prev, status: 'connected', isEnabled: true }));
      }
    } catch (err: any) {
      setTestResult({
        tested: true,
        connected: false,
        message: err.message || 'S3 connection failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await saveStorageConfig(config);
      setConfig(saved);
      setSaveSuccess(true);
      addLog({
        level: 'info',
        message: `Admin saved Supabase S3 storage config (Bucket: ${config.bucket || 'not set'})`,
      });
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTestUploading(true);
    setTestUploadMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const res = await uploadFileToStorage({
          fileName: file.name,
          base64Content: base64,
          mimeType: file.type || 'application/octet-stream',
          source: 'general',
          uploadedBy: 'admin_test',
        });

        if (res.success && res.file) {
          setTestUploadMsg({
            success: true,
            text: `Uploaded "${file.name}"`,
            url: res.file.s3Url,
          });
          await loadFiles();
        } else {
          setTestUploadMsg({
            success: false,
            text: res.error || 'Upload failed',
          });
        }
      } catch (err: any) {
        setTestUploadMsg({
          success: false,
          text: err.message || 'Upload exception',
        });
      } finally {
        setTestUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteFile = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" from S3 storage?`)) return;
    try {
      await deleteUploadedFile(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      addLog({
        level: 'warn',
        message: `Deleted file "${name}" from storage`,
      });
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center space-y-2">
        <RotateCw className="w-6 h-6 text-emerald-400 animate-spin" />
        <p className="text-xs text-slate-400">Loading storage settings...</p>
      </div>
    );
  }

  return (
    <div className="p-3.5 md:p-4 max-w-7xl mx-auto space-y-3">
      {/* Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400">
            <HardDrive className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-semibold text-white tracking-tight">Supabase S3 Storage</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 flex items-center gap-1.5 text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                config.status === 'connected'
                  ? 'bg-emerald-400'
                  : config.status === 'error'
                  ? 'bg-rose-500'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-300 text-[11px]">
              {config.status === 'connected'
                ? 'Active'
                : config.status === 'error'
                ? 'Error'
                : 'Unconfigured'}
            </span>
          </div>

          <button
            type="button"
            onClick={loadConfigAndFiles}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            title="Refresh"
          >
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left Form (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <FolderLock className="w-3.5 h-3.5 text-emerald-400" />
                <h3 className="text-xs font-semibold text-white">
                  S3 Credentials
                </h3>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.isEnabled}
                  onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-7 h-3.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                <span className="ml-1.5 text-[11px] text-slate-300">
                  {config.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            <div className="space-y-2 text-xs">
              {/* S3 Endpoint URL */}
              <div>
                <label className="block font-medium text-slate-300 mb-0.5 text-[11px]">
                  S3 Endpoint URL
                </label>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
                  <input
                    type="text"
                    required
                    value={config.endpoint}
                    onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                    placeholder="https://xyzprojectref.supabase.co/storage/v1/s3"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded pl-7 pr-2 py-1 text-xs text-emerald-300 font-mono placeholder-slate-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bucket Name & Region */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-0.5 text-[11px]">
                    Bucket Name
                  </label>
                  <input
                    type="text"
                    required
                    value={config.bucket}
                    onChange={(e) => setConfig({ ...config, bucket: e.target.value })}
                    placeholder="rsender-files"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-0.5 text-[11px]">
                    Region
                  </label>
                  <input
                    type="text"
                    value={config.region}
                    onChange={(e) => setConfig({ ...config, region: e.target.value })}
                    placeholder="us-east-1"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Access Key ID */}
              <div>
                <label className="block font-medium text-slate-300 mb-0.5 text-[11px]">
                  Access Key ID
                </label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
                  <input
                    type="text"
                    required
                    value={config.accessKeyId}
                    onChange={(e) => setConfig({ ...config, accessKeyId: e.target.value })}
                    placeholder="Access Key ID..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded pl-7 pr-2 py-1 text-xs text-white font-mono placeholder-slate-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Secret Access Key */}
              <div>
                <label className="block font-medium text-slate-300 mb-0.5 text-[11px]">
                  Secret Access Key
                </label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
                  <input
                    type={showSecret ? 'text' : 'password'}
                    required
                    value={config.secretAccessKey}
                    onChange={(e) => setConfig({ ...config, secretAccessKey: e.target.value })}
                    placeholder="Secret Key..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded pl-7 pr-7 py-1 text-xs text-white font-mono placeholder-slate-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1.5 text-slate-500 hover:text-slate-300"
                  >
                    {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Public URL Base */}
              <div>
                <label className="block font-medium text-slate-300 mb-0.5 text-[11px]">
                  Public URL Base (Optional)
                </label>
                <input
                  type="text"
                  value={config.publicUrlBase || ''}
                  onChange={(e) => setConfig({ ...config, publicUrlBase: e.target.value })}
                  placeholder="Optional custom CDN URL base"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded px-2 py-1 text-xs text-white font-mono placeholder-slate-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Test Connection Result */}
            {testResult && (
              <div
                className={`p-2 rounded border text-xs flex items-center gap-1.5 ${
                  testResult.connected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {testResult.connected ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
                <span className="font-mono text-[11px]">{testResult.message}</span>
              </div>
            )}

            {/* Form Footer Action Buttons */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors disabled:opacity-50"
              >
                <RotateCw className={`w-3 h-3 ${testing ? 'animate-spin text-emerald-400' : ''}`} />
                <span>{testing ? 'Testing...' : 'Test Connection'}</span>
              </button>

              <div className="flex items-center gap-1.5">
                {saveSuccess && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Saved!
                  </span>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
                >
                  <Save className="w-3 h-3" />
                  <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: Upload Probe (5 Cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
              <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
              <h3 className="text-xs font-semibold text-white">Upload Test</h3>
            </div>

            <label className="border border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-950/40 rounded p-3.5 flex flex-col items-center justify-center cursor-pointer transition-colors group">
              <UploadCloud className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors mb-1" />
              <span className="text-xs font-medium text-slate-300">
                {testUploading ? 'Uploading...' : 'Choose file to test upload'}
              </span>
              <input
                type="file"
                disabled={testUploading}
                onChange={handleTestUpload}
                className="hidden"
              />
            </label>

            {testUploadMsg && (
              <div
                className={`p-2 rounded border text-xs space-y-0.5 ${
                  testUploadMsg.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-1 font-medium">
                  {testUploadMsg.success ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                  )}
                  <span className="text-[11px]">{testUploadMsg.text}</span>
                </div>
                {testUploadMsg.url && (
                  <a
                    href={testUploadMsg.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline truncate flex items-center gap-1 font-mono text-[10px] pt-0.5"
                  >
                    <span className="truncate">{testUploadMsg.url}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Files Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <h3 className="text-xs font-semibold text-white">Files in S3</h3>
            <span className="text-[10px] text-indigo-400 font-mono">({files.length})</span>
          </div>

          <button
            type="button"
            onClick={loadFiles}
            disabled={loadingFiles}
            className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 disabled:opacity-50"
          >
            <RotateCw className={`w-3 h-3 ${loadingFiles ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {files.length === 0 ? (
          <div className="py-5 text-center text-slate-500 text-xs">
            No files uploaded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-[10px] font-medium text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-1.5 px-2.5">File</th>
                  <th className="py-1.5 px-2.5">Source</th>
                  <th className="py-1.5 px-2.5">Size</th>
                  <th className="py-1.5 px-2.5">Type</th>
                  <th className="py-1.5 px-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-1.5 px-2.5 font-sans font-medium text-white flex items-center gap-1.5 max-w-xs truncate">
                      <FileText className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="truncate" title={file.fileName}>{file.fileName}</span>
                    </td>
                    <td className="py-1.5 px-2.5">
                      <span className="px-1 py-0.2 rounded text-[9px] font-sans font-medium uppercase bg-slate-800 text-slate-300">
                        {file.source}
                      </span>
                    </td>
                    <td className="py-1.5 px-2.5 text-slate-400">{formatBytes(file.fileSize)}</td>
                    <td className="py-1.5 px-2.5 text-slate-500 text-[10px]">{file.mimeType}</td>
                    <td className="py-1.5 px-2.5 text-right font-sans">
                      <div className="flex items-center justify-end gap-1">
                        {file.s3Url && (
                          <a
                            href={file.s3Url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                            title="Open"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteFile(file.id, file.fileName)}
                          className="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
