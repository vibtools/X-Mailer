import React, { useEffect, useRef, useState } from 'react';
import {
  Save,
  Check,
  Paperclip,
  Eye,
  Tag,
  Dices,
  Trash2,
  Search,
  Plus,
  BookmarkPlus,
  FolderOpen, Copy,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { uploadFileToStorage } from '../../services/apiService';
import { AttachmentItem, EmailPreset } from '../../types';
import {  interpolateEmailPayload } from '../../utils/dynamicTags';
import { htmlToPlainText } from '../../utils/htmlToPlainText';
import { DeliverabilityScannerModal } from '../deliverability/DeliverabilityScannerModal';
import { DynamicTagsModal } from '../deliverability/DynamicTagsModal';

export const ContentPage: React.FC = () => {
  const {
    content,
    updateContent,
    presets,
    addPreset,
    deletePreset,
    addLog,
    currentUser,
    settings,
  } = useApp();

  // Primary form states
  const [senderName, setSenderName] = useState('Support Team');
  const [subject, setSubject] = useState('Update regarding your account {name}');
  const [replyTo, setReplyTo] = useState('');
  const [autoReplyTo, setAutoReplyTo] = useState(true);
  const [unsubscribeUrl, setUnsubscribeUrl] = useState('');
  const [enableOneClickUnsubscribe, setEnableOneClickUnsubscribe] = useState(true);
  const [bodyMode, setBodyMode] = useState<'html' | 'plain'>('html');
  const [bodyHtml, setBodyHtml] = useState(
    `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">\n    <h2 style="color: #0f172a; margin-top: 0;">Hello {name}! 👋</h2>\n    <p style="font-size: 15px; line-height: 1.6; color: #475569;">\n        Thank you for connecting with us at <strong>{company}</strong>.\n    </p>\n</div>`
  );
  const [bodyText, setBodyText] = useState(
    'Hello {name}!\n\nThank you for connecting with us at {company}.\n\nBest,\n{sender_name}'
  );
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [trackOpens, setTrackOpens] = useState(false);
  const [trackClicks, setTrackClicks] = useState(false);

  // UI modal / drawer states
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [_copiedTag, setCopiedTag] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<'html' | 'plain'>('html');
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false);
  const [presetTitleInput, setPresetTitleInput] = useState('');
  const [presetSearch, setPresetSearch] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Random Sender Names Generator
  const usaFirstNames = [
    'Sarah', 'James', 'Emma', 'Michael', 'Sophia', 'William', 'Olivia', 'Alexander',
    'Ava', 'Ethan', 'Mia', 'Benjamin', 'Charlotte', 'Liam', 'Emily', 'Daniel',
  ];
  const usaLastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor',
  ];

  const generateRandomUsName = () => {
    const randomFirst = usaFirstNames[Math.floor(Math.random() * usaFirstNames.length)];
    const randomLast = usaLastNames[Math.floor(Math.random() * usaLastNames.length)];
    const generated = `${randomFirst} ${randomLast} from R Sender`;
    setSenderName(generated);
  };

  // Sync initial content from DB/Context
  useEffect(() => {
    if (content) {
      if (content.senderNames && content.senderNames.length > 0) {
        setSenderName(content.senderNames[0]);
      }
      if (content.subjects && content.subjects.length > 0) {
        setSubject(content.subjects[0]);
      }

      const hasHtml = Boolean(content.bodyHtml && content.bodyHtml.trim() !== '');
      const hasText = Boolean(content.bodyText && content.bodyText.trim() !== '');

      if (hasText && !hasHtml) {
        setBodyMode('plain');
        setBodyText(content.bodyText);
      } else {
        setBodyMode('html');
        if (content.bodyHtml !== undefined && content.bodyHtml.trim() !== '') {
          setBodyHtml(content.bodyHtml);
        }
        if (content.bodyText !== undefined && content.bodyText.trim() !== '') {
          setBodyText(content.bodyText);
        }
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

  const triggerToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => {
      setSaveToast(null);
    }, 2800);
  };

  const loadPreset = (preset: EmailPreset) => {
    setSenderName(preset.sender);
    setSubject(preset.subject);
    setBodyHtml(preset.html);
    setBodyText(preset.text);
    setIsSidebarOpen(false);
    triggerToast(`Loaded: ${preset.title}`);
  };

  const handleSaveActiveContent = async () => {
    setIsSaving(true);
    try {
      const payloadHtml = bodyMode === 'html' ? bodyHtml : (bodyHtml || bodyText);
      const payloadText = bodyText.trim() ? bodyText : htmlToPlainText(payloadHtml);

      await updateContent({
        senderNames: senderName.trim() ? [senderName.trim()] : ['R Sender Support'],
        subjects: subject.trim() ? [subject.trim()] : ['Update regarding your account {name}'],
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

      addLog({
        level: 'info',
        message: `Saved email content & template (Dual-Part MIME + RFC 8058 Anti-Spam Headers)`,
      });

      triggerToast('Content saved successfully!');
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNewPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetTitleInput.trim()) return;

    try {
      const finalPresetText = bodyText.trim() ? bodyText : htmlToPlainText(bodyHtml);
      const created = await addPreset({
        title: presetTitleInput.trim(),
        sender: senderName.trim() || 'R Sender Support',
        subject: subject.trim() || 'Update regarding your account {name}',
        html: bodyHtml,
        text: finalPresetText,
        createdBy: currentUser?.email || 'user',
      });

      if (created) {
        addLog({
          level: 'info',
          message: `Saved email preset "${created.title}"`,
        });
        triggerToast(`Preset "${created.title}" saved!`);
        setIsSavePresetModalOpen(false);
        setPresetTitleInput('');
      }
    } catch (err: any) {
      alert(`Failed to save preset: ${err.message}`);
    }
  };

  const handleDeletePreset = async (preset: EmailPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete preset "${preset.title}"?`)) {
      await deletePreset(preset.id);
      addLog({
        level: 'info',
        message: `Deleted preset "${preset.title}"`,
      });
      triggerToast(`Deleted "${preset.title}"`);
    }
  };

  const insertTag = (tagText: string, target: 'body' | 'subject' = 'body') => {
    if (target === 'subject') {
      setSubject((prev) => (prev ? `${prev} ${tagText}` : tagText));
    } else if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (bodyMode === 'html') {
        const updated = bodyHtml.substring(0, start) + tagText + bodyHtml.substring(end);
        setBodyHtml(updated);
      } else {
        const updated = bodyText.substring(0, start) + tagText + bodyText.substring(end);
        setBodyText(updated);
      }
    } else {
      if (bodyMode === 'html') {
        setBodyHtml((prev) => prev + tagText);
      } else {
        setBodyText((prev) => prev + tagText);
      }
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(tagText).catch(() => {});
    }

    setIsTagModalOpen(false);
    triggerToast(`Inserted ${tagText} into ${target}`);
  };

  const _handleCopyTag = (tagText: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(tagText).catch(() => {});
    }
    setCopiedTag(tagText);
    triggerToast(`Copied ${tagText} to clipboard`);
    setTimeout(() => {
      setCopiedTag((prev) => (prev === tagText ? null : prev));
    }, 1800);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const fileList = Array.from(files);

    for (const file of fileList) {
      if (file.size > 25 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds 25MB limit.`);
        continue;
      }

      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64String = (reader.result as string).split(',')[1];
            const uploadRes = await uploadFileToStorage({
              fileName: file.name,
              base64Content: base64String,
              mimeType: file.type || 'application/octet-stream',
              source: 'attachment',
              uploadedBy: currentUser?.email || 'user',
            });

            if (uploadRes.success && uploadRes.file) {
              const newAttachment: AttachmentItem = {
                id: uploadRes.file.id,
                name: uploadRes.file.fileName,
                size: uploadRes.file.fileSize,
                type: uploadRes.file.mimeType,
                url: uploadRes.file.s3Url,
                s3Key: uploadRes.file.s3Key,
                uploadedAt: new Date().toISOString(),
              };
              setAttachments((prev) => [...prev, newAttachment]);
            } else {
              alert(uploadRes.error || 'Attachment upload failed.');
            }
          } catch (err: any) {
            console.error('Attachment upload error:', err);
          } finally {
            resolve();
          }
        };
        reader.readAsDataURL(file);
      });
    }

    setIsUploading(false);
    e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const filteredPresets = presets.filter(
    (p) =>
      p.title.toLowerCase().includes(presetSearch.toLowerCase()) ||
      p.subject.toLowerCase().includes(presetSearch.toLowerCase()) ||
      p.sender.toLowerCase().includes(presetSearch.toLowerCase())
  );

  return (
    <div className="p-4 md:p-5 max-w-7xl mx-auto space-y-3.5">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3 relative">
        {/* Toast Notification */}
        {saveToast && (
          <div className="absolute top-3 right-3 sm:right-64 bg-indigo-600 text-white px-3 py-1 rounded text-xs font-medium shadow-lg transition-all animate-fade-in z-50">
            {saveToast}
          </div>
        )}

        <div className="flex items-center gap-2">
          <h2 className="text-sm md:text-base font-semibold text-white tracking-tight">Content Sandbox</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsScannerModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold rounded-md border border-emerald-500/40 transition-colors shadow-sm"
            title="Run Deliverability & Anti-Phishing Scan"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Scan</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md border border-slate-700/80 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>Presets ({presets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPresetTitleInput(subject.replace(/{name}/gi, '').trim() || 'Custom Template');
              setIsSavePresetModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md border border-slate-700/80 transition-colors"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Save As Preset</span>
          </button>
          <button
            type="button"
            onClick={handleSaveActiveContent}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Content'}</span>
          </button>
        </div>
      </div>

      {/* Main Sandbox Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3">
        {/* Top 2-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Sender Name */}
          <div className="flex flex-col gap-1">
            <label htmlFor="senderInput" className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              Sender Name
            </label>
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                id="senderInput"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="e.g. Acme Support or Billing Team"
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={generateRandomUsName}
                title="Generate Random USA Name"
                className="bg-slate-950 border border-slate-800 hover:border-indigo-500 hover:bg-slate-800 text-slate-200 px-2.5 py-1.5 rounded text-xs transition-colors shrink-0 flex items-center gap-1"
              >
                <Dices className="w-3.5 h-3.5 text-indigo-400" />
              </button>
            </div>
          </div>

          {/* Subject Line */}
          <div className="flex flex-col gap-1">
            <label htmlFor="subjectInput" className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              Subject Line
            </label>
            <input
              type="text"
              id="subjectInput"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick update regarding your R Sender account {name}"
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Anti-Spam & Deliverability (RFC 8058 & Reply-To Routing) */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">Anti-Spam & Deliverability</span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={enableOneClickUnsubscribe}
                onChange={(e) => setEnableOneClickUnsubscribe(e.target.checked)}
                className="w-3 h-3 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span>RFC 8058 One-Click Header</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 border-t border-slate-900">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor="replyToInput" className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  Reply-To Address
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-indigo-400 hover:text-indigo-300 select-none">
                  <input
                    type="checkbox"
                    checked={autoReplyTo}
                    onChange={(e) => setAutoReplyTo(e.target.checked)}
                    className="w-3 h-3 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                  <span className="font-medium">Auto (Same Sender Domain)</span>
                </label>
              </div>
              <input
                type="text"
                id="replyToInput"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder={autoReplyTo ? "Auto: defaults to sender (or enter external email / 'support')" : "Support Team <support@yourdomain.com>"}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor="unsubUrlInput" className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  List-Unsubscribe URL
                </label>
                <span className="text-[9px] text-slate-500 font-mono">
                  Default: {settings?.defaultUnsubscribeUrl || 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}'}
                </span>
              </div>
              <input
                type="text"
                id="unsubUrlInput"
                value={unsubscribeUrl}
                onChange={(e) => setUnsubscribeUrl(e.target.value)}
                placeholder={settings?.defaultUnsubscribeUrl || 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}'}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Body Section with Single Textarea & Controls */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setBodyMode('html')}
                className={`px-2.5 py-1 rounded text-xs transition-colors font-medium ${
                  bodyMode === 'html'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                HTML Body
              </button>
              <button
                type="button"
                onClick={() => setBodyMode('plain')}
                className={`px-2.5 py-1 rounded text-xs transition-colors font-medium ${
                  bodyMode === 'plain'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Plain Text
              </button>

              {bodyMode === 'plain' && (
                <button
                  type="button"
                  onClick={() => {
                    const extracted = htmlToPlainText(bodyHtml);
                    setBodyText(extracted);
                    triggerToast('Plain-text synchronized from HTML template!');
                  }}
                  className="bg-slate-900 border border-indigo-900/60 hover:border-indigo-600 hover:bg-slate-800 text-indigo-300 px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                  title="Auto-convert HTML to RFC-compliant Plain Text"
                >
                  <RefreshCw className="w-3 h-3 text-indigo-400" />
                  <span>Sync from HTML</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsTagModalOpen(true)}
                className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
              >
                <Tag className="w-3 h-3 text-indigo-400" />
                <span>Tags</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(true)}
                className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
              >
                <Eye className="w-3 h-3 text-emerald-400" />
                <span>Preview</span>
              </button>
            </div>
          </div>

          <div id="editorContainer">
            <textarea
              ref={textareaRef}
              id="bodyTextarea"
              value={bodyMode === 'html' ? bodyHtml : bodyText}
              onChange={(e) => (bodyMode === 'html' ? setBodyHtml(e.target.value) : setBodyText(e.target.value))}
              placeholder={bodyMode === 'plain' ? 'Enter plain text content...' : 'Enter HTML email body...'}
              className="w-full min-h-[190px] resize-y font-mono text-xs leading-relaxed bg-slate-900 border border-slate-800 text-slate-200 p-3 rounded focus:border-indigo-500 focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Compact Attachment Section */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Attachments</span>
            <label className="bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isUploading ? 'Uploading...' : '+ Upload File'}</span>
              <input
                type="file"
                multiple
                disabled={isUploading}
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex gap-1.5 flex-wrap items-center">
            {attachments.length === 0 ? (
              <span className="text-xs text-slate-500 font-mono">0 attached</span>
            ) : (
              attachments.map((file) => (
                <div
                  key={file.id}
                  className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-xs flex items-center gap-1.5 text-slate-300"
                >
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(file.id)}
                    title="Remove"
                    className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer text-sm font-bold ml-1"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tracking Options */}
        <div className="flex flex-wrap items-center gap-6 pt-1 px-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={trackOpens}
              onChange={(e) => setTrackOpens(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 w-3.5 h-3.5"
            />
            <span className="text-xs text-slate-300">Track Email Opens</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={trackClicks}
              onChange={(e) => setTrackClicks(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 w-3.5 h-3.5"
            />
            <span className="text-xs text-slate-300">Track Link Clicks</span>
          </label>
        </div>
      </div>

      {/* Deliverability & Anti-Phishing Scanner Modal */}
      <DeliverabilityScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        subject={subject}
        bodyHtml={bodyHtml}
        bodyText={bodyText}
        unsubscribeUrl={unsubscribeUrl}
        enableOneClickUnsubscribe={enableOneClickUnsubscribe}
        onInsertTag={(tag) => insertTag(tag, 'body')}
      />

      {/* Dynamic Tags Selection Popup Modal */}
      <DynamicTagsModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        onInsertTag={(tag) => insertTag(tag, 'body')}
      />

      {/* Save Preset Dialog Modal */}
      {isSavePresetModalOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-[1100] p-4"
          onClick={() => setIsSavePresetModalOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-md p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-xs font-semibold text-white">Save as Reusable Preset</h3>
              <button
                type="button"
                onClick={() => setIsSavePresetModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveNewPreset} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Preset Title</label>
                <input
                  type="text"
                  required
                  value={presetTitleInput}
                  onChange={(e) => setPresetTitleInput(e.target.value)}
                  placeholder="e.g. Outreach Follow Up Template"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800/80 space-y-1 font-mono">
                <div>Sender: <span className="text-slate-200">{senderName}</span></div>
                <div className="truncate">Subject: <span className="text-slate-200">{subject}</span></div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSavePresetModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded"
                >
                  Save Preset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Size Preview Popup Modal */}
      {isPreviewModalOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-[1000] p-4"
          onClick={() => setIsPreviewModalOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex justify-between items-center gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-white">Email Preview</h3>
                <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('html')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      previewTab === 'html'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    HTML Render
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('plain')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      previewTab === 'plain'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Plain-Text (MIME Part)
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="text-slate-400 hover:text-white text-base leading-none"
              >
                &times;
              </button>
            </div>
            <div className={`p-4 overflow-y-auto flex-1 ${previewTab === 'html' ? 'bg-white text-slate-900' : 'bg-slate-950 text-slate-100 font-mono text-xs'}`}>
              {(() => {
                const samplePayload = interpolateEmailPayload({
                  subject: subject || 'Notification',
                  bodyHtml,
                  bodyText,
                  recipient: {
                    email: currentUser?.email || 'user@example.com',
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

                if (previewTab === 'plain') {
                  const plainContent = samplePayload.bodyText || (samplePayload.bodyHtml ? htmlToPlainText(samplePayload.bodyHtml) : '(Empty plain text body)');
                  return (
                    <div className="space-y-3">
                      <div className="bg-slate-900 border border-slate-800 p-2.5 rounded text-[11px] text-slate-400 flex items-center justify-between">
                        <span className="text-emerald-400 font-semibold">✓ RFC 2046 Alternative MIME Part</span>
                        <span className="text-slate-500">MIME Type: text/plain; charset=utf-8</span>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200 bg-slate-900/60 p-3 rounded border border-slate-800">
                        {plainContent}
                      </pre>
                    </div>
                  );
                }

                return (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: samplePayload.bodyHtml || '<p>(Empty HTML body)</p>',
                    }}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Right Sidebar Drawer for Preset History */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[1100]"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[360px] bg-slate-900 border-l border-slate-800 shadow-2xl transition-transform duration-300 ease-in-out z-[1200] flex flex-col p-4 ${
          isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-semibold text-white">Preset Templates Directory</h3>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="text-slate-400 hover:text-white text-base leading-none"
          >
            &times;
          </button>
        </div>

        {/* Search */}
        <div className="mb-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={presetSearch}
              onChange={(e) => setPresetSearch(e.target.value)}
              placeholder="Search presets..."
              className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
          {filteredPresets.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No presets saved yet.
            </div>
          ) : (
            filteredPresets.map((preset) => (
              <div
                key={preset.id}
                onClick={() => loadPreset(preset)}
                className="bg-slate-950 border border-slate-800 rounded p-2.5 cursor-pointer transition-colors hover:border-indigo-500 group"
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="text-xs font-medium text-white mb-0.5 group-hover:text-indigo-300 transition-colors">
                    {preset.title}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeletePreset(preset, e)}
                    title="Delete preset"
                    className="text-slate-500 hover:text-rose-400 p-0.5 rounded opacity-60 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 truncate font-mono">
                  {preset.sender}
                </div>
                <div className="text-[11px] text-slate-500 truncate font-mono">
                  {preset.subject}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

