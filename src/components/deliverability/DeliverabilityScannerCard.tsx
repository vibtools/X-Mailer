import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  Flame,
  FileCheck,
} from 'lucide-react';
import { DeliverabilityReport, scanDeliverability } from '../../utils/deliverabilityScanner';

interface DeliverabilityScannerCardProps {
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  unsubscribeUrl?: string;
  enableOneClickUnsubscribe?: boolean;
  onInsertTag?: (tag: string) => void;
}

export const DeliverabilityScannerCard: React.FC<DeliverabilityScannerCardProps> = ({
  subject,
  bodyHtml,
  bodyText,
  unsubscribeUrl,
  enableOneClickUnsubscribe = true,
  onInsertTag,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'issues' | 'subject'>('all');

  const report: DeliverabilityReport = scanDeliverability({
    subject,
    bodyHtml,
    bodyText,
    unsubscribeUrl,
    enableOneClickUnsubscribe,
  });

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (score >= 70) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  };

  const getScoreProgressColor = (score: number) => {
    if (score >= 85) return 'bg-emerald-500';
    if (score >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const failedChecks = report.checks.filter((c) => c.status !== 'pass');
//   const passedChecks = report.checks.filter((c) => c.status === 'pass');

  const displayedChecks =
    activeTab === 'issues'
      ? failedChecks
      : activeTab === 'subject'
      ? report.checks.filter((c) => c.category === 'subject')
      : report.checks;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden transition-all duration-200">
      {/* Header Bar */}
      <div className="p-2.5 sm:p-3 flex items-center justify-between gap-2.5 bg-slate-900">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded border flex items-center justify-center font-bold text-xs shrink-0 font-mono ${getScoreColor(
              report.score
            )}`}
          >
            {report.score}
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-semibold text-slate-200 truncate">
              Deliverability & Anti-Phishing Scanner
            </span>
            <span
              className={`text-[10px] font-medium font-mono px-1.5 py-0.5 rounded border ${getScoreColor(
                report.score
              )}`}
            >
              Grade {report.grade} · {report.verdict}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {report.hasInvoiceTags && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
              <AlertTriangle className="w-3 h-3" /> {`{INV}/{TRX}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 px-2 py-1 rounded transition-colors cursor-pointer"
          >
            <span>{isExpanded ? 'Hide' : failedChecks.length > 0 ? `${failedChecks.length} Issues` : 'Clean'}</span>
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-950 h-1">
        <div
          className={`h-1 transition-all duration-500 ${getScoreProgressColor(report.score)}`}
          style={{ width: `${report.score}%` }}
        />
      </div>

      {/* Expanded Audit Details */}
      {isExpanded && (
        <div className="p-3 space-y-2.5 bg-slate-950/60 border-t border-slate-800/80">
          {/* Compact Nav Tabs */}
          <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
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
                className={`px-2 py-0.5 rounded font-medium transition-colors flex items-center gap-1 ${
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
                onClick={() => setActiveTab('subject')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  activeTab === 'subject'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Subject
              </button>
            </div>

            {/* Quick Insert Safe Tags */}
            {onInsertTag && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-slate-500 hidden sm:inline font-mono">Safe Tags:</span>
                <button
                  type="button"
                  onClick={() => onInsertTag('{first_name}')}
                  className="font-mono bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 px-1.5 py-0.5 rounded transition-colors"
                >
                  +{'{first_name}'}
                </button>
                <button
                  type="button"
                  onClick={() => onInsertTag('{order_ref}')}
                  className="font-mono bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded transition-colors"
                >
                  +{'{order_ref}'}
                </button>
                <button
                  type="button"
                  onClick={() => onInsertTag('{date}')}
                  className="font-mono bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 px-1.5 py-0.5 rounded transition-colors"
                >
                  +{'{date}'}
                </button>
              </div>
            )}
          </div>

          {/* Audit Checks List - High Density Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {displayedChecks.map((chk) => {
              const isPass = chk.status === 'pass';
              const isWarning = chk.status === 'warning';

              return (
                <div
                  key={chk.id}
                  className={`p-2.5 rounded border text-xs flex flex-col justify-between gap-1.5 transition-colors ${
                    isPass
                      ? 'bg-slate-900/60 border-slate-800 text-slate-400'
                      : isWarning
                      ? 'bg-amber-500/5 border-amber-500/20 text-amber-200'
                      : 'bg-rose-500/5 border-rose-500/20 text-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {isPass && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                    {isWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
                    {!isPass && !isWarning && <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-200 text-[11px] leading-tight">
                        {chk.title}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {chk.description}
                      </p>
                    </div>
                  </div>
                  {chk.advice && (
                    <div className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/80 font-mono">
                      💡 {chk.advice}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Dynamic Tag Caution Banner if INV or TRX used */}
          {report.hasInvoiceTags && (
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px]">
                Replace fake invoice tags ({'{INV}'} / {'{TRX}'}) with <strong>{'{order_ref}'}</strong> or <strong>{'{ticket_id}'}</strong> to avoid spam filters.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

