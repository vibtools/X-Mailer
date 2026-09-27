import React, { useState, useMemo } from 'react';
import {
  ExternalLink,
  RotateCw,
  Send,
  Globe,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Key,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ResendApiKey } from '../../types';
import { testResendApiKey, sendEmailViaResend, verifySmtpChannelApi } from '../../services/apiService';

export const ApisPage: React.FC = () => {
  const { currentUser, apis, addApi, updateApi, deleteApi, getLockedApiIds, addLog } = useApp();

  // Connect Modal State
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [connectProviderType, setConnectProviderType] = useState<'resend' | 'smtp'>('resend');
  const [apiLabel, setApiLabel] = useState('');
  const [resendKey, setResendKey] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [dailyLimit, setDailyLimit] = useState(1000);
  const [showKeyText, setShowKeyText] = useState(false);
  const [isSavingApi, setIsSavingApi] = useState(false);

  // SMTP Connect Form Fields
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // Edit Modal State
  const [apiToEdit, setApiToEdit] = useState<ResendApiKey | null>(null);
  const [editProviderType, setEditProviderType] = useState<'resend' | 'smtp'>('resend');
  const [editLabel, setEditLabel] = useState('');
  const [editKey, setEditKey] = useState('');
  const [editSenderEmail, setEditSenderEmail] = useState('');
  const [editDailyLimit, setEditDailyLimit] = useState(1000);
  const [showEditKeyText, setShowEditKeyText] = useState(false);
  const [isEditTesting, setIsEditTesting] = useState(false);
  const [editSmtpHost, setEditSmtpHost] = useState('');
  const [editSmtpPort, setEditSmtpPort] = useState(587);
  const [editSmtpSecure, setEditSmtpSecure] = useState(false);
  const [editSmtpUser, setEditSmtpUser] = useState('');
  const [editSmtpPass, setEditSmtpPass] = useState('');
  const [showEditSmtpPass, setShowEditSmtpPass] = useState(false);
  const [editTestResult, setEditTestResult] = useState<{
    tested: boolean;
    valid: boolean;
    message: string;
    verifiedDomains?: string[];
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Testing state inside connect modal
  const [isModalTesting, setIsModalTesting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState<{
    tested: boolean;
    valid: boolean;
    message: string;
    verifiedDomains?: string[];
  } | null>(null);

  // Search, Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'UNTESTED' | 'ERROR'>('ALL');
  const [rowsPerPage, setRowsPerPage] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reTestingId, setReTestingId] = useState<string | null>(null);

  // Delete Confirmation Modal State
  const [apiToDelete, setApiToDelete] = useState<ResendApiKey | null>(null);

  // Live Test Email Modal State
  const [testSendModalApi, setTestSendModalApi] = useState<ResendApiKey | null>(null);
  const [testRecipient, setTestRecipient] = useState(currentUser?.email || 'test@example.com');
  const [testSubject, setTestSubject] = useState('');
  const [isSendingLiveTest, setIsSendingLiveTest] = useState(false);
  const [liveTestFeedback, setLiveTestFeedback] = useState<{ success?: boolean; message: string; id?: string } | null>(null);

  const lockedApiMap = getLockedApiIds();

  // Calculate filtered dataset
  const filteredApis = useMemo(() => {
    return apis.filter((item) => {
      const matchesQuery =
        item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.senderEmail.toLowerCase().includes(searchQuery.toLowerCase().trim());
      
      let matchesStatus = true;
      if (statusFilter === 'ACTIVE') {
        matchesStatus = item.status === 'active' || item.status === 'sending_only';
      } else if (statusFilter === 'UNTESTED') {
        matchesStatus = item.status === 'untested';
      } else if (statusFilter === 'ERROR') {
        matchesStatus = item.status === 'error';
      }

      return matchesQuery && matchesStatus;
    });
  }, [apis, searchQuery, statusFilter]);

  // Pagination calculations
  const totalItems = filteredApis.length;
  const totalPages = Math.ceil(totalItems / rowsPerPage) || 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (validCurrentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalItems);
  const paginatedApis = filteredApis.slice(startIndex, endIndex);

  // Stats
  const totalKeysCount = apis.length;
  const activeKeysCount = apis.filter((a) => a.status === 'active' || a.status === 'sending_only').length;
  const totalCapacity = apis.reduce((acc, curr) => acc + (curr.dailyLimit || 1000), 0);

  // Mask Key Helper: re_EjÃ¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢6RQt
  const maskApiKey = (key: string) => {
    if (!key) return 're_Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢key';
    if (key.length <= 8) return 're_Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢' + key.slice(-3);
    return key.substring(0, 5) + 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢' + key.slice(-4);
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTestConnectKey = async () => {
    setIsModalTesting(true);
    setModalTestResult(null);

    try {
      if (connectProviderType === 'smtp') {
        if (!smtpHost.trim() || !smtpUser.trim()) {
          setModalTestResult({
            tested: true,
            valid: false,
            message: 'Please provide both SMTP Host and Username.',
          });
          return;
        }

        const res = await verifySmtpChannelApi({
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 587,
          smtpSecure,
          smtpUser: smtpUser.trim(),
          smtpPass: smtpPass || '',
          senderEmail: senderEmail.trim() || smtpUser.trim(),
        });

        setModalTestResult({
          tested: true,
          valid: res.success,
          message: res.message,
        });

        if (res.success && !senderEmail) {
          setSenderEmail(smtpUser.trim());
        }
      } else {
        if (!resendKey.trim()) {
          setModalTestResult({
            tested: true,
            valid: false,
            message: 'Please enter a Resend API Key first',
          });
          return;
        }

        const res = await testResendApiKey(resendKey.trim(), senderEmail.trim());
        setModalTestResult({
          tested: true,
          valid: res.valid,
          message: res.message,
          verifiedDomains: res.verifiedDomains,
        });

        if (res.verifiedDomains && res.verifiedDomains.length > 0 && (!senderEmail || senderEmail.includes('resend.dev'))) {
          setSenderEmail(`mail@${res.verifiedDomains[0]}`);
        }
      }
    } catch (err: any) {
      setModalTestResult({
        tested: true,
        valid: false,
        message: err.message || 'Connection test failed',
      });
    } finally {
      setIsModalTesting(false);
    }
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiLabel.trim()) {
      alert('Please fill in Channel Label.');
      return;
    }

    if (connectProviderType === 'smtp') {
      if (!smtpHost.trim() || !smtpUser.trim()) {
        alert('Please fill in both SMTP Host and Username.');
        return;
      }
    } else {
      if (!resendKey.trim()) {
        alert('Please enter Resend API Key.');
        return;
      }
    }

    const cleanSender = senderEmail.trim() || (connectProviderType === 'smtp' ? smtpUser.trim() : '');
    if (!cleanSender || (connectProviderType === 'resend' && cleanSender.toLowerCase().includes('resend.dev'))) {
      alert('DMARC Guard: Please enter a valid Sender Email on your authenticated domain (e.g. mail@yourdomain.com). "onboarding@resend.dev" is prohibited to prevent DMARC alignment failure and spam drops.');
      return;
    }

    setIsSavingApi(true);
    try {
      await addApi({
        name: apiLabel.trim(),
        key: connectProviderType === 'resend' ? resendKey.trim() : '',
        senderEmail: cleanSender,
        dailyLimit: Number(dailyLimit) || 1000,
        usedToday: 0,
        status: modalTestResult?.valid ? 'active' : 'untested',
        lastTested: modalTestResult?.valid ? 'Just now' : undefined,
        testStatusMsg: modalTestResult?.message,
        providerType: connectProviderType,
        provider_type: connectProviderType,
        smtpHost: connectProviderType === 'smtp' ? smtpHost.trim() : undefined,
        smtpPort: connectProviderType === 'smtp' ? Number(smtpPort) || 587 : undefined,
        smtpSecure: connectProviderType === 'smtp' ? smtpSecure : undefined,
        smtpUser: connectProviderType === 'smtp' ? smtpUser.trim() : undefined,
        smtpPass: connectProviderType === 'smtp' ? smtpPass : undefined,
      });

      setApiLabel('');
      setResendKey('');
      setSenderEmail('');
      setSmtpHost('');
      setSmtpPort(587);
      setSmtpSecure(false);
      setSmtpUser('');
      setSmtpPass('');
      setModalTestResult(null);
      setIsConnectModalOpen(false);
    } catch (err: any) {
      alert(`Error creating channel: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSavingApi(false);
    }
  };

  const handleTestEditKey = async () => {
    setIsEditTesting(true);
    setEditTestResult(null);

    try {
      if (editProviderType === 'smtp') {
        if (!editSmtpHost.trim() || !editSmtpUser.trim()) {
          setEditTestResult({
            tested: true,
            valid: false,
            message: 'Please provide both SMTP Host and Username.',
          });
          return;
        }

        const res = await verifySmtpChannelApi({
          smtpHost: editSmtpHost.trim(),
          smtpPort: Number(editSmtpPort) || 587,
          smtpSecure: editSmtpSecure,
          smtpUser: editSmtpUser.trim(),
          smtpPass: editSmtpPass || '',
          senderEmail: editSenderEmail.trim() || editSmtpUser.trim(),
        });

        setEditTestResult({
          tested: true,
          valid: res.success,
          message: res.message,
        });
      } else {
        if (!editKey.trim()) {
          setEditTestResult({
            tested: true,
            valid: false,
            message: 'Please enter an API Key first',
          });
          return;
        }

        const res = await testResendApiKey(editKey.trim(), editSenderEmail.trim());
        setEditTestResult({
          tested: true,
          valid: res.valid,
          message: res.message,
          verifiedDomains: res.verifiedDomains,
        });

        if (res.verifiedDomains && res.verifiedDomains.length > 0 && (!editSenderEmail || editSenderEmail.includes('resend.dev'))) {
          setEditSenderEmail(`mail@${res.verifiedDomains[0]}`);
        }
      }
    } catch (err: any) {
      setEditTestResult({
        tested: true,
        valid: false,
        message: err.message || 'Connection test failed',
      });
    } finally {
      setIsEditTesting(false);
    }
  };

  const handleUpdateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiToEdit) return;
    if (!editLabel.trim()) {
      alert('Please fill in Channel Label.');
      return;
    }

    if (editProviderType === 'smtp') {
      if (!editSmtpHost.trim() || !editSmtpUser.trim()) {
        alert('Please fill in both SMTP Host and Username.');
        return;
      }
    } else {
      if (!editKey.trim()) {
        alert('Please enter Resend API Key.');
        return;
      }
    }

    const cleanSender = editSenderEmail.trim() || (editProviderType === 'smtp' ? editSmtpUser.trim() : '');
    if (!cleanSender || (editProviderType === 'resend' && cleanSender.toLowerCase().includes('resend.dev'))) {
      alert('DMARC Guard: Please enter a valid Sender Email on your authenticated domain (e.g. mail@yourdomain.com). "onboarding@resend.dev" is prohibited to prevent DMARC alignment failure and spam drops.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateApi(apiToEdit.id, {
        name: editLabel.trim(),
        key: editProviderType === 'resend' ? editKey.trim() : '',
        senderEmail: cleanSender,
        dailyLimit: Number(editDailyLimit) || 1000,
        providerType: editProviderType,
        provider_type: editProviderType,
        smtpHost: editProviderType === 'smtp' ? editSmtpHost.trim() : undefined,
        smtpPort: editProviderType === 'smtp' ? Number(editSmtpPort) || 587 : undefined,
        smtpSecure: editProviderType === 'smtp' ? editSmtpSecure : undefined,
        smtpUser: editProviderType === 'smtp' ? editSmtpUser.trim() : undefined,
        smtpPass: editProviderType === 'smtp' ? editSmtpPass : undefined,
        status: editTestResult?.tested
          ? (editTestResult.valid ? 'active' : 'error')
          : apiToEdit.status,
        lastTested: editTestResult?.tested ? 'Just now' : apiToEdit.lastTested,
        testStatusMsg: editTestResult?.tested ? editTestResult.message : apiToEdit.testStatusMsg,
      });
      setApiToEdit(null);
    } catch (err: any) {
      alert(`Error updating channel: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleReTestSingle = async (api: ResendApiKey) => {
    setReTestingId(api.id);
    const isSmtp = (api.providerType || api.provider_type) === 'smtp' || Boolean(api.smtpHost || api.smtp_host);
    try {
      if (isSmtp) {
        const res = await verifySmtpChannelApi({
          smtpHost: api.smtpHost || api.smtp_host || '',
          smtpPort: Number(api.smtpPort || api.smtp_port) || 587,
          smtpSecure: api.smtpSecure !== undefined ? api.smtpSecure : api.smtp_secure,
          smtpUser: api.smtpUser || api.smtp_user || '',
          smtpPass: api.smtpPass || api.smtp_pass || '',
          senderEmail: api.senderEmail,
        });
        updateApi(api.id, {
          status: res.success ? 'active' : 'error',
          lastTested: 'Just now',
          testStatusMsg: res.message,
        });
      } else {
        const res = await testResendApiKey(api.key, api.senderEmail);
        updateApi(api.id, {
          status: res.valid ? 'active' : 'error',
          lastTested: 'Just now',
          testStatusMsg: res.message,
        });
      }
    } catch (err: any) {
      updateApi(api.id, {
        status: 'error',
        lastTested: 'Just now',
        testStatusMsg: err.message || 'Test failed',
      });
    } finally {
      setReTestingId(null);
    }
  };

  const handleSendSingleLiveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testSendModalApi) return;
    if (!testRecipient.trim()) {
      alert('Please provide a recipient email address.');
      return;
    }

    setIsSendingLiveTest(true);
    setLiveTestFeedback(null);

    const isSmtp = (testSendModalApi.providerType || testSendModalApi.provider_type) === 'smtp' || Boolean(testSendModalApi.smtpHost || testSendModalApi.smtp_host);

    try {
      const res = await sendEmailViaResend({
        apiKey: testSendModalApi.key,
        key: testSendModalApi.key,
        apiId: testSendModalApi.id,
        from: `${testSendModalApi.name} <${testSendModalApi.senderEmail}>`,
        to: testRecipient.trim(),
        subject: testSubject.trim() || `✨ Real Email Test from ${settings.siteName || 'R Sender'}`,
        providerType: isSmtp ? 'smtp' : 'resend',
        provider_type: isSmtp ? 'smtp' : 'resend',
        smtpHost: testSendModalApi.smtpHost || testSendModalApi.smtp_host,
        smtp_host: testSendModalApi.smtp_host || testSendModalApi.smtpHost,
        smtpPort: testSendModalApi.smtpPort ?? testSendModalApi.smtp_port,
        smtp_port: testSendModalApi.smtp_port ?? testSendModalApi.smtpPort,
        smtpSecure: testSendModalApi.smtpSecure !== undefined ? testSendModalApi.smtpSecure : testSendModalApi.smtp_secure,
        smtp_secure: testSendModalApi.smtp_secure !== undefined ? testSendModalApi.smtp_secure : testSendModalApi.smtpSecure,
        smtpUser: testSendModalApi.smtpUser || testSendModalApi.smtp_user,
        smtp_user: testSendModalApi.smtpUser || testSendModalApi.smtp_user,
        smtpPass: testSendModalApi.smtpPass || testSendModalApi.smtp_pass,
        smtp_pass: testSendModalApi.smtp_pass || testSendModalApi.smtpPass,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff; color: #1e293b;">
            <div style="display: flex; align-items: center; margin-bottom: 16px;">
              <span style="font-size: 24px; margin-right: 8px;">🚀</span>
              <h2 style="margin: 0; color: #0f172a; font-size: 20px;">${settings.siteName || 'R Sender'} Delivery Verification</h2>
            </div>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">
              Congratulations! This email was dispatched in real-time through your configured ${isSmtp ? 'SMTP channel' : 'Resend API key'}:
            </p>
            <div style="background-color: #f1f5f9; padding: 12px 16px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #0f172a; margin: 16px 0;">
              <strong>Channel:</strong> ${testSendModalApi.name} [${isSmtp ? 'SMTP' : 'RESEND'}]<br />
              <strong>Sender:</strong> ${testSendModalApi.senderEmail}<br />
              <strong>Recipient:</strong> ${testRecipient}<br />
              <strong>Timestamp:</strong> ${new Date().toISOString()}
            </div>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
              Your email delivery channel is fully authenticated and ready for live tasks.
            </p>
          </div>
        `,
        text: `${settings.siteName || 'R Sender'} Delivery Verification!\n\nThis email was dispatched in real-time through your configured ${isSmtp ? 'SMTP channel' : 'Resend API key'}: ${testSendModalApi.name} (${testSendModalApi.senderEmail}).\n\nRecipient: ${testRecipient}\nTime: ${new Date().toLocaleString()}`,
        apiName: testSendModalApi.name,
      });

      if (res.success) {
        setLiveTestFeedback({
          success: true,
          id: res.id,
          message: `Email successfully delivered to ${testRecipient}! [ID: ${res.id}]`,
        });

        updateApi(testSendModalApi.id, {
          usedToday: (testSendModalApi.usedToday || 0) + 1,
          status: 'active',
          lastTested: 'Just now',
        });

        addLog({
          level: 'success',
          apiName: testSendModalApi.name,
          recipient: testRecipient,
          message: `Live test email delivered to ${testRecipient} via ${isSmtp ? 'SMTP' : 'Resend'} (ID: ${res.id})`,
        });
      } else {
        setLiveTestFeedback({
          success: false,
          message: res.error || 'Delivery request was rejected by provider.',
        });
      }
    } catch (err: any) {
      setLiveTestFeedback({
        success: false,
        message: err.message || 'Network failure while dispatching test email.',
      });
    } finally {
      setIsSendingLiveTest(false);
    }
  };

  const confirmDeleteApi = () => {
    if (apiToDelete) {
      deleteApi(apiToDelete.id);
      setApiToDelete(null);
    }
  };

  return (
    <div className="p-4 md:p-5 max-w-7xl mx-auto space-y-3.5">
      {/* Main Sandbox Container */}
      <div className="w-full bg-[#121826] border border-[#1e293b] rounded-[10px] p-[18px] shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
        {/* Header Row */}
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#1e293b]">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[15px] font-semibold text-[#f8fafc] tracking-tight">
              Sender API Keys Management
            </h2>
            <span className="text-[11px] text-[#3b82f6] bg-[#3b82f6]/10 px-[7px] py-[2px] rounded font-medium">
              Multi-Key Rotation
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setModalTestResult(null);
                setIsConnectModalOpen(true);
              }}
              className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white border-none px-[12px] py-[5px] rounded-[5px] text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 transition-colors"
            >
              <span>+ Connect API Key</span>
            </button>
          </div>
        </div>

        {/* 3-Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-[18px]">
          {/* Card 1 */}
          <div className="bg-[#1a2234]/35 border border-[#1e293b] rounded-[7px] p-[12px_14px] flex justify-between items-start">
            <div>
              <h4 className="text-[10px] text-[#94a3b8] uppercase tracking-[0.5px] font-semibold mb-1.5">
                Total Configured Keys
              </h4>
              <div className="text-[20px] font-bold text-[#f8fafc] leading-none">
                {totalKeysCount}
              </div>
            </div>
            <div className="text-[#94a3b8] w-[26px] h-[26px] rounded-[5px] bg-[#1a2234] flex items-center justify-center text-xs border border-[#1e293b]">
              Ã°Å¸â€â€˜
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-[#1a2234]/35 border border-[#1e293b] rounded-[7px] p-[12px_14px] flex justify-between items-start">
            <div>
              <h4 className="text-[10px] text-[#94a3b8] uppercase tracking-[0.5px] font-semibold mb-1.5">
                Active & Verified
              </h4>
              <div className="text-[20px] font-bold text-[#10b981] leading-none">
                {activeKeysCount}
              </div>
            </div>
            <div className="text-[#10b981] w-[26px] h-[26px] rounded-[5px] bg-[#1a2234] flex items-center justify-center text-xs border border-[#1e293b]">
              Ã¢Å“â€œ
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-[#1a2234]/35 border border-[#1e293b] rounded-[7px] p-[12px_14px] flex justify-between items-start">
            <div>
              <h4 className="text-[10px] text-[#94a3b8] uppercase tracking-[0.5px] font-semibold mb-1.5">
                Daily Total Capacity
              </h4>
              <div className="text-[20px] font-bold text-[#f8fafc] flex items-baseline gap-1 leading-none">
                {totalCapacity.toLocaleString()} <span className="text-[11px] text-[#94a3b8] font-normal">/day</span>
              </div>
            </div>
            <div className="text-[#3b82f6] w-[26px] h-[26px] rounded-[5px] bg-[#1a2234] flex items-center justify-center text-xs border border-[#1e293b]">
              Ã°Å¸â€œÅ 
            </div>
          </div>
        </div>

        {/* Search, Filter & Rows Per Page Toolbar */}
        <div className="flex justify-between items-center gap-2.5 mb-2.5 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1 max-w-[280px]">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[#94a3b8] pointer-events-none">
                Ã°Å¸â€Â
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search API or email..."
                className="w-full bg-[#1a2234] border border-[#1e293b] rounded-[5px] py-[5px] pr-2.5 pl-[26px] text-[11px] text-[#f8fafc] outline-none transition-colors focus:border-[#3b82f6]"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'UNTESTED' | 'ERROR');
                setCurrentPage(1);
              }}
              className="bg-[#1a2234] border border-[#1e293b] rounded-[5px] py-[5px] px-2 text-[11px] text-[#f8fafc] outline-none cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="UNTESTED">Untested</option>
              <option value="ERROR">Invalid / Error</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
            <span>Show</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-[#1a2234] border border-[#1e293b] rounded-[4px] py-[3px] px-1.5 text-[11px] text-[#f8fafc] outline-none cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* Clean & Compact Table */}
        <div className="bg-[#1a2234]/20 border border-[#1e293b] rounded-[6px] overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px] text-left">
            <thead>
              <tr className="border-b border-[#1e293b]">
                <th className="py-2 px-3 bg-[#1a2234]/60 text-[#94a3b8] text-[9.5px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap">
                  Channel Name
                </th>
                <th className="py-2 px-3 bg-[#1a2234]/60 text-[#94a3b8] text-[9.5px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap">
                  Type
                </th>
                <th className="py-2 px-3 bg-[#1a2234]/60 text-[#94a3b8] text-[9.5px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap">
                  Key / Endpoint
                </th>
                <th className="py-2 px-3 bg-[#1a2234]/60 text-[#94a3b8] text-[9.5px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap">
                  Sender Email
                </th>
                <th className="py-2 px-3 bg-[#1a2234]/60 text-[#94a3b8] text-[9.5px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap">
                  Daily Usage
                </th>
                <th className="py-2 px-3 bg-[#1a2234]/60 text-[#94a3b8] text-[9.5px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap">
                  Status
                </th>
                <th className="py-2 px-3 bg-[#1a2234]/60 text-[#94a3b8] text-[9.5px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap">
                  Last Tested
                </th>
                <th className="py-2 px-3 bg-[#1a2234]/60 text-[#94a3b8] text-[9.5px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]/50">
              {paginatedApis.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-6 text-[#94a3b8]">
                    No matching sender channels found.
                  </td>
                </tr>
              ) : (
                paginatedApis.map((item) => {
                  const isLocked = lockedApiMap[item.id];
                  const isRetesting = reTestingId === item.id;
                  const isActive = item.status === 'active' || item.status === 'sending_only';
                  const usagePercent = Math.min(100, Math.round(((item.usedToday || 0) / item.dailyLimit) * 100));
                  const isSmtp = (item.providerType || item.provider_type) === 'smtp' || Boolean(item.smtpHost || item.smtp_host);

                  return (
                    <tr key={item.id} className="hover:bg-[#1a2234]/35 transition-colors">
                      {/* Channel Name */}
                      <td className="py-[7px] px-3 whitespace-nowrap align-middle">
                        <div className="flex flex-col gap-px">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-[#f8fafc]">{item.name}</span>
                            {isLocked && (
                              <span
                                className="bg-[#f59e0b]/15 text-[#f59e0b] text-[8.5px] px-1 py-0 rounded font-semibold"
                                title={`Engaged in task: "${isLocked}"`}
                              >
                                Locked
                              </span>
                            )}
                          </div>
                          <span className="text-[9.5px] text-[#94a3b8] font-mono">
                            Added: {item.createdAt ? (typeof item.createdAt === 'string' ? item.createdAt.split('T')[0] : new Date(item.createdAt).toISOString().split('T')[0]) : 'Recently added'}
                          </span>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-[7px] px-3 whitespace-nowrap align-middle">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-semibold uppercase tracking-wider ${
                            isSmtp
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                          }`}
                        >
                          {isSmtp ? 'SMTP' : 'RESEND'}
                        </span>
                      </td>

                      {/* Credentials / Endpoint */}
                      <td className="py-[7px] px-3 whitespace-nowrap align-middle">
                        {isSmtp ? (
                          <div className="bg-[#1a2234] border border-[#1e293b] py-[3px] px-1.5 rounded-[4px] inline-flex items-center gap-1.5 font-mono text-[10.5px] text-[#cbd5e1]">
                            <span className="truncate max-w-[140px]" title={`${item.smtpHost || item.smtp_host}:${item.smtpPort || item.smtp_port || 587}`}>
                              {item.smtpHost || item.smtp_host || 'smtp'}:{item.smtpPort || item.smtp_port || 587}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(item.id, `${item.smtpHost || item.smtp_host}:${item.smtpPort || item.smtp_port || 587}`)}
                              className="bg-transparent border-none text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer flex items-center p-0"
                              title="Copy SMTP host"
                            >
                              {copiedId === item.id ? (
                                <span className="text-[10px] text-[#10b981] font-semibold">Ã¢Å“â€œ</span>
                              ) : (
                                <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="bg-[#1a2234] border border-[#1e293b] py-[3px] px-1.5 rounded-[4px] inline-flex items-center gap-1.5 font-mono text-[10.5px] text-[#cbd5e1]">
                            <span>{maskApiKey(item.key)}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(item.id, item.key)}
                              className="bg-transparent border-none text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer flex items-center p-0"
                              title="Copy API Key"
                            >
                              {copiedId === item.id ? (
                                <span className="text-[10px] text-[#10b981] font-semibold">Ã¢Å“â€œ</span>
                              ) : (
                                <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Sender Email */}
                      <td className="py-[7px] px-3 font-mono text-[11px] text-[#f8fafc] whitespace-nowrap align-middle">
                        {item.senderEmail}
                      </td>

                      {/* Daily Usage */}
                      <td className="py-[7px] px-3 whitespace-nowrap align-middle">
                        <div className="flex flex-col gap-[3px] w-[85px]">
                          <span className="text-[9.5px] font-mono text-[#94a3b8]">
                            {item.usedToday || 0} / {item.dailyLimit}
                          </span>
                          <div className="w-full h-[3px] bg-[#1a2234] rounded-[2px] overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                usagePercent >= 90
                                  ? 'bg-[#ef4444]'
                                  : usagePercent >= 70
                                  ? 'bg-[#f59e0b]'
                                  : 'bg-[#3b82f6]'
                              }`}
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-[7px] px-3 whitespace-nowrap align-middle">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            isActive
                              ? 'text-[#10b981]'
                              : item.status === 'error'
                              ? 'text-[#ef4444]'
                              : 'text-[#94a3b8]'
                          }`}
                        >
                          <span className="w-[5px] h-[5px] rounded-full bg-currentColor" />
                          <span>{isActive ? 'Active' : item.status === 'error' ? 'Invalid' : 'Untested'}</span>
                        </span>
                      </td>

                      {/* Last Tested */}
                      <td className="py-[7px] px-3 text-[#94a3b8] text-[10.5px] whitespace-nowrap align-middle">
                        {item.lastTested || 'Untested'}
                      </td>

                      {/* Actions */}
                      <td className="py-[7px] px-3 whitespace-nowrap align-middle text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setTestSendModalApi(item);
                              setLiveTestFeedback(null);
                            }}
                            className="bg-[#1a2234] border border-[#1e293b] hover:border-[#334155] hover:bg-[#222d42] text-[#10b981] py-[3px] px-[7px] rounded-[4px] text-[10.5px] font-medium cursor-pointer inline-flex items-center gap-1 transition-all"
                            title="Send live test email"
                          >
                            <span>Ã¢â€ â€” Test</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReTestSingle(item)}
                            disabled={isRetesting}
                            className="bg-[#1a2234] border border-[#1e293b] hover:border-[#334155] hover:bg-[#222d42] text-[#f8fafc] py-[3px] px-[7px] rounded-[4px] text-[10.5px] font-medium cursor-pointer inline-flex items-center gap-1 transition-all disabled:opacity-50"
                            title="Re-verify connectivity"
                          >
                            <RotateCw className={`w-[11px] h-[11px] ${isRetesting ? 'animate-spin text-[#8b5cf6]' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setApiToEdit(item);
                              setEditLabel(item.name);
                              const itemIsSmtp = (item.providerType || item.provider_type) === 'smtp' || Boolean(item.smtpHost || item.smtp_host);
                              setEditProviderType(itemIsSmtp ? 'smtp' : 'resend');
                              setEditKey(item.key || '');
                              setEditSenderEmail(item.senderEmail);
                              setEditDailyLimit(item.dailyLimit || 1000);
                              setEditSmtpHost(item.smtpHost || item.smtp_host || '');
                              setEditSmtpPort(Number(item.smtpPort || item.smtp_port) || 587);
                              setEditSmtpSecure(item.smtpSecure !== undefined ? Boolean(item.smtpSecure) : Boolean(item.smtp_secure));
                              setEditSmtpUser(item.smtpUser || item.smtpUser || '');
                              setEditSmtpPass(item.smtpPass || item.smtp_pass || '');
                              setEditTestResult(null);
                            }}
                            className="bg-[#1a2234] border border-[#1e293b] hover:border-[#334155] hover:bg-[#222d42] text-[#38bdf8] py-[3px] px-[7px] rounded-[4px] text-[10.5px] font-medium cursor-pointer inline-flex items-center gap-1 transition-all"
                            title="Edit channel settings"
                          >
                            <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={() => setApiToDelete(item)}
                            className="bg-transparent border border-[#1e293b] text-[#94a3b8] hover:text-[#ef4444] hover:border-[#ef4444]/40 hover:bg-[#ef4444]/10 w-[22px] h-[22px] rounded-[4px] inline-flex items-center justify-center cursor-pointer transition-all p-0"
                            title="Delete channel"
                          >
                            <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex justify-between items-center mt-2.5 pt-2 text-[11px] text-[#94a3b8]">
          <div>
            Showing {totalItems === 0 ? 0 : startIndex + 1} to {endIndex} of {totalItems} entries
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={validCurrentPage === 1}
              className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] py-[3px] px-2 rounded-[4px] text-[10.5px] cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-[#222d42] hover:not-disabled:border-[#3b82f6]"
            >
              Ã¢â‚¬Â¹ Prev
            </button>
            <span className="font-mono px-1">
              {validCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={validCurrentPage === totalPages || totalPages === 0}
              className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] py-[3px] px-2 rounded-[4px] text-[10.5px] cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-[#222d42] hover:not-disabled:border-[#3b82f6]"
            >
              Next Ã¢â‚¬Âº
            </button>
          </div>
        </div>
      </div>

      {/* CONNECT SENDER CHANNEL MODAL (Clean & Compact Design) */}
      {isConnectModalOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[1000] p-4"
          onClick={() => setIsConnectModalOpen(false)}
        >
          <div
            className="bg-[#121826] border border-[#1e293b] rounded-[10px] w-full max-w-[480px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-[12px_16px] border-b border-[#1e293b] flex justify-between items-center bg-[#1a2234]/40">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#8b5cf6]/20 border border-[#8b5cf6]/40 flex items-center justify-center text-[#c084fc]">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-[13px] font-bold text-[#f8fafc] tracking-tight">Connect Sender Channel</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConnectModalOpen(false)}
                className="text-[#94a3b8] hover:text-[#f8fafc] text-lg leading-none cursor-pointer w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e293b] transition-colors"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveApiKey} className="flex-1 overflow-y-auto">
              <div className="p-4 flex flex-col gap-3">
                {/* 1. Channel Provider Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[#cbd5e1]">
                    Channel Provider <span className="text-[#8b5cf6]">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={connectProviderType}
                      onChange={(e) => {
                        setConnectProviderType(e.target.value as 'resend' | 'smtp');
                        setModalTestResult(null);
                      }}
                      className="w-full bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[7px_10px] rounded-[6px] text-[12px] font-medium outline-none transition-all focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/40 cursor-pointer appearance-none pr-8"
                    >
                      <option value="resend">Resend API</option>
                      <option value="smtp">Custom SMTP Relay</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#94a3b8] text-xs">
                      Ã¢â€“Â¼
                    </div>
                  </div>
                </div>

                {/* 2. Channel Name & Daily Sending Limit (2-Column Grid) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#cbd5e1]">
                      Channel Name <span className="text-[#8b5cf6]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={connectProviderType === 'resend' ? 'e.g. Primary Resend' : 'e.g. Google Relay'}
                      value={apiLabel}
                      onChange={(e) => setApiLabel(e.target.value)}
                      className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[7px_10px] rounded-[6px] text-[12px] outline-none transition-all focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/40 w-full placeholder-[#475569]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#cbd5e1]">
                      Daily Limit
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      placeholder="0 = unlimited"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[7px_10px] rounded-[6px] text-[12px] outline-none transition-all focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/40 w-full font-mono placeholder-[#475569]"
                    />
                  </div>
                </div>

                {/* 3. Provider Credentials */}
                {connectProviderType === 'resend' ? (
                  /* RESEND API KEY FIELD */
                  <div className="flex flex-col gap-1 bg-[#161f30] p-2.5 rounded-[6px] border border-[#1e293b]">
                    <div className="text-[11px] font-semibold text-[#cbd5e1] flex justify-between items-center">
                      <span>Resend API Key <span className="text-[#8b5cf6]">*</span></span>
                      <a
                        href="https://resend.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-[#38bdf8] hover:underline"
                      >
                        Get Key Ã¢â€ â€”
                      </a>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type={showKeyText ? 'text' : 'password'}
                        required={connectProviderType === 'resend'}
                        placeholder="re_Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢"
                        value={resendKey}
                        onChange={(e) => {
                          setResendKey(e.target.value);
                          setModalTestResult(null);
                        }}
                        className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[7px_30px_7px_10px] rounded-[5px] text-[12px] outline-none transition-all focus:border-[#8b5cf6] w-full font-mono placeholder-[#475569]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeyText(!showKeyText)}
                        className="absolute right-2.5 bg-transparent border-none text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer"
                        title="Show/Hide Key"
                      >
                        {showKeyText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* SMTP CREDENTIALS FIELDS */
                  <div className="flex flex-col gap-2.5 bg-[#161f30] p-2.5 rounded-[6px] border border-[#1e293b]">
                    {/* Host & Port */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 flex flex-col gap-1">
                        <label className="text-[10.5px] font-semibold text-[#cbd5e1]">
                          SMTP Host <span className="text-[#8b5cf6]">*</span>
                        </label>
                        <input
                          type="text"
                          required={connectProviderType === 'smtp'}
                          placeholder="smtp.example.com"
                          value={smtpHost}
                          onChange={(e) => {
                            setSmtpHost(e.target.value);
                            setModalTestResult(null);
                          }}
                          className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[6px_9px] rounded-[5px] text-[11.5px] outline-none focus:border-[#8b5cf6] font-mono placeholder-[#475569]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10.5px] font-semibold text-[#cbd5e1]">
                          Port <span className="text-[#8b5cf6]">*</span>
                        </label>
                        <input
                          type="number"
                          required={connectProviderType === 'smtp'}
                          placeholder="587"
                          value={smtpPort}
                          onChange={(e) => {
                            const p = Number(e.target.value);
                            setSmtpPort(p);
                            if (p === 465) setSmtpSecure(true);
                            if (p === 587 || p === 25) setSmtpSecure(false);
                            setModalTestResult(null);
                          }}
                          className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[6px_9px] rounded-[5px] text-[11.5px] outline-none focus:border-[#8b5cf6] font-mono"
                        />
                      </div>
                    </div>

                    {/* Quick Port Presets & SSL Toggle */}
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSmtpPort(587);
                            setSmtpSecure(false);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                            smtpPort === 587 && !smtpSecure ? 'bg-[#8b5cf6]/20 border-[#8b5cf6] text-[#c084fc] font-semibold' : 'bg-[#1a2234] border-[#1e293b] text-[#94a3b8] hover:text-white'
                          }`}
                        >
                          587
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSmtpPort(465);
                            setSmtpSecure(true);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                            smtpPort === 465 && smtpSecure ? 'bg-[#8b5cf6]/20 border-[#8b5cf6] text-[#c084fc] font-semibold' : 'bg-[#1a2234] border-[#1e293b] text-[#94a3b8] hover:text-white'
                          }`}
                        >
                          465 (SSL)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSmtpPort(25);
                            setSmtpSecure(false);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                            smtpPort === 25 ? 'bg-[#8b5cf6]/20 border-[#8b5cf6] text-[#c084fc] font-semibold' : 'bg-[#1a2234] border-[#1e293b] text-[#94a3b8] hover:text-white'
                          }`}
                        >
                          25
                        </button>
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer text-[#94a3b8] hover:text-[#f8fafc] select-none text-[10.5px]">
                        <input
                          type="checkbox"
                          checked={smtpSecure}
                          onChange={(e) => setSmtpSecure(e.target.checked)}
                          className="accent-[#8b5cf6] cursor-pointer rounded"
                        />
                        <span>Force SSL/TLS</span>
                      </label>
                    </div>

                    {/* SMTP Username */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10.5px] font-semibold text-[#cbd5e1]">
                        SMTP Username <span className="text-[#8b5cf6]">*</span>
                      </label>
                      <input
                        type="text"
                        required={connectProviderType === 'smtp'}
                        placeholder="user@domain.com"
                        value={smtpUser}
                        onChange={(e) => {
                          setSmtpUser(e.target.value);
                          if (!senderEmail) setSenderEmail(e.target.value);
                          setModalTestResult(null);
                        }}
                        className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[6px_9px] rounded-[5px] text-[11.5px] outline-none focus:border-[#8b5cf6] font-mono placeholder-[#475569]"
                      />
                    </div>

                    {/* SMTP Password */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10.5px] font-semibold text-[#cbd5e1]">
                        SMTP Password <span className="text-[#8b5cf6]">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type={showSmtpPass ? 'text' : 'password'}
                          required={connectProviderType === 'smtp'}
                          placeholder="Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢"
                          value={smtpPass}
                          onChange={(e) => {
                            setSmtpPass(e.target.value);
                            setModalTestResult(null);
                          }}
                          className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[6px_30px_6px_9px] rounded-[5px] text-[11.5px] outline-none focus:border-[#8b5cf6] w-full font-mono placeholder-[#475569]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPass(!showSmtpPass)}
                          className="absolute right-2.5 bg-transparent border-none text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer"
                          title="Show/Hide Password"
                        >
                          {showSmtpPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Sender From Email */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[#cbd5e1]">
                    Sender From Email <span className="text-[#8b5cf6]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="sender@yourdomain.com"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[7px_10px] rounded-[6px] text-[12px] outline-none transition-all focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/40 w-full font-mono placeholder-[#475569]"
                  />

                  {/* Detected domains helper */}
                  {modalTestResult?.verifiedDomains && modalTestResult.verifiedDomains.length > 0 && (
                    <div className="mt-1 p-2 rounded-[6px] bg-[#161f30] border border-[#1e293b] text-[10.5px]">
                      <span className="text-[#94a3b8] flex items-center gap-1 mb-1.5 font-medium">
                        <Globe className="w-3 h-3 text-[#8b5cf6]" /> Verified Domains:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {modalTestResult.verifiedDomains.map((dom) => (
                          <button
                            key={dom}
                            type="button"
                            onClick={() => setSenderEmail(`mail@${dom}`)}
                            className={`px-2 py-0.5 rounded text-[10.5px] font-mono border transition-all cursor-pointer ${
                              senderEmail.includes(dom)
                                ? 'bg-[#8b5cf6] text-white border-[#8b5cf6] shadow-sm font-semibold'
                                : 'bg-[#1a2234] text-[#cbd5e1] border-[#1e293b] hover:border-[#8b5cf6] hover:text-white'
                            }`}
                          >
                            mail@{dom}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 6. Test Feedback Box */}
                {isModalTesting && (
                  <div className="p-2.5 rounded-[6px] bg-[#3b82f6]/10 border border-[#3b82f6]/30 flex items-center gap-2 text-xs text-[#93c5fd]">
                    <RotateCw className="w-3.5 h-3.5 animate-spin text-[#3b82f6] shrink-0" />
                    <span>Verifying credentials...</span>
                  </div>
                )}

                {modalTestResult && !isModalTesting && (
                  <div
                    className={`p-2.5 rounded-[6px] border text-xs flex items-start gap-2 ${
                      modalTestResult.valid
                        ? 'bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981]'
                        : 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]'
                    }`}
                  >
                    {modalTestResult.valid ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{modalTestResult.valid ? 'Verification Successful' : 'Connection Failed'}</p>
                      <p className="text-[10.5px] mt-0.5 opacity-90 break-words">{modalTestResult.message}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* 7. Modal Footer Actions */}
              <div className="p-[10px_16px] border-t border-[#1e293b] flex justify-between items-center bg-[#1a2234]/30">
                <button
                  type="button"
                  onClick={handleTestConnectKey}
                  disabled={isModalTesting || (connectProviderType === 'resend' ? !resendKey.trim() : (!smtpHost.trim() || !smtpUser.trim()))}
                  className="bg-[#1a2234] border border-[#1e293b] hover:border-[#8b5cf6]/50 text-[#f8fafc] hover:bg-[#222d42] p-[5px_11px] rounded-[5px] text-[11.5px] font-medium cursor-pointer transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  Test Connection
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConnectModalOpen(false)}
                    className="bg-[#1a2234] border border-[#1e293b] text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#222d42] p-[5px_12px] rounded-[5px] text-[11.5px] cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingApi}
                    className="bg-[#8b5cf6] hover:bg-[#7c3aed] border-none text-white p-[5px_14px] rounded-[5px] text-[11.5px] font-semibold cursor-pointer transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
                  >
                    {isSavingApi ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <span>Connect Channel</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SENDER CHANNEL MODAL (Clean & Compact Design) */}
      {apiToEdit && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[1000] p-4"
          onClick={() => setApiToEdit(null)}
        >
          <div
            className="bg-[#121826] border border-[#1e293b] rounded-[10px] w-full max-w-[480px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-[12px_16px] border-b border-[#1e293b] flex justify-between items-center bg-[#1a2234]/40">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#38bdf8]/20 border border-[#38bdf8]/40 flex items-center justify-center text-[#38bdf8]">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-[13px] font-bold text-[#f8fafc] tracking-tight">Edit Sender Channel</h3>
              </div>
              <button
                type="button"
                onClick={() => setApiToEdit(null)}
                className="text-[#94a3b8] hover:text-[#f8fafc] text-lg leading-none cursor-pointer w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e293b] transition-colors"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateApiKey} className="flex-1 overflow-y-auto">
              <div className="p-4 flex flex-col gap-3">
                {/* 1. Channel Provider Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[#cbd5e1]">
                    Channel Provider <span className="text-[#8b5cf6]">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={editProviderType}
                      onChange={(e) => {
                        setEditProviderType(e.target.value as 'resend' | 'smtp');
                        setEditTestResult(null);
                      }}
                      className="w-full bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[7px_10px] rounded-[6px] text-[12px] font-medium outline-none transition-all focus:border-[#8b5cf6] cursor-pointer appearance-none pr-8"
                    >
                      <option value="resend">Resend API</option>
                      <option value="smtp">Custom SMTP Relay</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#94a3b8] text-xs">
                      Ã¢â€“Â¼
                    </div>
                  </div>
                </div>

                {/* 2. Channel Name & Daily Sending Limit (2-Column Grid) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#cbd5e1]">
                      Channel Name <span className="text-[#8b5cf6]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[7px_10px] rounded-[6px] text-[12px] outline-none transition-all focus:border-[#8b5cf6] w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#cbd5e1]">
                      Daily Limit
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      placeholder="0 = unlimited"
                      value={editDailyLimit}
                      onChange={(e) => setEditDailyLimit(Number(e.target.value))}
                      className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[7px_10px] rounded-[6px] text-[12px] outline-none transition-all focus:border-[#8b5cf6] w-full font-mono placeholder-[#475569]"
                    />
                  </div>
                </div>

                {/* 3. Provider Credentials */}
                {editProviderType === 'resend' ? (
                  <div className="flex flex-col gap-1 bg-[#161f30] p-2.5 rounded-[6px] border border-[#1e293b]">
                    <div className="text-[11px] font-semibold text-[#cbd5e1] flex justify-between items-center">
                      <span>Resend API Key <span className="text-[#8b5cf6]">*</span></span>
                      <a
                        href="https://resend.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-[#38bdf8] hover:underline"
                      >
                        Get Key Ã¢â€ â€”
                      </a>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type={showEditKeyText ? 'text' : 'password'}
                        required={editProviderType === 'resend'}
                        value={editKey}
                        onChange={(e) => {
                          setEditKey(e.target.value);
                          setEditTestResult(null);
                        }}
                        className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[6px_28px_6px_9px] rounded-[4px] text-[11.5px] outline-none transition-colors focus:border-[#8b5cf6] w-full font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditKeyText(!showEditKeyText)}
                        className="absolute right-2 bg-transparent border-none text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer text-xs"
                        title="Show/Hide Key"
                      >
                        {showEditKeyText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* SMTP FIELDS */
                  <div className="flex flex-col gap-2.5 bg-[#161f30] p-2.5 rounded-[5px] border border-[#1e293b]">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#94a3b8]">
                          SMTP Host <span className="text-[#8b5cf6]">*</span>
                        </label>
                        <input
                          type="text"
                          required={editProviderType === 'smtp'}
                          value={editSmtpHost}
                          onChange={(e) => {
                            setEditSmtpHost(e.target.value);
                            setEditTestResult(null);
                          }}
                          className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[5px_8px] rounded-[4px] text-[11px] outline-none focus:border-[#8b5cf6] font-mono"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#94a3b8]">
                          Port <span className="text-[#8b5cf6]">*</span>
                        </label>
                        <input
                          type="number"
                          required={editProviderType === 'smtp'}
                          value={editSmtpPort}
                          onChange={(e) => {
                            const p = Number(e.target.value);
                            setEditSmtpPort(p);
                            if (p === 465) setEditSmtpSecure(true);
                            if (p === 587 || p === 25) setEditSmtpSecure(false);
                            setEditTestResult(null);
                          }}
                          className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[5px_8px] rounded-[4px] text-[11px] outline-none focus:border-[#8b5cf6] font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditSmtpPort(587);
                            setEditSmtpSecure(false);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border cursor-pointer ${
                            editSmtpPort === 587 ? 'bg-[#8b5cf6]/20 border-[#8b5cf6] text-white' : 'bg-[#1a2234] border-[#1e293b] text-[#94a3b8]'
                          }`}
                        >
                          587
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditSmtpPort(465);
                            setEditSmtpSecure(true);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border cursor-pointer ${
                            editSmtpPort === 465 ? 'bg-[#8b5cf6]/20 border-[#8b5cf6] text-white' : 'bg-[#1a2234] border-[#1e293b] text-[#94a3b8]'
                          }`}
                        >
                          465 (SSL)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditSmtpPort(25);
                            setEditSmtpSecure(false);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border cursor-pointer ${
                            editSmtpPort === 25 ? 'bg-[#8b5cf6]/20 border-[#8b5cf6] text-white' : 'bg-[#1a2234] border-[#1e293b] text-[#94a3b8]'
                          }`}
                        >
                          25
                        </button>
                      </div>

                      <label className="flex items-center gap-1 cursor-pointer text-[#94a3b8]">
                        <input
                          type="checkbox"
                          checked={editSmtpSecure}
                          onChange={(e) => setEditSmtpSecure(e.target.checked)}
                          className="accent-[#8b5cf6] cursor-pointer"
                        />
                        <span>Force SSL/TLS</span>
                      </label>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-[#94a3b8]">
                        SMTP Username <span className="text-[#8b5cf6]">*</span>
                      </label>
                      <input
                        type="text"
                        required={editProviderType === 'smtp'}
                        value={editSmtpUser}
                        onChange={(e) => {
                          setEditSmtpUser(e.target.value);
                          setEditTestResult(null);
                        }}
                        className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[5px_8px] rounded-[4px] text-[11px] outline-none focus:border-[#8b5cf6] font-mono"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-[#94a3b8]">
                        SMTP Password <span className="text-[#8b5cf6]">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type={showEditSmtpPass ? 'text' : 'password'}
                          required={editProviderType === 'smtp'}
                          value={editSmtpPass}
                          onChange={(e) => {
                            setEditSmtpPass(e.target.value);
                            setEditTestResult(null);
                          }}
                          className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[5px_28px_5px_8px] rounded-[4px] text-[11px] outline-none focus:border-[#8b5cf6] w-full font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditSmtpPass(!showEditSmtpPass)}
                          className="absolute right-2 bg-transparent border-none text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer text-xs"
                          title="Show/Hide Password"
                        >
                          {showEditSmtpPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Sender From Email */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[#cbd5e1]">
                    Sender From Email <span className="text-[#8b5cf6]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={editSenderEmail}
                    onChange={(e) => setEditSenderEmail(e.target.value)}
                    className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] p-[7px_10px] rounded-[6px] text-[12px] outline-none transition-all focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/40 w-full font-mono placeholder-[#475569]"
                  />

                  {/* Detected domains helper */}
                  {editTestResult?.verifiedDomains && editTestResult.verifiedDomains.length > 0 && (
                    <div className="mt-1 p-2 rounded-[6px] bg-[#161f30] border border-[#1e293b] text-[10.5px]">
                      <span className="text-[#94a3b8] flex items-center gap-1 mb-1.5 font-medium">
                        <Globe className="w-3 h-3 text-[#8b5cf6]" /> Verified Domains:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {editTestResult.verifiedDomains.map((dom) => (
                          <button
                            key={dom}
                            type="button"
                            onClick={() => setEditSenderEmail(`mail@${dom}`)}
                            className={`px-2 py-0.5 rounded text-[10.5px] font-mono border transition-all cursor-pointer ${
                              editSenderEmail.includes(dom)
                                ? 'bg-[#8b5cf6] text-white border-[#8b5cf6] shadow-sm font-semibold'
                                : 'bg-[#1a2234] text-[#cbd5e1] border-[#1e293b] hover:border-[#8b5cf6] hover:text-white'
                            }`}
                          >
                            mail@{dom}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 6. Test Feedback Box */}
                {isEditTesting && (
                  <div className="p-2.5 rounded-[6px] bg-[#3b82f6]/10 border border-[#3b82f6]/30 flex items-center gap-2 text-xs text-[#93c5fd]">
                    <RotateCw className="w-3.5 h-3.5 animate-spin text-[#3b82f6] shrink-0" />
                    <span>Verifying credentials...</span>
                  </div>
                )}

                {editTestResult && !isEditTesting && (
                  <div
                    className={`p-2.5 rounded-[6px] border text-xs flex items-start gap-2 ${
                      editTestResult.valid
                        ? 'bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981]'
                        : 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]'
                    }`}
                  >
                    {editTestResult.valid ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{editTestResult.valid ? 'Verification Successful' : 'Connection Failed'}</p>
                      <p className="text-[10.5px] mt-0.5 opacity-90 break-words">{editTestResult.message}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* 7. Modal Footer Actions */}
              <div className="p-[10px_16px] border-t border-[#1e293b] flex justify-between items-center bg-[#1a2234]/30">
                <button
                  type="button"
                  onClick={handleTestEditKey}
                  disabled={isEditTesting || (editProviderType === 'resend' ? !editKey.trim() : (!editSmtpHost.trim() || !editSmtpUser.trim()))}
                  className="bg-[#1a2234] border border-[#1e293b] hover:border-[#8b5cf6]/50 text-[#f8fafc] hover:bg-[#222d42] p-[5px_11px] rounded-[5px] text-[11.5px] font-medium cursor-pointer transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  Test Connection
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setApiToEdit(null)}
                    className="bg-[#1a2234] border border-[#1e293b] text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#222d42] p-[5px_12px] rounded-[5px] text-[11.5px] cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="bg-[#38bdf8] hover:bg-[#0284c7] border-none text-black hover:text-white p-[5px_14px] rounded-[5px] text-[11.5px] font-semibold cursor-pointer transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
                  >
                    {isSavingEdit ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL (100% matching User-Resend-APIs-Pages-Design.html) */}
      {apiToDelete && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex justify-center items-center z-[1000] p-4"
          onClick={() => setApiToDelete(null)}
        >
          <div
            className="bg-[#121826] border border-[#1e293b] rounded-[7px] w-full max-w-[320px] p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[12.5px] font-semibold text-[#f8fafc]">Delete API Key</h3>
            <p className="text-[10.5px] text-[#94a3b8] leading-relaxed">
              Are you sure you want to remove &ldquo;{apiToDelete.name}&rdquo;? This credential will no longer be available for dispatch queues.
            </p>
            <div className="flex justify-end gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => setApiToDelete(null)}
                className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] hover:bg-[#222d42] p-[4px_10px] rounded-[4px] text-[11px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteApi}
                className="bg-[#ef4444] hover:bg-[#dc2626] border-none text-white p-[4px_9px] rounded-[4px] text-[11px] font-semibold cursor-pointer transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE TEST EMAIL SEND MODAL (Real Delivery Verification) */}
      {testSendModalApi && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex justify-center items-center z-[1000] p-4"
          onClick={() => setTestSendModalApi(null)}
        >
          <div
            className="bg-[#121826] border border-[#1e293b] rounded-[8px] w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-[10px_14px] border-b border-[#1e293b] flex justify-between items-center bg-[#1a2234]/40">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-[#1a2234] border border-[#1e293b] text-[#10b981]">
                  <Send className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-[#f8fafc]">Send Live Test Email</h3>
                  <p className="text-[10px] text-[#94a3b8]">Via {testSendModalApi.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTestSendModalApi(null)}
                className="text-[#94a3b8] hover:text-[#f8fafc] text-base leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSendSingleLiveTest} className="p-3.5 space-y-2.5 text-xs">
              <div>
                <label className="block text-[10.5px] font-medium text-[#94a3b8] mb-1">
                  From Address
                </label>
                <div className="p-2 rounded bg-[#1a2234] border border-[#1e293b] text-[11px] font-mono text-[#cbd5e1] truncate">
                  {testSendModalApi.name} &lt;{testSendModalApi.senderEmail}&gt;
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10.5px] font-medium text-[#94a3b8]">
                    Recipient Email <span className="text-[#8b5cf6]">*</span>
                  </label>
                  {currentUser?.email && (
                    <button
                      type="button"
                      onClick={() => setTestRecipient(currentUser.email)}
                      className="text-[10px] text-[#3b82f6] hover:underline"
                    >
                      Use my email
                    </button>
                  )}
                </div>
                <input
                  type="email"
                  required
                  placeholder="your.email@example.com"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  className="w-full bg-[#1a2234] border border-[#1e293b] focus:border-[#8b5cf6] rounded px-2.5 py-1.5 text-xs font-mono text-[#f8fafc] placeholder-[#64748b] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-medium text-[#94a3b8] mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={testSubject}
                  onChange={(e) => setTestSubject(e.target.value)}
                  className="w-full bg-[#1a2234] border border-[#1e293b] focus:border-[#8b5cf6] rounded px-2.5 py-1.5 text-xs text-[#f8fafc] placeholder-[#64748b] focus:outline-none transition-colors"
                />
              </div>

              {liveTestFeedback && (
                <div
                  className={`p-2 rounded border text-xs flex items-start gap-1.5 ${
                    liveTestFeedback.success
                      ? 'bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981]'
                      : 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]'
                  }`}
                >
                  {liveTestFeedback.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981] shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-[#ef4444] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium">{liveTestFeedback.success ? 'Delivered!' : 'Delivery Failed'}</p>
                    <p className="mt-0.5 text-[10px] font-mono">{liveTestFeedback.message}</p>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-1.5 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setTestSendModalApi(null)}
                  className="px-3 py-1 text-xs text-[#94a3b8] hover:text-[#f8fafc]"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSendingLiveTest}
                  className="flex items-center gap-1 px-3 py-1 rounded bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isSendingLiveTest ? (
                    <>
                      <RotateCw className="w-3 h-3 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>Send Test</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};






