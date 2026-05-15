"use client";

import { useState, useEffect, useCallback } from 'react';
import { Mail, RefreshCw, Send, User, Calendar, ChevronLeft, LogOut, Briefcase, Megaphone, Users, AlertCircle, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface EmailSummary {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  summary: string;
  category: string;
  is_important: boolean;
  auto_replied: boolean;
  approval_pending: boolean;
  auto_reply_error?: string | null;
  received_at: string;
}

interface EmailDetail {
  id: string;
  subject: string;
  sender: string;
  to: string;
  date: string;
  body: string;
}

type ToastState = {
  type: 'success' | 'error';
  message: string;
};

interface ApprovalDraft {
  id: string;
  email_id: string;
  subject: string;
  sender: string;
  snippet: string;
  summary: string;
  draft: string;
  status: string;
  received_at: string;
  created_at: string;
  updated_at: string;
  sent_message_id?: string | null;
  error?: string | null;
}

type DashboardView = 'inbox' | 'approvals' | 'compose';

const CATEGORIES = [
  { id: 'all', label: 'All Mails', icon: Mail },
  { id: 'Personal', label: 'Personal', icon: User },
  { id: 'Business', label: 'Business', icon: Briefcase },
  { id: 'Ad', label: 'Ads', icon: Megaphone },
  { id: 'Social', label: 'Social', icon: Users },
  { id: 'Spam', label: 'Spam', icon: AlertCircle },
];

function formatRelativeTime(dateString: string) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateString;
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  Personal: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  Business: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  Ad: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  Social: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  Spam: 'text-red-400 bg-red-400/10 border-red-400/20',
};

