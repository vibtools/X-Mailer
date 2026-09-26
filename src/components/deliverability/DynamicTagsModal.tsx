import React, { useState } from 'react';
import {
  X,
  Tag,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  Search,
  Sparkles,
  Calendar,
  User,
  Hash,
  FileText,
} from 'lucide-react';
import { AVAILABLE_DYNAMIC_TAGS, DynamicTagInfo } from '../../utils/dynamicTags';

interface DynamicTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertTag?: (tag: string) => void;
}

export const DynamicTagsModal: React.FC<DynamicTagsModalProps> = ({
  isOpen,
  onClose,
  onInsertTag,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 1800);
  };

  const handleInsert = (tag: string) => {
    if (onInsertTag) {
      onInsertTag(tag);
    } else {
      handleCopy(tag);
    }
  };

  const categories = [
    { id: 'all', label: 'All Tags', icon: Tag },
    { id: 'personalization', label: 'Safe Personalization', icon: User },
    { id: 'date_time', label: 'Date & Time', icon: Calendar },
    { id: 'identifiers', label: 'Order & Reference', icon: Hash },
    { id: 'random', label: 'Dynamic Random', icon: Sparkles },
    { id: 'legacy_financial', label: 'Financial (Caution)', icon: AlertTriangle },
  ];

  const filteredTags = AVAILABLE_DYNAMIC_TAGS.filter((tag) => {
    const matchesSearch =
      tag.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tag.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tag.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      selectedCategory === 'all' || tag.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#111827] border border-[#1e293b] rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between bg-[#161f30]/50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#f8fafc]">
                Dynamic Personalization Tags
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#94a3b8] hover:text-[#f8fafc] p-1 rounded-md hover:bg-[#1e293b] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Controls */}
        <div className="p-3 border-b border-[#1e293b] space-y-2.5 bg-[#0e1626]/40">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#94a3b8]" />
            <input
              type="text"
              placeholder="Search dynamic tags (e.g. name, date, order, invoice)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#1a2234] border border-[#1e293b] rounded pl-8.5 pr-3 py-1.5 text-xs text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#8b5cf6]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-[#8b5cf6] text-white'
                      : 'bg-[#1a2234] text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#232e44]'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tags List */}
        <div className="p-3.5 overflow-y-auto space-y-2 flex-1 max-h-[50vh]">
          {filteredTags.length === 0 ? (
            <div className="text-center py-8 text-[#94a3b8] text-xs">
              No dynamic tags match your search query.
            </div>
          ) : (
            filteredTags.map((item) => {
              const isCaution = item.riskLevel === 'caution';
              const isCopied = copiedTag === item.tag;

              return (
                <div
                  key={item.tag}
                  className={`p-3 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCaution
                      ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                      : 'bg-[#161f30]/40 border-[#1e293b] hover:border-[#8b5cf6]/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#8b5cf6] bg-[#8b5cf6]/10 px-2 py-0.5 rounded border border-[#8b5cf6]/20">
                        {item.tag}
                      </span>
                      <span className="text-xs font-semibold text-[#f8fafc]">
                        {item.label}
                      </span>
                      {isCaution ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                          <AlertTriangle className="w-2.5 h-2.5" /> High Spam Risk
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                          <ShieldCheck className="w-2.5 h-2.5" /> Safe Tag
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#94a3b8]">{item.description}</p>
                    {item.cautionNote && (
                      <p className="text-[10px] text-amber-300/90 italic bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                        {item.cautionNote}
                      </p>
                    )}
                    <div className="text-[10px] text-[#64748b]">
                      Sample generated output:{' '}
                      <span className="font-mono text-[#cbd5e1]">{item.example}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.tag)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-[#1a2234] border border-[#1e293b] hover:bg-[#232e44] text-[#f8fafc] rounded cursor-pointer transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copy
                        </>
                      )}
                    </button>
                    {onInsertTag && (
                      <button
                        type="button"
                        onClick={() => handleInsert(item.tag)}
                        className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded cursor-pointer transition-colors"
                      >
                        Insert Tag
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#1e293b] bg-[#161f30]/40 flex justify-end items-center text-xs text-[#94a3b8]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-[#1a2234] border border-[#1e293b] hover:bg-[#222d42] text-[#f8fafc] rounded text-[11px] font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
