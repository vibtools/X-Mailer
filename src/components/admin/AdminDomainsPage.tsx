import React, { useState } from 'react';
import {
  Globe,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  ExternalLink,
  Copy,
  Trash2,
  Power,
  Server,
  Cloud,
  Layers,
  Check,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { RegisteredDomain, DomainType, DomainStatus } from '../../types';

export const AdminDomainsPage: React.FC = () => {
  const { domains, currentHost, refreshDomains, addDomain, updateDomain, deleteDomain, addLog } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  // Add Domain Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newDomainType, setNewDomainType] = useState<DomainType>('custom');
  const [newDomainStatus, setNewDomainStatus] = useState<DomainStatus>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Domain Modal
  const [editingDomain, setEditingDomain] = useState<RegisteredDomain | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshDomains();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleCopy = (domain: string) => {
    navigator.clipboard.writeText(domain).catch(() => {});
    setCopiedDomain(domain);
    setTimeout(() => setCopiedDomain(null), 1800);
  };

  const handleToggleStatus = async (domain: RegisteredDomain) => {
    const nextStatus: DomainStatus = domain.status === 'active' ? 'suspended' : 'active';
    await updateDomain(domain.id, { status: nextStatus });
    addLog({
      level: 'info',
      message: `Domain "${domain.domain}" status changed to ${nextStatus}`,
    });
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;

    try {
      setIsSubmitting(true);
      const clean = newDomain.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
      await addDomain({
        domain: clean,
        domainType: newDomainType,
        status: newDomainStatus,
        source: 'manual',
      });
      addLog({
        level: 'success',
        message: `Registered domain "${clean}"`,
      });
      setNewDomain('');
      setNewDomainType('custom');
      setNewDomainStatus('active');
      setIsAddModalOpen(false);
    } catch (err: any) {
      alert(`Failed to add domain: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDomain) return;

    try {
      setIsSubmitting(true);
      await updateDomain(editingDomain.id, {
        domainType: editingDomain.domainType,
        status: editingDomain.status,
      });
      addLog({
        level: 'info',
        message: `Updated domain settings for "${editingDomain.domain}"`,
      });
      setEditingDomain(null);
    } catch (err: any) {
      alert(`Failed to update domain: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (domain: RegisteredDomain) => {
    if (confirm(`Remove domain "${domain.domain}" from registered list?`)) {
      await deleteDomain(domain.id);
      addLog({
        level: 'warn',
        message: `Removed domain "${domain.domain}"`,
      });
    }
  };

  const filteredDomains = domains.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (typeFilter !== 'all' && (d.domainType !== typeFilter && d.domain_type !== typeFilter)) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return d.domain.toLowerCase().includes(q) || (d.source && d.source.toLowerCase().includes(q));
    }
    return true;
  });

  const activeCount = domains.filter((d) => d.status === 'active').length;
  const cfCount = domains.filter((d) => (d.domainType === 'cloudflare_pages' || d.domain.includes('pages.dev'))).length;

  return (
    <div className="p-3.5 md:p-4 max-w-7xl mx-auto space-y-3">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-indigo-500/10 text-indigo-400">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Domains Management
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors disabled:opacity-50"
            title="Refresh domains"
          >
            <RefreshCw className={`w-3 h-3 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Domain</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-0.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="text-[11px] font-medium uppercase">Total</span>
            <Globe className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-lg font-bold font-mono text-white">{domains.length}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-0.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="text-[11px] font-medium uppercase">Active</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-bold font-mono text-emerald-400">{activeCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-0.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="text-[11px] font-medium uppercase">Cloudflare</span>
            <Cloud className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-bold font-mono text-amber-400">{cfCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-0.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="text-[11px] font-medium uppercase">Current Origin</span>
            <Server className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xs font-mono font-semibold text-indigo-300 truncate" title={currentHost}>
            {currentHost}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search domains..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[10px]">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[10px]">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="primary">Primary</option>
              <option value="cloudflare_pages">Cloudflare</option>
              <option value="custom">Custom</option>
              <option value="local">Local</option>
            </select>
          </div>
        </div>
      </div>

      {/* Domains Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-medium uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2 px-3">Domain</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Source</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Hits</th>
                <th className="py-2 px-3">Last Active</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {filteredDomains.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 font-sans">
                    No domains found.
                  </td>
                </tr>
              ) : (
                filteredDomains.map((d) => {
                  const isCurrent = d.domain.toLowerCase() === currentHost.toLowerCase();
                  const isActive = d.status === 'active';
                  const isCf = d.domainType === 'cloudflare_pages' || d.domain.includes('pages.dev');

                  return (
                    <tr key={d.id} className="hover:bg-slate-850/40 transition-colors">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5 font-sans">
                          <span className="font-mono text-slate-100 font-medium">{d.domain}</span>
                          {isCurrent && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                              Current
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopy(d.domain)}
                            title="Copy domain"
                            className="p-1 text-slate-500 hover:text-slate-200 transition-colors rounded"
                          >
                            {copiedDomain === d.domain ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <a
                            href={`https://${d.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-500 hover:text-indigo-400 transition-colors"
                            title={`Open https://${d.domain}`}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>

                      <td className="py-2 px-3 font-sans">
                        <span
                          className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border ${
                            isCf
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                              : d.domainType === 'primary'
                              ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25'
                              : d.domainType === 'local'
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          }`}
                        >
                          {d.domainType || d.domain_type || 'custom'}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-slate-300 font-sans text-[11px] capitalize">
                        {d.source === 'cloudflare' ? 'Cloudflare' : d.source === 'env' ? 'ENV' : d.source === 'manual' ? 'Manual' : 'Auto'}
                      </td>

                      <td className="py-2 px-3 font-sans">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.2 rounded border ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-slate-300">
                        {d.requestCount ?? d.request_count ?? 0}
                      </td>

                      <td className="py-2 px-3 text-slate-400 text-[10px]">
                        {d.lastActiveAt || d.last_active_at || 'Recently'}
                      </td>

                      <td className="py-2 px-3 text-right font-sans">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(d)}
                            className={`p-1 rounded transition-colors ${
                              isActive
                                ? 'text-emerald-400 hover:text-amber-400 hover:bg-slate-800'
                                : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-800'
                            }`}
                            title={isActive ? 'Suspend' : 'Activate'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingDomain(d)}
                            className="p-1 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors"
                            title="Edit"
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(d)}
                            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      </div>

      {/* Add Domain Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-sm overflow-hidden p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-white text-xs">Add New Domain</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-2.5 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1 text-[11px]">
                  Domain Hostname *
                </label>
                <input
                  type="text"
                  required
                  placeholder="app.yourdomain.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-1 text-[11px]">
                    Type
                  </label>
                  <select
                    value={newDomainType}
                    onChange={(e) => setNewDomainType(e.target.value as DomainType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="custom">Custom</option>
                    <option value="primary">Primary</option>
                    <option value="cloudflare_pages">Cloudflare</option>
                    <option value="local">Local</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1 text-[11px]">
                    Status
                  </label>
                  <select
                    value={newDomainStatus}
                    onChange={(e) => setNewDomainStatus(e.target.value as DomainStatus)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-2.5 py-1 text-slate-400 hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Add Domain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Domain Modal */}
      {editingDomain && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-sm overflow-hidden p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-white text-xs">Edit Domain</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingDomain(null)}
                className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-2.5 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1 text-[11px]">Domain</label>
                <input
                  type="text"
                  disabled
                  value={editingDomain.domain}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-400 font-mono opacity-80"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-1 text-[11px]">Type</label>
                  <select
                    value={editingDomain.domainType || editingDomain.domain_type}
                    onChange={(e) =>
                      setEditingDomain({ ...editingDomain, domainType: e.target.value as DomainType })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="custom">Custom</option>
                    <option value="primary">Primary</option>
                    <option value="cloudflare_pages">Cloudflare</option>
                    <option value="local">Local</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1 text-[11px]">Status</label>
                  <select
                    value={editingDomain.status}
                    onChange={(e) =>
                      setEditingDomain({ ...editingDomain, status: e.target.value as DomainStatus })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingDomain(null)}
                  className="px-2.5 py-1 text-slate-400 hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
