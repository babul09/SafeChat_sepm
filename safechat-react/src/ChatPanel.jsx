import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PhoneIcon, VideoCameraIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { supabase } from './lib/supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const api = {
  getMessages: async (username, otherUsername) => {
    const res = await fetch(`${API_BASE_URL}/get_feed/${username}?other_username=${encodeURIComponent(otherUsername)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.detail || 'Failed to fetch messages');
    }
    return data;
  },

  getUsers: async (username) => {
    const res = await fetch(`${API_BASE_URL}/get_users/${username}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.detail || 'Failed to fetch users');
    }
    return data;
  },

  sendMessage: async (senderUser, receiverUser, text) => {
    const res = await fetch(`${API_BASE_URL}/send_message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: senderUser, receiver_username: receiverUser, text }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.detail || 'Failed to send message');
    }
    return data;
  },
};

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
    if (!chatWindowRef.current) return;
    chatWindowRef.current.scrollTo({
      top: chatWindowRef.current.scrollHeight,
      behavior: 'auto',
    });
  };

  const fetchMessages = useCallback(async () => {
    if (!currentUser || !activeUser) return;
    if (isFetchingMessagesRef.current) return;

    isFetchingMessagesRef.current = true;
    try {
      const fetchedMessages = await api.getMessages(currentUser, activeUser);
      if (Array.isArray(fetchedMessages)) {
        setMessages(fetchedMessages);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      isFetchingMessagesRef.current = false;
    }
  }, [currentUser, activeUser]);

  const scheduleFetchMessages = useCallback(() => {
    if (messageRefreshTimeoutRef.current) {
      return;
    }

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
        await channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            from: currentUser,
            to: activeUser,
            isTyping,
            at: Date.now(),
          },
        });
        isTypingBroadcastedRef.current = isTyping;
      } catch (error) {
        console.error('Failed to broadcast typing event:', error);
      }
    },
    [currentUser, activeUser]
  );

  const fetchUsers = useCallback(async () => {
    if (!currentUser) return;
    try {
      const users = await api.getUsers(currentUser);
      if (!Array.isArray(users)) return;

      const userList = users.map((item) => item.username).filter(Boolean);
      setAvailableUsers(userList);

      setActiveUser((prev) => {
        if (initialActiveUser && userList.includes(initialActiveUser)) {
          return initialActiveUser;
        }
        if (prev && userList.includes(prev)) {
          return prev;
        }
        return userList[0] || '';
      });
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, [currentUser, initialActiveUser]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchMessages();

    if (!supabase || !currentUser) {
      return;
    }

    const channel = supabase
      .channel(`chat_messages_feed_${currentUser}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
        scheduleFetchMessages();
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload) return;
        const matchesCurrentConversation = payload.from === activeUser && payload.to === currentUser;
        if (matchesCurrentConversation) {
          setIsOtherUserTyping(Boolean(payload.isTyping));
        }
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      typingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [currentUser, activeUser, fetchMessages, scheduleFetchMessages]);

  useEffect(() => {
    if (!activeUser) {
      setIsOtherUserTyping(false);
      return;
    }

    if (!newMessage.trim()) {
      if (isTypingBroadcastedRef.current) {
        sendTypingEvent(false);
      }
      return;
    }

    if (!isTypingBroadcastedRef.current) {
      sendTypingEvent(true);
    }

    if (typingBroadcastTimeoutRef.current) {
      clearTimeout(typingBroadcastTimeoutRef.current);
    }

    typingBroadcastTimeoutRef.current = setTimeout(() => {
      sendTypingEvent(false);
    }, 1200);

    return () => {
      if (typingBroadcastTimeoutRef.current) {
        clearTimeout(typingBroadcastTimeoutRef.current);
      }
    };
  }, [newMessage, activeUser, sendTypingEvent]);

  useEffect(() => {
    return () => {
      if (typingBroadcastTimeoutRef.current) {
        clearTimeout(typingBroadcastTimeoutRef.current);
      }
      if (messageRefreshTimeoutRef.current) {
        clearTimeout(messageRefreshTimeoutRef.current);
      }
      if (isTypingBroadcastedRef.current) {
        sendTypingEvent(false);
      }
    };
  }, [sendTypingEvent]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setIsOtherUserTyping(false);
  }, [activeUser]);

  useEffect(() => {
    if (!refreshToken) return;
    scheduleFetchMessages();
  }, [refreshToken, scheduleFetchMessages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeUser) return;

    try {
      const response = await api.sendMessage(currentUser, activeUser, newMessage);
      if (response.notification) {
        showNotification(response.notification);
      }
      if (Array.isArray(response.messages)) {
        setMessages(response.messages);
      }
      setNewMessage('');
      if (isTypingBroadcastedRef.current) {
        sendTypingEvent(false);
      }
      scheduleFetchMessages();
    } catch (error) {
      console.error('Failed to send message:', error);
      showNotification(`Error: ${error.message || 'Could not send message.'}`);
    }
  };

  const formatMessageTime = (value) => {
    if (!value) return '';
    try {
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (!availableUsers.length) {
    return (
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose}>
        <div
          className="fixed top-0 right-0 h-full w-full max-w-md flex flex-col bg-neutral-900 shadow-2xl border-l border-neutral-700 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white text-xl font-bold">Messages</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
          </div>
          <p className="text-gray-400">No registered users found to chat with yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose}>
      <div
        className="fixed top-0 right-0 h-full w-full max-w-5xl flex bg-neutral-900 shadow-2xl border-l border-neutral-700"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="w-72 border-r border-neutral-800 bg-neutral-950 flex flex-col">
          <div className="p-4 border-b border-neutral-800">
            <h3 className="text-white font-bold text-lg">Messages</h3>
            <div className="mt-3 relative">
              <MagnifyingGlassIcon className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search chats"
                className="w-full rounded-full bg-neutral-800 border border-neutral-700 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredUsers.map((username) => (
              <button
                key={username}
                onClick={() => setActiveUser(username)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-neutral-900 text-left transition-colors ${
                  activeUser === username ? 'bg-neutral-800' : 'hover:bg-neutral-900'
                }`}
              >
                <img src={`https://i.pravatar.cc/150?u=${username}`} alt={username} className="w-10 h-10 rounded-full" />
                <div>
                  <p className="text-white font-semibold capitalize">{username}</p>
                  <p className="text-xs text-gray-500">Tap to open conversation</p>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex-1 flex flex-col bg-neutral-900">
          <header className="flex items-center justify-between p-4 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <img src={`https://i.pravatar.cc/150?u=${activeUser}`} alt={activeUser} className="w-10 h-10 rounded-full" />
              <div>
                <p className="text-white font-semibold capitalize">{activeUser}</p>
                <p className="text-xs text-gray-400">{isOtherUserTyping ? 'typing...' : 'online'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-gray-400">
              <PhoneIcon className="h-6 w-6 cursor-pointer transition-colors hover:text-green-500" />
              <VideoCameraIcon className="h-6 w-6 cursor-pointer transition-colors hover:text-green-500" />
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          <div ref={chatWindowRef} className="flex-grow p-5 space-y-4 overflow-y-auto bg-neutral-900">
            {Array.isArray(messages) && messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.user === currentUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-md rounded-2xl px-4 py-2 ${
                    msg.user === currentUser
                      ? 'bg-green-500 text-black rounded-br-sm'
                      : 'bg-neutral-800 text-gray-200 rounded-bl-sm border border-neutral-700'
                  }`}
                >
                  <p className="text-sm">{msg.text}</p>
                  <p className={`mt-1 text-[11px] ${msg.user === currentUser ? 'text-black/70' : 'text-gray-500'}`}>
                    {formatMessageTime(msg.created_at)}
                  </p>
                </div>
              </div>
            ))}

            {isOtherUserTyping && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm px-4 py-2 bg-neutral-800 border border-neutral-700 text-gray-300 text-sm">
                  {activeUser} is typing...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t border-neutral-800 flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Message ${activeUser}...`}
              disabled={!activeUser}
              className="w-full px-4 py-3 text-white bg-neutral-800 border border-neutral-700 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={!activeUser}
              className="rounded-full bg-green-500 px-5 py-3 text-black font-semibold transition-colors hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
