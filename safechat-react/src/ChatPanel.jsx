import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  PhoneIcon,
  VideoCameraIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  XMarkIcon,
  ChatBubbleLeftEllipsisIcon,
  FlagIcon,
} from '@heroicons/react/24/outline';
import { supabase, supabaseRealtimeEnabled } from './lib/supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const api = {
  getMessages: async (username, otherUsername) => {
    const res = await fetch(`${API_BASE_URL}/get_feed/${username}?other_username=${encodeURIComponent(otherUsername)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to fetch messages');
    return data;
  },
  getUsers: async (username) => {
    const res = await fetch(`${API_BASE_URL}/get_users/${username}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to fetch users');
    return data;
  },
  sendMessage: async (senderUser, receiverUser, text) => {
    const res = await fetch(`${API_BASE_URL}/send_message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: senderUser, receiver_username: receiverUser, text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to send message');
    return data;
  },
  reportMessage: async (reporterUsername, messageId, reason, description) => {
    const res = await fetch(`${API_BASE_URL}/report_message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reporter_username: reporterUsername,
        message_id: messageId,
        reason,
        description,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to report message');
    return data;
  },
};

/* ── Typing indicator dots ── */
function TypingDots() {
  return (
    <span className="flex items-center gap-1 px-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
    </span>
  );
}

/* ── Empty user list ── */
function NoUsersView({ onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-4 flex w-full max-w-md flex-col items-center rounded-3xl border border-neutral-800 bg-neutral-900 p-10 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 rounded-full bg-green-500/10 p-5">
          <ChatBubbleLeftEllipsisIcon className="h-10 w-10 text-green-500/60" />
        </div>
        <h3 className="text-lg font-semibold text-white">No conversations yet</h3>
        <p className="mt-1 text-sm text-gray-500">Find friends from the sidebar to start chatting.</p>
        <button
          onClick={onClose}
          className="mt-6 rounded-full bg-green-500/10 px-6 py-2.5 text-sm font-semibold text-green-400 ring-1 ring-green-500/20 transition hover:bg-green-500 hover:text-black hover:ring-transparent"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}

export default function ChatPanel({
  onClose,
  currentUser,
  showNotification,
  initialActiveUser = null,
  refreshToken = 0,
}) {
  const [activeUser, setActiveUser] = useState(initialActiveUser || '');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDescription, setReportDescription] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const chatWindowRef = useRef(null);
  const typingBroadcastTimeoutRef = useRef(null);
  const typingChannelRef = useRef(null);
  const isTypingBroadcastedRef = useRef(false);
  const messageRefreshTimeoutRef = useRef(null);
  const isFetchingMessagesRef = useRef(false);

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    if (!keyword) return availableUsers;
    return availableUsers.filter((username) => username.toLowerCase().includes(keyword));
  }, [availableUsers, userSearch]);

  const scrollToBottom = () => {
    chatWindowRef.current?.scrollTo({ top: chatWindowRef.current.scrollHeight, behavior: 'auto' });
  };

  const fetchMessages = useCallback(async () => {
    if (!currentUser || !activeUser || isFetchingMessagesRef.current) return;
    isFetchingMessagesRef.current = true;
    try {
      const fetched = await api.getMessages(currentUser, activeUser);
      if (Array.isArray(fetched)) setMessages(fetched);
    } catch (e) {
      console.error('Failed to fetch messages:', e);
    } finally {
      isFetchingMessagesRef.current = false;
    }
  }, [currentUser, activeUser]);

  const scheduleFetchMessages = useCallback(() => {
    if (messageRefreshTimeoutRef.current) return;
    messageRefreshTimeoutRef.current = setTimeout(() => {
      messageRefreshTimeoutRef.current = null;
      fetchMessages();
    }, 250);
  }, [fetchMessages]);

  const sendTypingEvent = useCallback(
    async (isTyping) => {
      const channel = typingChannelRef.current;
      if (!channel || !currentUser || !activeUser) return;
      try {
        await channel.send({ type: 'broadcast', event: 'typing', payload: { from: currentUser, to: activeUser, isTyping, at: Date.now() } });
        isTypingBroadcastedRef.current = isTyping;
      } catch (e) {
        console.error('Failed to broadcast typing event:', e);
      }
    },
    [currentUser, activeUser]
  );

  const fetchUsers = useCallback(async () => {
    if (!currentUser) return;
    try {
      const users = await api.getUsers(currentUser);
      if (!Array.isArray(users)) return;
      const userList = users.map((u) => u.username).filter(Boolean);
      setAvailableUsers(userList);
      setActiveUser((prev) => {
        if (initialActiveUser && userList.includes(initialActiveUser)) return initialActiveUser;
        if (prev && userList.includes(prev)) return prev;
        return userList[0] || '';
      });
    } catch (e) {
      console.error('Failed to fetch users:', e);
    }
  }, [currentUser, initialActiveUser]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    fetchMessages();
    if (!supabase || !supabaseRealtimeEnabled || !currentUser) return;
    const channel = supabase
      .channel(`chat_messages_feed_${currentUser}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => scheduleFetchMessages())
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload) return;
        if (payload.from === activeUser && payload.to === currentUser) setIsOtherUserTyping(Boolean(payload.isTyping));
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => { typingChannelRef.current = null; supabase.removeChannel(channel); };
  }, [currentUser, activeUser, fetchMessages, scheduleFetchMessages]);

  useEffect(() => {
    if (!activeUser) { setIsOtherUserTyping(false); return; }
    if (!newMessage.trim()) {
      if (isTypingBroadcastedRef.current) sendTypingEvent(false);
      return;
    }
    if (!isTypingBroadcastedRef.current) sendTypingEvent(true);
    if (typingBroadcastTimeoutRef.current) clearTimeout(typingBroadcastTimeoutRef.current);
    typingBroadcastTimeoutRef.current = setTimeout(() => { sendTypingEvent(false); }, 1200);
    return () => { if (typingBroadcastTimeoutRef.current) clearTimeout(typingBroadcastTimeoutRef.current); };
  }, [newMessage, activeUser, sendTypingEvent]);

  useEffect(() => {
    return () => {
      if (typingBroadcastTimeoutRef.current) clearTimeout(typingBroadcastTimeoutRef.current);
      if (messageRefreshTimeoutRef.current) clearTimeout(messageRefreshTimeoutRef.current);
      if (isTypingBroadcastedRef.current) sendTypingEvent(false);
    };
  }, [sendTypingEvent]);

  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => { setIsOtherUserTyping(false); }, [activeUser]);
  useEffect(() => { if (refreshToken) scheduleFetchMessages(); }, [refreshToken, scheduleFetchMessages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeUser) return;
    try {
      const response = await api.sendMessage(currentUser, activeUser, newMessage);
      if (response.notification) showNotification(response.notification);
      if (Array.isArray(response.messages)) setMessages(response.messages);
      setNewMessage('');
      if (isTypingBroadcastedRef.current) sendTypingEvent(false);
      scheduleFetchMessages();
    } catch (e) {
      console.error('Failed to send message:', e);
      showNotification(`Error: ${e.message || 'Could not send message.'}`);
    }
  };

  const openReportDialog = (message) => {
    setReportTarget(message);
    setReportReason('spam');
    setReportDescription('');
  };

  const closeReportDialog = () => {
    if (isSubmittingReport) return;
    setReportTarget(null);
    setReportReason('spam');
    setReportDescription('');
  };

  const submitReport = async (e) => {
    e.preventDefault();
    if (!reportTarget || !currentUser) return;
    setIsSubmittingReport(true);
    try {
      await api.reportMessage(currentUser, reportTarget.id, reportReason, reportDescription.trim() || null);
      showNotification('Message reported successfully.');
      closeReportDialog();
    } catch (error) {
      console.error('Failed to report message:', error);
      showNotification(`Error: ${error.message || 'Could not report message.'}`);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const formatTime = (v) => {
    if (!v) return '';
    try { return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  if (!availableUsers.length) return <NoUsersView onClose={onClose} />;

  return (
    <>
      {reportTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
          onClick={closeReportDialog}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Report message</h3>
              <button onClick={closeReportDialog} className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white/5 hover:text-gray-300">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-gray-300">
              <p className="text-xs uppercase tracking-wide text-gray-500">Message preview</p>
              <p className="mt-2 leading-relaxed">{reportTarget.text}</p>
            </div>

            <form onSubmit={submitReport} className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-200">Reason</span>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-white outline-none transition focus:border-green-500/40 focus:ring-2 focus:ring-green-500/15"
                >
                  <option value="spam">Spam or unsolicited</option>
                  <option value="harassment">Harassment or bullying</option>
                  <option value="hate">Hate speech</option>
                  <option value="scam">Scam or fraud</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-200">Additional details</span>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  rows={4}
                  placeholder="Optional context for moderation"
                  className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-green-500/40 focus:ring-2 focus:ring-green-500/15"
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeReportDialog}
                  className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/5"
                  disabled={isSubmittingReport}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReport}
                  className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingReport ? 'Sending…' : 'Submit report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[85vh] w-[92vw] max-w-6xl overflow-hidden rounded-3xl border border-neutral-800/70 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── LEFT: User list ── */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-neutral-800/60 bg-neutral-950/80 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-neutral-800/60 px-5 py-4">
            <h3 className="text-base font-semibold tracking-tight text-white">Chats</h3>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white/5 hover:text-gray-300">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/70 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-green-500/40 focus:ring-1 focus:ring-green-500/20"
              />
            </div>
          </div>

          {/* Users */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {filteredUsers.map((username) => {
              const isActive = activeUser === username;
              return (
                <button
                  key={username}
                  onClick={() => setActiveUser(username)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
                    isActive
                      ? 'bg-green-500/10 shadow-[inset_3px_0_0_0_rgba(34,197,94,.6)]'
                      : 'hover:bg-white/[.04]'
                  }`}
                >
                  <img
                    src={`https://i.pravatar.cc/150?u=${username}`}
                    alt={username}
                    className={`h-10 w-10 rounded-full border transition-colors ${
                      isActive ? 'border-green-500/60' : 'border-neutral-700'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium capitalize text-white">{username}</p>
                    <p className="truncate text-xs text-gray-500">
                      {isActive ? 'Active now' : 'Tap to chat'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── RIGHT: Conversation ── */}
        <section className="flex min-w-0 flex-1 flex-col bg-neutral-900">
          {/* Header */}
          <header className="flex items-center justify-between border-b border-neutral-800/60 px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img src={`https://i.pravatar.cc/150?u=${activeUser}`} alt={activeUser} className="h-9 w-9 rounded-full border border-neutral-700" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-900 bg-green-500" />
              </div>
              <div>
                <p className="text-sm font-semibold capitalize text-white">{activeUser}</p>
                <p className="text-[11px] text-gray-500">
                  {isOtherUserTyping ? (
                    <span className="flex items-center gap-1 text-green-400">
                      typing <TypingDots />
                    </span>
                  ) : (
                    'Online'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <button className="rounded-lg p-2 transition hover:bg-white/5 hover:text-green-400" title="Voice call">
                <PhoneIcon className="h-5 w-5" />
              </button>
              <button className="rounded-lg p-2 transition hover:bg-white/5 hover:text-green-400" title="Video call">
                <VideoCameraIcon className="h-5 w-5" />
              </button>
              <button onClick={onClose} className="rounded-lg p-2 transition hover:bg-white/5 hover:text-red-400" title="Close chat">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </header>

          {/* Messages */}
          <div ref={chatWindowRef} className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {Array.isArray(messages) && messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No messages yet. Say hello!
              </div>
            )}
            {Array.isArray(messages) && messages.map((msg, idx) => {
              const isMine = msg.user === currentUser;
              return (
                <div key={msg.id ?? idx} className={`group flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className="relative max-w-[65%]">
                    {!isMine && (
                      <button
                        type="button"
                        onClick={() => openReportDialog(msg)}
                        className="absolute -right-2 -top-2 rounded-full border border-red-500/30 bg-neutral-950 px-2 py-1 text-[10px] font-medium text-red-300 opacity-0 shadow-lg transition hover:bg-red-500/10 group-hover:opacity-100"
                        title="Report message"
                      >
                        <span className="flex items-center gap-1">
                          <FlagIcon className="h-3 w-3" />
                          Report
                        </span>
                      </button>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                        isMine
                          ? 'bg-green-500 text-black shadow-[0_0_12px_rgba(34,197,94,.15)] rounded-br-md'
                          : 'bg-neutral-800/80 text-gray-200 border border-neutral-700/60 rounded-bl-md'
                      }`}
                    >
                      <p className="leading-relaxed">{msg.text}</p>
                      <p className={`mt-1 text-right text-[10px] ${isMine ? 'text-black/60' : 'text-gray-500'}`}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {isOtherUserTyping && (
              <div className="flex justify-start">
                <span className="rounded-2xl rounded-bl-md border border-neutral-700/60 bg-neutral-800/60 px-4 py-2 text-xs text-gray-400">
                  typing<TypingDots />
                </span>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="flex items-center gap-3 border-t border-neutral-800/60 px-5 py-4">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Message ${activeUser}…`}
              disabled={!activeUser}
              className="flex-1 rounded-full border border-neutral-700/60 bg-neutral-800/60 px-5 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition focus:border-green-500/40 focus:ring-2 focus:ring-green-500/15 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={!activeUser || !newMessage.trim()}
              className="group grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green-500 text-black shadow-md transition-all duration-200 hover:bg-green-400 hover:shadow-[0_0_14px_rgba(34,197,94,.35)] disabled:opacity-30 disabled:hover:shadow-md"
            >
              <PaperAirplaneIcon className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </form>
        </section>
      </div>
    </div>
    </>
  );
}