export default function Dashboard() {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  
  const [selectedEmail, setSelectedEmail] = useState<EmailSummary | null>(null);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyUpdating, setAutoReplyUpdating] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>('inbox');
  const [approvals, setApprovals] = useState<ApprovalDraft[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);
  const [composeRecipients, setComposeRecipients] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: ToastState['type'], message: string) => {
    setToast({ type, message });
  }, []);

  const fetchEmails = useCallback(async (token?: string) => {
    if (token) setLoadingMore(true);
    else setLoading(true);

    try {
      const url = new URL('http://localhost:8000/api/emails/summaries');
      if (token) url.searchParams.append('page_token', token);
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        if (response.status === 500) {
          window.location.href = 'http://localhost:8000/api/auth/login';
          return;
        }
        throw new Error('Failed to fetch');
      }
      const data = await response.json();
      
      if (token) {
        setEmails(prev => [...prev, ...data.emails]);
      } else {
        setEmails(data.emails);
      }
      setNextPageToken(data.next_page_token);
    } catch {
      showToast('error', "Failed to fetch emails.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [showToast]);

  const fetchApprovals = useCallback(async (silent = false) => {
    if (!silent) setLoadingApprovals(true);

    try {
      const response = await fetch('http://localhost:8000/api/emails/approvals?status=pending');
      if (!response.ok) throw new Error('Failed to fetch approvals');

      const data = await response.json();
      setApprovals(data);
    } catch {
      if (!silent) showToast('error', "Failed to fetch approval drafts.");
    } finally {
      if (!silent) setLoadingApprovals(false);
    }
  }, [showToast]);

  const fetchAutoReplyStatus = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/api/emails/auto-reply/status');
      if (!response.ok) throw new Error('Failed to fetch auto-reply status');

      const data = await response.json();
      const legacyLocalState = localStorage.getItem('autoReplyEnabled') === 'true';

      if (legacyLocalState && !data.enabled) {
        const updateResponse = await fetch('http://localhost:8000/api/emails/auto-reply/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        });
        const updatedData = await updateResponse.json();
        setAutoReplyEnabled(updatedData.enabled);
        localStorage.removeItem('autoReplyEnabled');
        return;
      }

      setAutoReplyEnabled(data.enabled);
      localStorage.removeItem('autoReplyEnabled');
    } catch {
    }
  }, []);

  const toggleAutoReply = async () => {
    const newState = !autoReplyEnabled;
    setAutoReplyUpdating(true);

    try {
      const response = await fetch('http://localhost:8000/api/emails/auto-reply/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newState }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Failed to update auto-reply');
      }

      const data = await response.json();
      setAutoReplyEnabled(data.enabled);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : "Failed to update auto-reply");
    } finally {
      setAutoReplyUpdating(false);
    }
  };

  const fetchEmailDetail = async (email: EmailSummary) => {
    setSelectedEmail(email);
    setLoadingDetail(true);
    setEmailDetail(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const response = await fetch(`http://localhost:8000/api/emails/${email.id}`);
      if (response.ok) {
        const data = await response.json();
        setEmailDetail(data);
      }
    } catch {
      showToast('error', "Failed to fetch email detail.");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Call fetch on next tick to avoid synchronous setState warning
    const timeoutId = setTimeout(() => {
      if (mounted) {
        fetchAutoReplyStatus();
        fetchEmails();
        fetchApprovals();
      }
    }, 0);
    
    const interval = setInterval(() => {
      if (mounted) {
        fetchAutoReplyStatus();
        fetchEmails();
        fetchApprovals(true);
      }
    }, 120000);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, [fetchAutoReplyStatus, fetchEmails, fetchApprovals]);

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 3500);

    return () => clearTimeout(timeoutId);
  }, [toast]);

  const handleSendReply = async () => {
    if (!selectedEmail || !replyText.trim()) return;

    setSending(true);
    try {
      const response = await fetch(`http://localhost:8000/api/emails/${selectedEmail.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_content: replyText.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Failed to send reply');
      }

      setEmails(prev => prev.map(email => (
        email.id === selectedEmail.id
          ? { ...email, auto_replied: true, approval_pending: false, auto_reply_error: null }
          : email
      )));
      setApprovals(prev => prev.filter(approval => approval.email_id !== selectedEmail.id));
      setSelectedEmail(null);
      setEmailDetail(null);
      setReplyText("");
      showToast('success', "Reply sent successfully.");
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const parseRecipients = (value: string) => (
    value
      .split(/[\s,;]+/)
      .map(recipient => recipient.trim())
      .filter(Boolean)
  );

  const handleSendNewEmail = async () => {
    const recipients = parseRecipients(composeRecipients);

    if (recipients.length === 0 || !composeSubject.trim() || !composeBody.trim()) {
      showToast('error', "Recipients, subject, and message are required.");
      return;
    }

    setComposeSending(true);
    try {
      const response = await fetch('http://localhost:8000/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          subject: composeSubject.trim(),
          body: composeBody.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Failed to send email');
      }

      setComposeRecipients("");
      setComposeSubject("");
      setComposeBody("");
      setActiveView('inbox');
      showToast('success', "Email sent successfully.");
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : "Failed to send email");
    } finally {
      setComposeSending(false);
    }
  };

  const updateApprovalDraft = (emailId: string, draft: string) => {
    setApprovals(prev => prev.map(approval => (
      approval.email_id === emailId ? { ...approval, draft } : approval
    )));
  };

  const handleSendApproval = async (approval: ApprovalDraft) => {
    const replyContent = approval.draft.trim();
    if (!replyContent) {
      showToast('error', "Approval draft cannot be empty.");
      return;
    }

    setApprovalActionId(approval.email_id);
    try {
      const response = await fetch(`http://localhost:8000/api/emails/approvals/${encodeURIComponent(approval.email_id)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_content: replyContent }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Failed to send approval');
      }

      setApprovals(prev => prev.filter(item => item.email_id !== approval.email_id));
      setEmails(prev => prev.map(email => (
        email.id === approval.email_id
          ? { ...email, auto_replied: true, approval_pending: false, auto_reply_error: null }
          : email
      )));
      showToast('success', "Approved reply sent.");
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : "Failed to send approved reply");
    } finally {
      setApprovalActionId(null);
    }
  };

  const handleRejectApproval = async (approval: ApprovalDraft) => {
    setApprovalActionId(approval.email_id);
    try {
      const response = await fetch(`http://localhost:8000/api/emails/approvals/${encodeURIComponent(approval.email_id)}/reject`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Failed to reject approval');
      }

      setApprovals(prev => prev.filter(item => item.email_id !== approval.email_id));
      setEmails(prev => prev.map(email => (
        email.id === approval.email_id
          ? { ...email, approval_pending: false }
          : email
      )));
      showToast('success', "Draft rejected.");
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : "Failed to reject draft");
    } finally {
      setApprovalActionId(null);
    }
  };

  const filteredEmails = activeCategory === 'all' 
    ? emails 
    : emails.filter(e => e.category === activeCategory);

  const navItems = [
    { id: 'inbox', label: 'Inbox', icon: Mail, count: emails.length },
    { id: 'approvals', label: 'Approval Queue', icon: Sparkles, count: approvals.length },
    { id: 'compose', label: 'Compose', icon: Send, count: undefined },
  ] as const;

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 selection:bg-blue-500/30">
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            className={cn(
              "fixed right-8 top-8 z-[60] flex max-w-md items-center gap-3 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-xl",
              toast.type === 'success'
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 shadow-emerald-950/30"
                : "border-red-500/30 bg-red-500/10 text-red-200 shadow-red-950/30"
            )}
          >
            <div className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl",
              toast.type === 'success' ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
            )}>
              {toast.type === 'success' ? <Send className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            </div>
            <p className="min-w-0 flex-1 text-sm font-bold leading-relaxed text-white">
              {toast.message}
            </p>
            <button
              onClick={() => setToast(null)}
              className="rounded-full p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!selectedEmail ? (
          <motion.div 
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-[1600px] mx-auto px-10 py-10"
          >
            {/* Ultra Premium Header */}
            <header className="flex flex-col gap-8 mb-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white flex items-center justify-center rounded-2xl shadow-2xl shadow-white/10">
                   <Mail className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tighter">MAILAGENT</h1>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Neural Inbox Intelligence</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 lg:gap-4">
                <button
                  onClick={() => setActiveView('compose')}
                  className="flex items-center gap-2 px-6 py-2.5 bg-white text-black hover:bg-blue-500 hover:text-white rounded-full border border-white transition-all text-xs font-bold"
                >
                  <Send className="w-3.5 h-3.5" />
                  Compose
                </button>
                <button 
                  onClick={toggleAutoReply}
                  disabled={autoReplyUpdating}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2.5 rounded-full border transition-all text-xs font-bold disabled:opacity-60",
                    autoReplyEnabled 
                      ? "bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]" 
                      : "bg-white/5 border-white/5 text-zinc-500 hover:text-white"
                  )}
                >
                  <Sparkles className={cn("w-3.5 h-3.5", (autoReplyEnabled || autoReplyUpdating) && "animate-pulse")} />
                  {autoReplyEnabled ? "AI Drafts ON" : "AI Drafts OFF"}
                </button>
                <button 
                  onClick={() => {
                    fetchEmails();
                    fetchApprovals();
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 transition-all text-xs font-bold"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                  Sync
                </button>
                <div className="h-8 w-px bg-white/10" />
                <button 
                  onClick={() => window.location.href = 'http://localhost:8000/api/auth/logout'}
                  className="group flex items-center gap-2 text-zinc-500 hover:text-red-400 transition-all"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest">Logout</span>
                  <div className="p-2.5 rounded-full bg-white/5 group-hover:bg-red-500/10 transition-all">
                    <LogOut className="w-4 h-4" />
                  </div>
                </button>
              </div>
            </header>

            <nav className="mb-10 grid gap-3 sm:grid-cols-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-all",
                      isActive
                        ? "border-white bg-white text-black shadow-lg"
                        : "border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-white"
                    )}
                  >
                    <span className="flex items-center gap-3 text-xs font-black uppercase tracking-widest">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    {item.count !== undefined && (
                      <span className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-black",
                        isActive ? "bg-black/10 text-black" : "bg-white/10 text-zinc-400"
                      )}>
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {activeView === 'inbox' && (
              <>
                <div className="flex items-center gap-4 mb-10 overflow-x-auto pb-4 no-scrollbar">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={cn(
                        "flex h-11 items-center justify-center gap-2.5 whitespace-nowrap rounded-full border px-6 text-xs font-bold uppercase tracking-widest transition-all",
                        activeCategory === cat.id
                          ? "bg-white text-black border-white shadow-lg"
                          : "bg-white/5 text-zinc-500 border-white/10 hover:border-white/20 hover:text-white"
                      )}
                    >
                      <cat.icon className="w-4 h-4" />
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-6">
                  {loading && emails.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 gap-6">
                      <div className="w-16 h-16 border-b-2 border-white animate-spin rounded-full" />
                      <p className="text-zinc-500 font-black uppercase tracking-[0.3em] text-[10px]">Scanning Inbox</p>
                    </div>
                  ) : (
                    <>
                      {filteredEmails.length === 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-white/5 bg-white/[0.01] py-32"
                        >
                          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/5 text-zinc-600">
                            <Mail className="w-8 h-8 opacity-20" />
                          </div>
                          <h3 className="mb-2 text-xl font-bold tracking-tight text-zinc-400">No Mail Found</h3>
                          <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">No messages in this category</p>
                        </motion.div>
                      ) : (
                        <>
                          {filteredEmails.map((email, index) => (
                            <motion.div
                              key={email.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.03 }}
                              onClick={() => fetchEmailDetail(email)}
                              className="group relative cursor-pointer rounded-[2rem] border border-white/5 bg-white/[0.02] p-8 transition-all duration-500 hover:border-blue-500/20 hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-blue-500/5 active:scale-[0.99]"
                            >
                              <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex min-w-0 flex-grow items-start gap-5">
                                  <div className={cn(
                                    "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border transition-all duration-500",
                                    CATEGORY_COLORS[email.category] || 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20'
                                  )}>
                                    {(() => {
                                      const Icon = CATEGORIES.find(c => c.id === email.category)?.icon || Mail;
                                      return <Icon className="w-5 h-5" />;
                                    })()}
                                  </div>
                                  <div className="min-w-0 flex-grow">
                                    <div className="mb-2 flex flex-wrap items-center gap-3">
                                      <h3 className="break-words text-xl font-bold leading-tight tracking-tight text-white transition-colors duration-500 group-hover:text-blue-200">
                                        {email.subject}
                                      </h3>
                                      {email.is_important && (
                                        <span className="rounded bg-blue-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                                          Important
                                        </span>
                                      )}
                                      {email.approval_pending && (
                                        <span className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-300">
                                          <Sparkles className="h-2 w-2" />
                                          Draft Ready
                                        </span>
                                      )}
                                      {email.auto_replied && (
                                        <span className="flex items-center gap-1 rounded border border-green-500/30 bg-green-500/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-green-400">
                                          <Send className="w-2 h-2" />
                                          Replied
                                        </span>
                                      )}
                                      {email.auto_reply_error && (
                                        <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-red-400">
                                          Reply Failed
                                        </span>
                                      )}
                                      <span className={cn(
                                        "flex-shrink-0 rounded border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest",
                                        CATEGORY_COLORS[email.category] || 'text-zinc-500 border-zinc-500/20'
                                      )}>
                                        {email.category}
                                      </span>
                                    </div>
                                    <p className="text-xs font-medium text-zinc-500">{email.sender}</p>
                                  </div>
                                </div>
                                <span className="text-[10px] font-black uppercase text-zinc-700 lg:whitespace-nowrap">{formatRelativeTime(email.received_at)}</span>
                              </div>

                              <div className="relative border-l border-white/10 pl-6">
                                <div className="mb-2 flex items-center gap-2">
                                  <Sparkles className="w-3 h-3 text-amber-400" />
                                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">AI Synopsis</span>
                                </div>
                                <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
                                  {email.summary}
                                </p>
                              </div>

                              <div className="absolute right-8 top-1/2 hidden -translate-y-1/2 opacity-0 transition-all duration-500 group-hover:translate-x-2 group-hover:opacity-100 lg:block">
                                <ChevronLeft className="w-6 h-6 rotate-180 text-white" />
                              </div>
                            </motion.div>
                          ))}

                          {nextPageToken && (
                            <button
                              onClick={() => fetchEmails(nextPageToken)}
                              disabled={loadingMore}
                              className="mt-8 w-full rounded-2xl border border-dashed border-white/10 py-5 text-[10px] font-black uppercase tracking-[0.5em] text-zinc-500 transition-all hover:border-solid hover:bg-white/5 hover:text-white disabled:opacity-50"
                            >
                              {loadingMore ? "Loading..." : "Load More"}
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {activeView === 'approvals' && (
              <section className="space-y-6">
                <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-3xl font-black tracking-tight text-white">Approval Queue</h2>
                    <p className="mt-2 text-sm text-zinc-500">Review AI drafts before anything leaves your inbox.</p>
                  </div>
                  <button
                    onClick={() => fetchApprovals()}
                    disabled={loadingApprovals}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-bold text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", loadingApprovals && "animate-spin")} />
                    Refresh
                  </button>
                </div>

                {loadingApprovals ? (
                  <div className="flex flex-col items-center justify-center gap-6 py-32">
                    <div className="h-14 w-14 animate-spin rounded-full border-b-2 border-white" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Loading Drafts</p>
                  </div>
                ) : approvals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-white/5 bg-white/[0.01] py-32">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/5 text-zinc-600">
                      <Sparkles className="h-8 w-8 opacity-20" />
                    </div>
                    <h3 className="mb-2 text-xl font-bold tracking-tight text-zinc-400">No Drafts Waiting</h3>
                    <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">New important replies will appear here</p>
                  </div>
                ) : (
                  approvals.map((approval, index) => {
                    const actionInProgress = approvalActionId === approval.email_id;

                    return (
                      <motion.article
                        key={approval.email_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7"
                      >
                        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-3">
                              <h3 className="break-words text-xl font-bold tracking-tight text-white">{approval.subject}</h3>
                              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-300">
                                Pending
                              </span>
                            </div>
                            <p className="text-xs font-medium text-zinc-500">{approval.sender}</p>
                          </div>
                          <span className="text-[10px] font-black uppercase text-zinc-700 lg:whitespace-nowrap">
                            {formatRelativeTime(approval.received_at)}
                          </span>
                        </div>

                        <div className="mb-5 border-l border-white/10 pl-5">
                          <div className="mb-2 flex items-center gap-2">
                            <Sparkles className="h-3 w-3 text-amber-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">AI Synopsis</span>
                          </div>
                          <p className="text-sm leading-relaxed text-zinc-400">{approval.summary}</p>
                        </div>

                        <textarea
                          value={approval.draft}
                          onChange={(event) => updateApprovalDraft(approval.email_id, event.target.value)}
                          className="min-h-52 w-full resize-y rounded-2xl border border-white/10 bg-black px-5 py-4 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-blue-500/50"
                        />

                        {approval.error && (
                          <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{approval.error}</p>
                        )}

                        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                          <button
                            onClick={() => handleRejectApproval(approval)}
                            disabled={actionInProgress}
                            className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-xs font-bold text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleSendApproval(approval)}
                            disabled={actionInProgress || !approval.draft.trim()}
                            className="flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-xs font-black uppercase tracking-widest text-black transition-colors hover:bg-blue-500 hover:text-white disabled:opacity-40"
                          >
                            {actionInProgress ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Send Approved
                          </button>
                        </div>
                      </motion.article>
                    );
                  })
                )}
              </section>
            )}

            {activeView === 'compose' && (
              <section className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 border-b border-white/10 px-8 py-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black">
                    <Send className="h-4 w-4" />
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-white">Compose Mail</h2>
                </div>

                <div className="space-y-5 p-8">
                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      To
                    </label>
                    <input
                      value={composeRecipients}
                      onChange={(event) => setComposeRecipients(event.target.value)}
                      placeholder="first@example.com, second@example.com"
                      className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-blue-500/50"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      Subject
                    </label>
                    <input
                      value={composeSubject}
                      onChange={(event) => setComposeSubject(event.target.value)}
                      placeholder="Subject"
                      className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-blue-500/50"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      Message
                    </label>
                    <textarea
                      value={composeBody}
                      onChange={(event) => setComposeBody(event.target.value)}
                      placeholder="Write your message..."
                      className="h-80 w-full resize-y rounded-2xl border border-white/10 bg-black px-5 py-4 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-blue-500/50"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-white/10 px-8 py-6 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => {
                      setComposeRecipients("");
                      setComposeSubject("");
                      setComposeBody("");
                    }}
                    disabled={composeSending}
                    className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-xs font-bold text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleSendNewEmail}
                    disabled={composeSending || parseRecipients(composeRecipients).length === 0 || !composeSubject.trim() || !composeBody.trim()}
                    className="flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-xs font-black uppercase tracking-widest text-black transition-colors hover:bg-blue-500 hover:text-white disabled:opacity-40"
                  >
                    {composeSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send Mail
                  </button>
                </div>
              </section>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-[1600px] mx-auto px-10 py-10"
          >
            <nav className="mb-16">
              <button 
                onClick={() => setSelectedEmail(null)}
                className="group flex items-center gap-4 text-zinc-500 hover:text-white transition-all"
              >
                <div className="p-3 rounded-2xl bg-white/5 group-hover:bg-white/10 transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </div>
                <span className="font-black uppercase tracking-[0.2em] text-xs">Back to Neural Index</span>
              </button>
            </nav>

            {loadingDetail ? (
              <div className="flex flex-col items-center justify-center py-40 gap-6">
                <div className="w-12 h-12 border-t-2 border-blue-500 animate-spin rounded-full" />
                <p className="text-zinc-500 font-black tracking-widest text-[10px]">Accessing Encrypted Content</p>
              </div>
            ) : emailDetail && (
              <div className="space-y-16">
                <header className="mb-12">
                  <div className="flex items-center gap-3 mb-8">
                     <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/20">
                       {selectedEmail.category} Intelligence
                     </span>
                  </div>
                   <h2 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-600 tracking-tighter leading-tight mb-10">
                     {emailDetail.subject}
                   </h2>
                  
                  <div className="flex gap-12">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-500">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-zinc-600 text-[9px] font-black uppercase tracking-widest mb-1">Originator</p>
                        <p className="text-white font-bold text-sm">{emailDetail.sender}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-500">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-zinc-600 text-[9px] font-black uppercase tracking-widest mb-1">Timestamp</p>
                        <p className="text-white font-bold text-sm">
                          {new Date(emailDetail.date).toLocaleString('en-GB', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </header>

                 <div className="p-10 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-2xl rounded-[2.5rem] border border-white/10 relative overflow-hidden group shadow-2xl">
                  <div className="absolute -bottom-4 -right-4 p-8 opacity-[0.03]">
                    <Sparkles className="w-32 h-32 text-white" />
                  </div>
                  <div className="flex items-center gap-3 mb-6">
                    <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Core Analysis</h4>
                  </div>
                  <p className="text-zinc-200 text-2xl font-bold italic leading-relaxed relative z-10">
                    &quot;{selectedEmail.summary}&quot;
                  </p>
                </div>

                <div className="bg-zinc-900/40 rounded-[2rem] p-10 border border-white/5 leading-relaxed text-zinc-300 text-lg font-medium whitespace-pre-wrap">
                  {emailDetail.body}
                </div>

                <section className="pt-16 border-t border-white/10">
                  <div className="flex items-center justify-between mb-10">
                    <h3 className="text-3xl font-black text-white tracking-tighter">Draft Transmission</h3>
                    <button 
                      className="px-6 py-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-all text-[10px] font-black uppercase tracking-widest border border-blue-500/20 flex items-center gap-2"
                      onClick={() => setReplyText(`Acknowledged. I've analyzed your message regarding "${emailDetail.subject}" and will formulate a comprehensive response shortly.`)}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="text-xs font-black uppercase tracking-widest">Neural Draft</span>
                    </button>
                  </div>
                  
                  <div className="relative group">
                    <textarea 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Input reply sequence..."
                       className="w-full h-64 bg-[#080808] border border-white/5 rounded-[2.5rem] p-10 text-white text-lg focus:outline-none focus:border-blue-500/30 transition-all resize-none shadow-inner placeholder:text-zinc-800"
                    />
                    <div className="absolute bottom-8 right-8">
                      <button 
                        onClick={handleSendReply}
                        disabled={sending || !replyText.trim()}
                        className="flex items-center gap-4 px-8 py-4 bg-white text-black hover:bg-blue-500 hover:text-white disabled:opacity-30 font-black uppercase tracking-widest rounded-2xl transition-all shadow-2xl active:scale-95 text-xs"
                      >
                        {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Execute Dispatch
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
