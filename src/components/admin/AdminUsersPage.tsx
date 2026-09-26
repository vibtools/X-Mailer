import React, { useState } from 'react';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Power,
  Check,
  Globe,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppUser } from '../../types';

export const AdminUsersPage: React.FC = () => {
  const { users, domains, addUser, updateUser, deleteUser } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'vip' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactivated'>('all');

  // Add User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'vip' | 'admin'>('user');
  const [dailyLimit, setDailyLimit] = useState(5000);
  const [isActive, setIsActive] = useState(true);
  const [selectedAllowedDomains, setSelectedAllowedDomains] = useState<string[]>(['*']);
  const [customDomainInput, setCustomDomainInput] = useState('');

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editAllowedDomains, setEditAllowedDomains] = useState<string[]>(['*']);
  const [editCustomDomainInput, setEditCustomDomainInput] = useState('');

  // Filtered users
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = u.name.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }
    return true;
  });

  const handleOpenEditModal = (u: AppUser) => {
    setEditingUser(u);
    setEditPassword('');
    if (u.allowedDomains && u.allowedDomains.length > 0) {
      setEditAllowedDomains(u.allowedDomains);
    } else {
      setEditAllowedDomains(['*']);
    }
  };

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      alert('Please fill out Name and Email.');
      return;
    }
    if (!password.trim()) {
      alert('Please provide an initial password for the user.');
      return;
    }

    addUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      role,
      dailyLimit: Number(dailyLimit) || 5000,
      usedToday: 0,
      status: isActive ? 'active' : 'deactivated',
      lastLogin: 'Never',
      allowedDomains: selectedAllowedDomains,
    });

    setName('');
    setEmail('');
    setPassword('');
    setRole('user');
    setDailyLimit(5000);
    setIsActive(true);
    setSelectedAllowedDomains(['*']);
    setCustomDomainInput('');
    setIsAddModalOpen(false);
  };

  const handleEditUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    updateUser(editingUser.id, {
      name: editingUser.name,
      email: editingUser.email,
      role: editingUser.role,
      dailyLimit: Number(editingUser.dailyLimit),
      status: editingUser.status,
      allowedDomains: editAllowedDomains,
      ...(editPassword.trim() ? { password: editPassword.trim() } : {}),
    });

    setEditingUser(null);
    setEditPassword('');
  };

  const handleToggleStatus = (u: AppUser) => {
    const nextStatus = u.status === 'active' ? 'deactivated' : 'active';
    updateUser(u.id, { status: nextStatus });
  };

  const toggleDomainInList = (
    currentList: string[],
    domain: string,
    setList: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (domain === '*') {
      setList(['*']);
      return;
    }

    const withoutAll = currentList.filter((d) => d !== '*');
    if (withoutAll.includes(domain)) {
      const filtered = withoutAll.filter((d) => d !== domain);
      setList(filtered.length === 0 ? ['*'] : filtered);
    } else {
      setList([...withoutAll, domain]);
    }
  };

  const handleAddCustomDomain = (
    value: string,
    currentList: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    setInput: React.Dispatch<React.SetStateAction<string>>
  ) => {
    if (!value.trim()) return;
    const clean = value.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
    if (clean && !currentList.includes(clean)) {
      const withoutAll = currentList.filter((d) => d !== '*');
      setList([...withoutAll, clean]);
    }
    setInput('');
  };

  return (
    <div className="p-3.5 md:p-4 max-w-7xl mx-auto space-y-3">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-amber-500/10 text-amber-400">
            <Users className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-semibold text-white tracking-tight">Users Management</h2>
        </div>

        <button
          onClick={() => {
            setSelectedAllowedDomains(['*']);
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors self-start sm:self-auto shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add User</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[10px]">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="admin">Admin</option>
              <option value="vip">VIP</option>
              <option value="user">User</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[10px]">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-medium uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">User</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Allowed Domains</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Quota</th>
                <th className="py-2.5 px-3">Today</th>
                <th className="py-2.5 px-3">Last Login</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-normal text-slate-300 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isActiveUser = u.status === 'active';
                  const userAllowed = u.allowedDomains || [];
                  const isAllDomains = userAllowed.length === 0 || userAllowed.includes('*') || userAllowed.includes('all');

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* User */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded bg-slate-800 border border-slate-700 flex items-center justify-center font-medium text-slate-300 text-[9px] shrink-0">
                            {u.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-white text-xs truncate">{u.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-2 px-3 font-mono text-[10px]">
                        <span
                          className={`font-medium uppercase ${
                            u.role === 'admin'
                              ? 'text-amber-400'
                              : u.role === 'vip'
                              ? 'text-purple-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>

                      {/* Allowed Domains */}
                      <td className="py-2 px-3">
                        {isAllDomains ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[9px]">
                            <Globe className="w-2.5 h-2.5" />
                            <span>All</span>
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {userAllowed.slice(0, 2).map((dom) => (
                              <span
                                key={dom}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono text-[9px]"
                                title={dom}
                              >
                                <span className="truncate max-w-[70px]">{dom}</span>
                              </span>
                            ))}
                            {userAllowed.length > 2 && (
                              <span className="px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono text-[9px]">
                                +{userAllowed.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.2 rounded border ${
                            isActiveUser
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-800 text-slate-500 border-slate-700'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActiveUser ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          {isActiveUser ? 'Active' : 'Deactivated'}
                        </span>
                      </td>

                      {/* Quota */}
                      <td className="py-2 px-3 font-mono text-slate-200 text-xs">
                        {u.dailyLimit.toLocaleString()}
                      </td>

                      {/* Used */}
                      <td className="py-2 px-3 font-mono text-slate-400 text-xs">
                        {u.usedToday || 0}
                      </td>

                      {/* Last Login */}
                      <td className="py-2 px-3 text-slate-400 text-[10px]">
                        {u.lastLogin || 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="p-1 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={`p-1 rounded transition-colors ${
                              isActiveUser
                                ? 'text-emerald-400 hover:text-amber-400 hover:bg-slate-800'
                                : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-800'
                            }`}
                            title={isActiveUser ? 'Deactivate' : 'Activate'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              if (window.confirm(`Delete user "${u.name}"?`)) {
                                deleteUser(u.id);
                              }
                            }}
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

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-semibold text-white text-xs flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Add User</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="space-y-2.5 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1 text-[11px]">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rachel Adams"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1 text-[11px]">Email *</label>
                <input
                  type="email"
                  required
                  placeholder="rachel@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none font-mono transition-colors"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1 text-[11px]">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-1 text-[11px]">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="user">User</option>
                    <option value="vip">VIP</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1 text-[11px]">Daily Limit</label>
                  <input
                    type="number"
                    min="100"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Allowed Domains Restriction */}
              <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-300 text-[11px] flex items-center gap-1">
                    <Globe className="w-3 h-3 text-indigo-400" />
                    Allowed Domains
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {selectedAllowedDomains.includes('*') ? 'All (*)' : `${selectedAllowedDomains.length} selected`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedAllowedDomains(['*'])}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
                      selectedAllowedDomains.includes('*')
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-medium'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Check className={`w-2.5 h-2.5 ${selectedAllowedDomains.includes('*') ? 'opacity-100' : 'opacity-0'}`} />
                    <span>All Domains (*)</span>
                  </button>
                </div>

                {domains.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1 pt-1">
                    {domains.map((dom) => {
                      const isSelected = selectedAllowedDomains.includes(dom.domain);
                      return (
                        <button
                          type="button"
                          key={dom.id}
                          onClick={() => toggleDomainInList(selectedAllowedDomains, dom.domain, setSelectedAllowedDomains)}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border font-mono transition-colors ${
                            isSelected
                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-medium'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <Check className={`w-2 h-2 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                          <span>{dom.domain}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-1 pt-1">
                  <input
                    type="text"
                    placeholder="Custom domain..."
                    value={customDomainInput}
                    onChange={(e) => setCustomDomainInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomDomain(customDomainInput, selectedAllowedDomains, setSelectedAllowedDomains, setCustomDomainInput);
                      }
                    }}
                    className="flex-1 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded px-2 py-0.5 text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCustomDomain(customDomainInput, selectedAllowedDomains, setSelectedAllowedDomains, setCustomDomainInput)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="checkbox"
                  id="userActiveCheck"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-slate-700 text-amber-600 focus:ring-0"
                />
                <label htmlFor="userActiveCheck" className="text-slate-300 font-normal text-[11px]">
                  Active immediately
                </label>
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
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-semibold text-white text-xs flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Edit User</span>
              </h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleEditUserSubmit} className="space-y-2.5 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1 text-[11px]">Full Name</label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1 text-[11px]">Email</label>
                <input
                  type="email"
                  required
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-1 text-[11px]">Role</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="user">User</option>
                    <option value="vip">VIP</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1 text-[11px]">Daily Limit</label>
                  <input
                    type="number"
                    value={editingUser.dailyLimit}
                    onChange={(e) => setEditingUser({ ...editingUser, dailyLimit: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1 text-[11px]">Status</label>
                <select
                  value={editingUser.status}
                  onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="deactivated">Deactivated</option>
                </select>
              </div>

              {/* Allowed Domains in Edit Modal */}
              <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-300 text-[11px] flex items-center gap-1">
                    <Globe className="w-3 h-3 text-indigo-400" />
                    Allowed Domains
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {editAllowedDomains.includes('*') ? 'All (*)' : `${editAllowedDomains.length} selected`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setEditAllowedDomains(['*'])}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
                      editAllowedDomains.includes('*')
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-medium'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Check className={`w-2.5 h-2.5 ${editAllowedDomains.includes('*') ? 'opacity-100' : 'opacity-0'}`} />
                    <span>All Domains (*)</span>
                  </button>
                </div>

                {domains.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1 pt-1">
                    {domains.map((dom) => {
                      const isSelected = editAllowedDomains.includes(dom.domain);
                      return (
                        <button
                          type="button"
                          key={dom.id}
                          onClick={() => toggleDomainInList(editAllowedDomains, dom.domain, setEditAllowedDomains)}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border font-mono transition-colors ${
                            isSelected
                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-medium'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <Check className={`w-2 h-2 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                          <span>{dom.domain}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-1 pt-1">
                  <input
                    type="text"
                    placeholder="Custom domain..."
                    value={editCustomDomainInput}
                    onChange={(e) => setEditCustomDomainInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomDomain(editCustomDomainInput, editAllowedDomains, setEditAllowedDomains, setEditCustomDomainInput);
                      }
                    }}
                    className="flex-1 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded px-2 py-0.5 text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCustomDomain(editCustomDomainInput, editAllowedDomains, setEditAllowedDomains, setEditCustomDomainInput)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1 text-[11px]">Reset Password (Optional)</label>
                <input
                  type="password"
                  placeholder="New password..."
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none placeholder-slate-500 font-mono transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-2.5 py-1 text-slate-400 hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
