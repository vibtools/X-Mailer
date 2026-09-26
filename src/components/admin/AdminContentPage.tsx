import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Save,
  Check,
  Plus,
  Trash2,
  Edit,
  Eye,
  Send,
  Sparkles,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  FolderOpen, Copy, RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { uploadFileToStorage, sendEmailViaResend } from '../../services/apiService';
import { AttachmentItem, EmailPreset } from '../../types';
import { interpolateEmailPayload } from '../../utils/dynamicTags';
import { htmlToPlainText } from '../../utils/htmlToPlainText';
import { DeliverabilityScannerModal } from '../deliverability/DeliverabilityScannerModal';
import { DynamicTagsModal } from '../deliverability/DynamicTagsModal';

export const AdminContentPage: React.FC = () => {
  const {
    content,
    updateContent,
    presets,
    refreshPresets,
    addPreset,
    updatePreset,
    deletePreset,
    apis,
    addLog,
    currentUser,
    adminUser,
    settings,
  } = useApp();

  // Active System Content state
  const [senderName, setSenderName] = useState('Support Team');
  const [subject, setSubject] = useState('Update regarding your account {name}');
  const [bodyMode, setBodyMode] = useState<'html' | 'plain'>('html');
  const [bodyHtml, setBodyHtml] = useState(
    `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">\n    <h2 style="color: #0f172a; margin-top: 0;">Hello {name}! 👋</h2>\n    <p style="font-size: 15px; line-height: 1.6; color: #475569;">\n        Thank you for connecting with us at <strong>{company}</strong>.\n    </p>\n</div>`
  );
  const [bodyText, setBodyText] = useState(
    'Hello {name}!\n\nThank you for connecting with us at {company}.\n\nBest,\n{sender_name}'
  );
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [replyTo, setReplyTo] = useState('');
  const [autoReplyTo, setAutoReplyTo] = useState(true);
  const [unsubscribeUrl, setUnsubscribeUrl] = useState('');
  const [enableOneClickUnsubscribe, setEnableOneClickUnsubscribe] = useState(true);
  const [trackOpens, setTrackOpens] = useState(false);
  const [trackClicks, setTrackClicks] = useState(false);

  const [isSavingContent, setIsSavingContent] = useState(false);
  const [contentSaveSuccess, setContentSaveSuccess] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

  // Preset modal states
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetTitle, setPresetTitle] = useState('');
  const [presetSender, setPresetSender] = useState('');
  const [presetSubject, setPresetSubject] = useState('');
  const [presetHtml, setPresetHtml] = useState('');
  const [presetText, setPresetText] = useState('');
  const [presetSearch, setPresetSearch] = useState('');

  // Preview modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDynamicTagsModalOpen, setIsDynamicTagsModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<{ html: string; text: string; mode: 'html' | 'plain' }>({
    html: '',
    text: '',
    mode: 'html',
  });

  // Live Test Dispatcher state
  const [selectedApiId, setSelectedApiId] = useState<string>('');
  const [testRecipient, setTestRecipient] = useState<string>(adminUser?.email || 'test@example.com');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync initial content from DB
  useEffect(() => {
    if (content) {
      if (content.senderNames && content.senderNames.length > 0) {
        setSenderName(content.senderNames[0]);
      }
      if (content.subjects && content.subjects.length > 0) {
        setSubject(content.subjects[0]);
      }
      if (content.bodyHtml !== undefined && content.bodyHtml.trim() !== '') {
        setBodyHtml(content.bodyHtml);
      }
      if (content.bodyText !== undefined && content.bodyText.trim() !== '') {
        setBodyText(content.bodyText);
      }
      if (content.attachments !== undefined) {
        setAttachments(content.attachments);
      }
      if (content.replyTo !== undefined) {
        setReplyTo(content.replyTo);
      }
      if (content.autoReplyTo !== undefined) {
        setAutoReplyTo(content.autoReplyTo);
      }
      if (content.unsubscribeUrl !== undefined) {
        setUnsubscribeUrl(content.unsubscribeUrl);
      }
      if (content.enableOneClickUnsubscribe !== undefined) {
        setEnableOneClickUnsubscribe(content.enableOneClickUnsubscribe);
      }
      if (content.trackOpens !== undefined) {
        setTrackOpens(content.trackOpens);
      }
      if (content.trackClicks !== undefined) {
        setTrackClicks(content.trackClicks);
      }
    }
  }, [content]);

  // Set default API for test send if available
  useEffect(() => {
    if (apis.length > 0 && !selectedApiId) {
      const active = apis.find((a) => a.status === 'active') || apis[0];
      setSelectedApiId(active.id);
    }
  }, [apis, selectedApiId]);

  const handleSaveSystemContent = async () => {
    setIsSavingContent(true);
    try {
      const payloadHtml = bodyMode === 'html' ? bodyHtml : (bodyHtml || bodyText);
      const payloadText = bodyText.trim() ? bodyText : htmlToPlainText(payloadHtml);

      await updateContent({
        senderNames: senderName.trim() ? [senderName.trim()] : ['Support Team'],
        subjects: subject.trim() ? [subject.trim()] : ['Quick update regarding your account {name}'],
        bodyHtml: payloadHtml,
        bodyText: payloadText,
        attachments,
        replyTo: replyTo.trim(),
        autoReplyTo,
        unsubscribeUrl: unsubscribeUrl.trim(),
        enableOneClickUnsubscribe,
        trackOpens,
        trackClicks,
      });

      setContentSaveSuccess(true);
      addLog({
        level: 'info',
        message: 'Admin updated global system email template & content in Neon Postgres',
      });
      setTimeout(() => setContentSaveSuccess(false), 2500);
    } catch (err: any) {
      alert(`Failed to save content: ${err.message}`);
    } finally {
      setIsSavingContent(false);
    }
  };

  const insertTag = (tag: string) => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (bodyMode === 'html') {
        const next = bodyHtml.substring(0, start) + tag + bodyHtml.substring(end);
        setBodyHtml(next);
      } else {
        const next = bodyText.substring(0, start) + tag + bodyText.substring(end);
        setBodyText(next);
      }
    } else {
      if (bodyMode === 'html') setBodyHtml((prev) => prev + tag);
      else setBodyText((prev) => prev + tag);
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(tag).catch(() => {});
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingAttachment(true);
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds 25MB limit.`);
        continue;
      }
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64Content = (reader.result as string).split(',')[1];
            const res = await uploadFileToStorage({
              fileName: file.name,
              base64Content,
              mimeType: file.type || 'application/octet-stream',
              source: 'attachment',
              uploadedBy: adminUser?.email || 'admin',
            });
            const uploadedFile = res.file;
            if (res.success && uploadedFile) {
              setAttachments((prev) => [
                ...prev,
                {
                  id: uploadedFile.id,
                  name: uploadedFile.fileName,
                  size: uploadedFile.fileSize,
                  type: uploadedFile.mimeType,
                  url: uploadedFile.s3Url,
                  s3Key: uploadedFile.s3Key,
                  uploadedAt: new Date().toISOString(),
                },
              ]);
            }
          } catch (err) {
            console.error('Attachment upload failed:', err);
          } finally {
            resolve();
          }
        };
        reader.readAsDataURL(file);
      });
    }
    setIsUploadingAttachment(false);
    e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Preset operations
  const openNewPresetModal = () => {
    setEditingPresetId(null);
    setPresetTitle('');
    setPresetSender(senderName);
    setPresetSubject(subject);
    setPresetHtml(bodyHtml);
    setPresetText(bodyText);
    setIsPresetModalOpen(true);
  };

  const openEditPresetModal = (preset: EmailPreset) => {
    setEditingPresetId(preset.id);
    setPresetTitle(preset.title);
    setPresetSender(preset.sender);
    setPresetSubject(preset.subject);
    setPresetHtml(preset.html);
    setPresetText(preset.text);
    setIsPresetModalOpen(true);
  };

  const handleSavePresetModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetTitle.trim()) {
      alert('Please provide a preset title.');
      return;
    }

    const finalPresetText = presetText.trim() ? presetText : htmlToPlainText(presetHtml);

    if (editingPresetId) {
      await updatePreset(editingPresetId, {
        title: presetTitle.trim(),
        sender: presetSender.trim(),
        subject: presetSubject.trim(),
        html: presetHtml,
        text: finalPresetText,
      });
      addLog({
        level: 'info',
        message: `Admin updated preset "${presetTitle}" in Neon Postgres`,
      });
    } else {
      await addPreset({
        title: presetTitle.trim(),
        sender: presetSender.trim() || 'R Sender Support',
        subject: presetSubject.trim() || 'Update regarding your account {name}',
        html: presetHtml,
        text: finalPresetText,
        createdBy: adminUser?.email || 'admin',
      });
      addLog({
        level: 'info',
        message: `Admin created new preset "${presetTitle}" in Neon Postgres`,
      });
    }

    setIsPresetModalOpen(false);
  };

  const handleDeletePreset = async (preset: EmailPreset) => {
    if (confirm(`Are you sure you want to delete preset "${preset.title}"?`)) {
      await deletePreset(preset.id);
      addLog({
        level: 'info',
        message: `Admin deleted preset "${preset.title}" from Neon Postgres`,
      });
    }
  };

  const handleApplyPresetToContent = (preset: EmailPreset) => {
    setSenderName(preset.sender);
    setSubject(preset.subject);
    setBodyHtml(preset.html);
    setBodyText(preset.text);
    addLog({
      level: 'info',
      message: `Admin loaded preset "${preset.title}" into system default editor`,
    });
  };

  // Live Test Dispatcher
  const handleSendTestEmail = async () => {
    if (!selectedApiId) {
      alert('Please configure or select an active Resend API key first.');
      return;
    }
    const api = apis.find((a) => a.id === selectedApiId);
    if (!api) {
      alert('Selected API key was not found.');
      return;
    }

    if (!testRecipient.trim() || !testRecipient.includes('@')) {
      alert('Please enter a valid test recipient email address.');
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);

    const {
      subject: interpolatedSubject,
      bodyHtml: interpolatedHtml,
      bodyText: interpolatedText,
    } = interpolateEmailPayload({
      subject,
      bodyHtml: bodyMode === 'html' ? bodyHtml : undefined,
      bodyText,
      recipient: {
        email: testRecipient.trim(),
        name: 'Admin Test User',
        company: 'R Sender Admin',
      },
      sender: {
        email: settings?.defaultSenderEmail || 'mail@domain.com',
        name: settings?.defaultSenderName || 'Dispatcher',
        company: settings?.companyName || 'Your Company',
        companyAddress: settings?.companyAddress || '123 Business Rd, City, Country',
      },
    });

    const finalPlainAlternative =
      interpolatedText && interpolatedText.trim().length > 0
        ? interpolatedText
        : (interpolatedHtml ? htmlToPlainText(interpolatedHtml) : undefined);

    try {
      const res = await sendEmailViaResend({
        apiKey: api.key,
        from: `${senderName.trim()} <${api.senderEmail}>`,
        to: testRecipient.trim(),
        subject: interpolatedSubject,
        html: interpolatedHtml,
        text: finalPlainAlternative,
      });

      if (res.success) {
        setTestResult({
          success: true,
          message: `Email dispatched successfully! Message ID: ${res.id || 'ok'}`,
        });
        addLog({
          level: 'success',
          apiName: api.name,
          recipient: testRecipient.trim(),
          message: `Admin sent test template email successfully via ${api.name}`,
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Failed to dispatch test email via Resend API.',
        });
        addLog({
          level: 'error',
          apiName: api.name,
          recipient: testRecipient.trim(),
          message: `Admin test email failed: ${res.error || 'Unknown error'}`,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network exception occurred while dispatching test email.',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const filteredPresets = presets.filter(
    (p) =>
      p.title.toLowerCase().includes(presetSearch.toLowerCase()) ||
      p.subject.toLowerCase().includes(presetSearch.toLowerCase()) ||
      p.sender.toLowerCase().includes(presetSearch.toLowerCase())
  );

  return (
    <div className="p-3.5 md:p-4 max-w-7xl mx-auto space-y-3">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-amber-500/10 text-amber-400">
            <FileText className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-semibold text-white tracking-tight">
            Email Content & Templates
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsScannerModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold rounded border border-emerald-500/40 transition-colors shadow-sm"
            title="Deliverability Scanner"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Scan</span>
          </button>
          <button
            type="button"
            onClick={openNewPresetModal}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>New Preset</span>
          </button>
          <button
            type="button"
            onClick={handleSaveSystemContent}
            disabled={isSavingContent}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors shrink-0 disabled:opacity-50"
          >
            {contentSaveSuccess ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Save className="w-3.5 h-3.5" />}
            <span>{contentSaveSuccess ? 'Saved!' : isSavingContent ? 'Saving...' : 'Save Content'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        {/* Left 2 Columns: System Default Content Editor */}
        <div className="lg:col-span-2 space-y-3.5">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                System Default Email Content
              </h3>
            </div>

            {/* Sender & Subject */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                  Default Sender Name
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Acme Support or Billing Team"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                  Default Subject Line
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Quick update regarding your R Sender account {name}"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Body Editor Container */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setBodyMode('html')}
                    className={`px-2.5 py-1 rounded text-xs transition-colors font-medium ${
                      bodyMode === 'html'
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    HTML Body
                  </button>
                  <button
                    type="button"
                    onClick={() => setBodyMode('plain')}
                    className={`px-2.5 py-1 rounded text-xs transition-colors font-medium ${
                      bodyMode === 'plain'
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Plain Text
                  </button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setIsDynamicTagsModalOpen(true)}
                    className="bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>All Tags</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('{first_name}')}
                    className="bg-slate-900 border border-slate-800 hover:border-emerald-500 text-emerald-400 px-2 py-0.5 rounded text-[11px] font-mono transition-colors"
                    title="Insert {first_name} (Recipient First Name)"
                  >
                    {'{first_name}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('{order_ref}')}
                    className="bg-slate-900 border border-slate-800 hover:border-indigo-500 text-indigo-400 px-2 py-0.5 rounded text-[11px] font-mono transition-colors"
                    title="Insert {order_ref} (Safe Order Reference)"
                  >
                    {'{order_ref}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('{date}')}
                    className="bg-slate-900 border border-slate-800 hover:border-purple-500 text-purple-400 px-2 py-0.5 rounded text-[11px] font-mono transition-colors"
                    title="Insert {date} (Current Date)"
                  >
                    {'{date}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('{company}')}
                    className="bg-slate-900 border border-slate-800 hover:border-amber-500 text-amber-400 px-2 py-0.5 rounded text-[11px] font-mono transition-colors"
                    title="Insert {company} (Recipient company)"
                  >
                    {'{company}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewContent({ html: bodyHtml, text: bodyText, mode: bodyMode });
                      setIsPreviewOpen(true);
                    }}
                    className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded text-xs transition-colors"
                  >
                    <Eye className="w-3 h-3 inline mr-1" />
                    Preview
                  </button>
                </div>
              </div>

              <textarea
                ref={textareaRef}
                value={bodyMode === 'html' ? bodyHtml : bodyText}
                onChange={(e) => (bodyMode === 'html' ? setBodyHtml(e.target.value) : setBodyText(e.target.value))}
                placeholder={bodyMode === 'plain' ? 'Enter plain text email body...' : 'Enter HTML email template...'}
                className="w-full min-h-[220px] resize-y font-mono text-xs leading-relaxed bg-slate-900 border border-slate-800 text-slate-200 p-3 rounded focus:border-amber-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Attachments Section */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Attachments
                </span>
                <label className="bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isUploadingAttachment ? 'Uploading...' : '+ Upload Attachment'}</span>
                  <input
                    type="file"
                    multiple
                    disabled={isUploadingAttachment}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex gap-2 flex-wrap items-center">
                {attachments.length === 0 ? (
                  <span className="text-xs text-slate-500 font-mono">0 attached</span>
                ) : (
                  attachments.map((file) => (
                    <div
                      key={file.id}
                      className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded text-xs flex items-center gap-2 text-slate-300"
                    >
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(file.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors text-sm font-bold ml-1"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Anti-Spam & Deliverability Settings */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  Anti-Spam & Deliverability Defaults
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={enableOneClickUnsubscribe}
                    onChange={(e) => setEnableOneClickUnsubscribe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-amber-600 focus:ring-0 cursor-pointer"
                  />
                  <span>RFC 8058 One-Click Header</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 border-t border-slate-900">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="adminReplyToInput" className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                      Reply-To Address
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-amber-400 hover:text-amber-300 select-none">
                      <input
                        type="checkbox"
                        checked={autoReplyTo}
                        onChange={(e) => setAutoReplyTo(e.target.checked)}
                        className="w-3 h-3 rounded bg-slate-900 border-slate-700 text-amber-600 focus:ring-0 cursor-pointer"
                      />
                      <span className="font-medium">Auto (Same Sender Domain)</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    id="adminReplyToInput"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder={autoReplyTo ? "Auto: defaults to sender (or enter external email / 'support')" : "Support Team <support@yourdomain.com>"}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="adminUnsubUrlInput" className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    List-Unsubscribe URL
                  </label>
                  <input
                    type="text"
                    id="adminUnsubUrlInput"
                    value={unsubscribeUrl}
                    onChange={(e) => setUnsubscribeUrl(e.target.value)}
                    placeholder="https://yourdomain.com/unsubscribe?email={EMAIL}"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Global Tracking Options */}
            <div className="flex flex-wrap items-center gap-6 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={trackOpens}
                  onChange={(e) => setTrackOpens(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-amber-600 focus:ring-amber-500 focus:ring-offset-slate-900 w-3.5 h-3.5"
                />
                <span className="text-xs text-slate-300">Track Email Opens</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={trackClicks}
                  onChange={(e) => setTrackClicks(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-amber-600 focus:ring-amber-500 focus:ring-offset-slate-900 w-3.5 h-3.5"
                />
                <span className="text-xs text-slate-300">Track Link Clicks</span>
              </label>
            </div>
          </div>

          {/* Section: Live Deliverability Test Dispatcher */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <h3 className="text-xs font-semibold text-white">
                  Test Dispatch
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400 font-medium">Select Resend API Key</label>
                <select
                  value={selectedApiId}
                  onChange={(e) => setSelectedApiId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {apis.length === 0 ? (
                    <option value="">No APIs configured</option>
                  ) : (
                    apis.map((api) => (
                      <option key={api.id} value={api.id}>
                        {api.name} ({api.senderEmail}) - {api.status}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400 font-medium">Test Recipient Email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="admin@example.com"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={isSendingTest || !selectedApiId}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSendingTest ? 'Sending...' : 'Send Test'}</span>
                  </button>
                </div>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span className="font-mono">{testResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Column: Presets & Templates Catalog */}
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <h3 className="text-xs font-semibold text-white">
                  Presets
                </h3>
              </div>
              <span className="text-[10px] font-mono text-amber-400">{presets.length} saved</span>
            </div>

            {/* Search presets */}
            <div>
              <input
                type="text"
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* Presets List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredPresets.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  No presets found. Click "+ New Preset" to create one.
                </div>
              ) : (
                filteredPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-1.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-semibold text-white">{preset.title}</h4>
                        <p className="text-[11px] text-slate-400 truncate">{preset.sender}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewContent({ html: preset.html, text: preset.text, mode: 'html' });
                            setIsPreviewOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                          title="Preview template"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditPresetModal(preset)}
                          className="p-1 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
                          title="Edit preset"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(preset)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                          title="Delete preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 font-mono truncate">{preset.subject}</p>

                    <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {preset.createdAt ? new Date(preset.createdAt).toLocaleDateString() : 'System'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApplyPresetToContent(preset)}
                        className="text-[11px] text-amber-400 hover:text-amber-300 font-medium transition-colors"
                      >
                        Apply to Editor &rarr;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preset Create / Edit Modal */}
      {isPresetModalOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-[1300] p-4"
          onClick={() => setIsPresetModalOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-lg p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-xs font-semibold text-white">
                {editingPresetId ? 'Edit Preset Template' : 'Create New Email Preset'}
              </h3>
              <button
                type="button"
                onClick={() => setIsPresetModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSavePresetModal} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Preset Title</label>
                <input
                  type="text"
                  required
                  value={presetTitle}
                  onChange={(e) => setPresetTitle(e.target.value)}
                  placeholder="e.g., Q1 Onboarding Follow-Up"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">Sender Name</label>
                  <input
                    type="text"
                    value={presetSender}
                    onChange={(e) => setPresetSender(e.target.value)}
                    placeholder="e.g. Acme Support or Billing Team"
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">Subject Line</label>
                  <input
                    type="text"
                    value={presetSubject}
                    onChange={(e) => setPresetSubject(e.target.value)}
                    placeholder="Hello {name}"
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">HTML Content</label>
                <textarea
                  value={presetHtml}
                  onChange={(e) => setPresetHtml(e.target.value)}
                  rows={5}
                  placeholder="<div>HTML email...</div>"
                  className="bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Plain Text Fallback</label>
                <textarea
                  value={presetText}
                  onChange={(e) => setPresetText(e.target.value)}
                  rows={3}
                  placeholder="Plain text fallback..."
                  className="bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPresetModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded"
                >
                  {editingPresetId ? 'Update Preset' : 'Save to Database'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Preview Modal */}
      {isPreviewOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-[1400] p-4"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-semibold text-white">Email Template Preview</h3>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto bg-white text-slate-900 flex-1">
              {(() => {
                const samplePayload = interpolateEmailPayload({
                  subject: subject || 'Test Notification',
                  bodyHtml: previewContent.html,
                  bodyText: previewContent.text,
                  recipient: {
                    email: 'jane.doe@acmecorp.com',
                    name: 'Jane Doe',
                    company: 'Acme Corp',
                  },
                  sender: {
                    email: settings?.defaultSenderEmail || 'mail@domain.com',
                    name: settings?.defaultSenderName || 'Dispatcher',
                    company: settings?.companyName || 'Your Company',
                    companyAddress: settings?.companyAddress || '123 Business Rd, City, Country',
                  },
                });

                return previewContent.mode === 'plain' ? (
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-800">
                    {samplePayload.bodyText || '(Empty plain text)'}
                  </pre>
                ) : (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: samplePayload.bodyHtml || '<p>(Empty HTML)</p>',
                    }}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* Dynamic Tags Selection Modal */}
      <DynamicTagsModal
        isOpen={isDynamicTagsModalOpen}
        onClose={() => setIsDynamicTagsModalOpen(false)}
        onInsertTag={(tag) => {
          insertTag(tag);
          setIsDynamicTagsModalOpen(false);
        }}
      />

      {/* Deliverability & Anti-Phishing Scanner Modal */}
      <DeliverabilityScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        subject={subject}
        bodyHtml={bodyHtml}
        bodyText={bodyText}
        unsubscribeUrl={unsubscribeUrl}
        enableOneClickUnsubscribe={enableOneClickUnsubscribe}
        onInsertTag={(tag) => insertTag(tag)}
      />
    </div>
  );
};

