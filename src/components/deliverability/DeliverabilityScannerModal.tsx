import React, { useEffect, useState, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  Check,
} from 'lucide-react';
import { DeliverabilityReport, scanDeliverability } from '../../utils/deliverabilityScanner';
import { useApp } from '../../context/AppContext';

interface DeliverabilityScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  unsubscribeUrl: string;
  enableOneClickUnsubscribe: boolean;
  onInsertTag?: (tag: string) => void;
}

interface ScanStep {
  id: string;
  label: string;
}

const SCAN_STEPS: ScanStep[] = [
  { id: 'phishing', label: 'Anti-Phishing Scan' },
  { id: 'spam', label: 'Spam Trigger Check' },
  { id: 'subject', label: 'Subject Line Health' },
  { id: 'compliance', label: 'RFC Compliance' },
  { id: 'mime', label: 'Multipart MIME Structure' },
  { id: 'links', label: 'Link & URL Security' },
];

export const DeliverabilityScannerModal: React.FC<DeliverabilityScannerModalProps> = ({
  isOpen,
  onClose,
  subject,
  bodyHtml,
  bodyText,
  unsubscribeUrl,
  enableOneClickUnsubscribe,
  onInsertTag,
}) => {
  const { settings } = useApp();
  const [isScanning, setIsScanning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'issues' | 'passed' | 'subject'>('all');
  const [completedReport, setCompletedReport] = useState<DeliverabilityReport | null>(null);

  // Compute real deliverability report
  const rawReport = useMemo(() => {
    return scanDeliverability({
      subject,
      bodyHtml,
      bodyText,
      unsubscribeUrl,
      defaultUnsubscribeUrl: settings.defaultUnsubscribeUrl,
      enableGlobalUnsubscribe: settings.enableGlobalUnsubscribe !== false,
      enableOneClickUnsubscribe,
    });
  }, [subject, bodyHtml, bodyText, unsubscribeUrl, enableOneClickUnsubscribe, settings.defaultUnsubscribeUrl, settings.enableGlobalUnsubscribe]);

  // Trigger scanning sequence when modal opens
  const startRealScan = () => {
    setIsScanning(true);
    setCurrentStepIndex(0);
    setScanProgress(5);
    setCompletedReport(null);

    const stepCount = SCAN_STEPS.length;
    const stepDuration = 240;

    SCAN_STEPS.forEach((_, idx) => {
      setTimeout(() => {
        setCurrentStepIndex(idx);
        const pct = Math.round(((idx + 1) / stepCount) * 100);
        setScanProgress(pct);

        if (idx === stepCount - 1) {
          setTimeout(() => {
            setCompletedReport(rawReport);
            setIsScanning(false);
          }, 260);
        }
      }, (idx + 1) * stepDuration);
    });
  };

  useEffect(() => {
    if (isOpen) {
      startRealScan();
    } else {
      setIsScanning(false);
      setCompletedReport(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const report = completedReport || rawReport;
  const failedChecks = report.checks.filter((c) => c.status !== 'pass');
  const passedChecks = report.checks.filter((c) => c.status === 'pass');

  const displayedChecks =
    activeTab === 'issues'
      ? failedChecks
      : activeTab === 'passed'
      ? passedChecks
      : activeTab === 'subject'
      ? report.checks.filter((c) => c.category === 'subject')
      : report.checks;

  const getScoreTheme = (score: number) => {
    if (score >= 85) {
      return {
        bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        scoreText: 'text-emerald-400',
      };
    }
    if (score >= 70) {
      return {
        bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        scoreText: 'text-amber-400',
      };
    }
    return {
      bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      scoreText: 'text-rose-400',
    };
  };

  const scoreTheme = getScoreTheme(report.score);

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-[1100] p-3 sm:p-4 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-3 sm:p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white tracking-tight">Deliverability Scanner</h3>
          </div>

          <div className="flex items-center gap-1.5">
            {!isScanning && (
              <button
                type="button"
                onClick={startRealScan}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3 text-indigo-400" />
                <span>Re-Scan</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-3 sm:p-4 space-y-3.5 overflow-y-auto">
          {/* Scanning Animation State */}
          {isScanning ? (
            <div className="py-6 px-3 flex flex-col items-center justify-center space-y-5">
              {/* Radar pulse radar animation */}
              <div className="relative flex items-center justify-center w-20 h-20">
                <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping opacity-75" />
                <div className="absolute inset-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 animate-pulse" />
                <div className="relative w-12 h-12 rounded-full bg-slate-950 border border-indigo-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                  <ShieldCheck className="w-6 h-6 text-indigo-400" />
                </div>
              </div>

              {/* Progress Bar & Current Step */}
              <div className="w-full max-w-sm space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    {SCAN_STEPS[currentStepIndex]?.label || 'Scanning...'}
                  </span>
                  <span className="font-mono text-indigo-400 font-bold">{scanProgress}%</span>
                </div>

                <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300 rounded-full"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>

              {/* Step Checklist in Scanning */}
              <div className="w-full max-w-sm grid grid-cols-1 gap-1 pt-1">
                {SCAN_STEPS.map((step, idx) => {
                  const isDone = idx < currentStepIndex;
                  const isCurrent = idx === currentStepIndex;
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs border transition-all ${
                        isCurrent
                          ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200'
                          : isDone
                          ? 'bg-slate-950/60 border-slate-800 text-slate-300'
                          : 'bg-slate-950/30 border-slate-900 text-slate-600'
                      }`}
                    >
                      <span className="truncate">{step.label}</span>
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : isCurrent ? (
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-800 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Score & Verdict Banner */}
              <div className={`p-3 rounded-lg border ${scoreTheme.bg} flex items-center justify-between gap-3`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-slate-950/90 border border-slate-800 flex flex-col items-center justify-center font-mono font-extrabold text-base shrink-0 shadow-inner">
                    <span className={scoreTheme.scoreText}>{report.score}</span>
                    <span className="text-[8px] text-slate-500 font-sans font-semibold">/100</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{report.verdict}</span>
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-950/70 border border-slate-800 text-slate-300">
                        Grade {report.grade}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">{report.summary}</p>
                  </div>
                </div>

                {/* Score Stats Badges */}
                <div className="flex flex-col items-end gap-1 shrink-0 font-mono text-[10px]">
                  <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{passedChecks.length} Passed</span>
                  </div>
                  {failedChecks.length > 0 ? (
                    <div className="flex items-center gap-1 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{failedChecks.length} Issues</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                      <Check className="w-3 h-3" />
                      <span>0 Issues</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation Tabs & Safe Tags */}
              <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-md border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`px-2 py-0.5 rounded font-medium text-[11px] transition-colors ${
                      activeTab === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({report.checks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('issues')}
                    className={`px-2 py-0.5 rounded font-medium text-[11px] transition-colors flex items-center gap-1 ${
                      activeTab === 'issues'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Issues
                    {failedChecks.length > 0 && (
                      <span className="px-1 bg-rose-500 text-white rounded text-[9px] font-mono font-bold">
                        {failedChecks.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('passed')}
                    className={`px-2 py-0.5 rounded font-medium text-[11px] transition-colors ${
                      activeTab === 'passed'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Passed ({passedChecks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('subject')}
                    className={`px-2 py-0.5 rounded font-medium text-[11px] transition-colors ${
                      activeTab === 'subject'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Subject
                  </button>
                </div>

                {onInsertTag && (
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => onInsertTag('{first_name}')}
                      className="font-mono bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-1.5 py-0.5 rounded transition-colors"
                      title="Insert {first_name}"
                    >
                      +{'{first_name}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onInsertTag('{order_ref}')}
                      className="font-mono bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-1.5 py-0.5 rounded transition-colors"
                      title="Insert {order_ref}"
                    >
                      +{'{order_ref}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onInsertTag('{date}')}
                      className="font-mono bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-1.5 py-0.5 rounded transition-colors"
                      title="Insert {date}"
                    >
                      +{'{date}'}
                    </button>
                  </div>
                )}
              </div>

              {/* Audit Checks Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {displayedChecks.map((chk) => {
                  const isPass = chk.status === 'pass';
                  const isWarning = chk.status === 'warning';

                  return (
                    <div
                      key={chk.id}
                      className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1.5 transition-all ${
                        isPass
                          ? 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                          : isWarning
                          ? 'bg-amber-500/5 border-amber-500/25 text-amber-200'
                          : 'bg-rose-500/5 border-rose-500/25 text-rose-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {isPass ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : isWarning ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-semibold text-slate-100 text-xs leading-tight">
                            {chk.title}
                          </div>
                          <p className="text-[11px] text-slate-400 leading-tight">
                            {chk.description}
                          </p>
                        </div>
                      </div>

                      {!isPass && chk.advice && (
                        <div className="text-[10px] text-slate-300 bg-slate-900/90 px-2 py-1 rounded border border-slate-800/80 font-mono flex items-start gap-1">
                          <span className="text-indigo-400 shrink-0">💡</span>
                          <span>{chk.advice}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* High Risk Invoice tag notice if present */}
              {report.hasInvoiceTags && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px]">
                    Invoice tags (<strong>{'{INV}'}</strong> / <strong>{'{TRX}'}</strong>) detected. Use <strong>{'{order_ref}'}</strong> or <strong>{'{ticket_id}'}</strong> for marketing emails.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-2.5 sm:p-3 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            {isScanning ? 'Scanning content...' : `Score ${report.score}/100`}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
