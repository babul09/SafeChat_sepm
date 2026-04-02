import { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import { MagnifyingGlassIcon, UserGroupIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const api = {
  getUsers: async (username) => {
    const res = await fetch(`${API_BASE_URL}/get_users/${username}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.detail || 'Failed to fetch users');
    }
    return data;
  },
};

/* ── Skeleton loader for a single user card ── */
function UserCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 animate-pulse">
      <div className="h-12 w-12 shrink-0 rounded-full bg-neutral-800" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-24 rounded bg-neutral-800" />
        <div className="h-3 w-16 rounded bg-neutral-800" />
      </div>
      <div className="h-9 w-24 rounded-full bg-neutral-800" />
    </div>
  );
}

/* ── Empty / no-results state ── */
function EmptyState({ query }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 rounded-full bg-green-500/10 p-6">
        <UserGroupIcon className="h-12 w-12 text-green-500/60" />
      </div>
      <p className="text-lg font-semibold text-gray-300">
        {query ? 'No one matches your search' : 'No registered users yet'}
      </p>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        {query
          ? `No users found for "${query}". Try a different name.`
          : 'When more people join SafeChat they\'ll appear here.'}
      </p>
    </div>
  );
}

export default function FindFriendsPage({
  user,
  onLogout,
  onNavigateToHome,
  onNavigateToProfile,
  onNavigateToFriends,
  onStartChat,
  showNotification,
}) {
  const [users, setUsers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const list = await api.getUsers(user);
        setUsers(Array.isArray(list) ? list : []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        showNotification('Could not load registered users.');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [user, showNotification]);

  const filteredUsers = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return users;
    return users.filter((item) => item.username?.toLowerCase().includes(query));
  }, [searchText, users]);

  const query = searchText.trim();

  return (
    <div className="relative min-h-screen text-gray-200 bg-neutral-950">
      <div className="mx-auto flex max-w-7xl">

        {/* ── LEFT: Sidebar ── */}
        <aside className="sticky top-0 h-screen w-1/4">
          <Sidebar
            activePage="Find Friends"
            onShowNotifications={() => showNotification('Open Notifications from Home page.')}
            onShowChat={() => showNotification('Open Messages from Home page.')}
            onNavigateToHome={onNavigateToHome}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToFriends={onNavigateToFriends}
          />
          <div className="absolute bottom-4 left-0 w-full px-3">
            <button
              onClick={onLogout}
              className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-red-500/10 hover:text-red-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              <span>Logout <strong className="text-gray-300">{user}</strong></span>
            </button>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="flex min-h-screen flex-1 flex-col border-l border-neutral-800/60 bg-neutral-900/30">
          {/* Header */}
          <div className="px-6 pt-8 pb-4">
            <h2 className="text-2xl font-bold tracking-tight text-white">Find Friends</h2>
            <p className="mt-1 text-sm text-gray-500">Browse registered users and start chatting instantly.</p>
          </div>

          {/* Search */}
          <div className="px-6 pb-4">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 transition-colors peer-focus:text-green-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by username…"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900/70 py-3 pl-11 pr-4 text-sm text-white placeholder-gray-500 outline-none transition-all duration-200 focus:border-green-500/50 focus:ring-2 focus:ring-green-500/20"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="mx-6 h-px bg-neutral-800/60" />

          {/* List */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <UserCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filteredUsers.map((item, idx) => (
                  <div
                    key={item.username}
                    className="group flex items-center gap-4 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4 backdrop-blur-sm transition-all duration-200 hover:border-green-500/30 hover:bg-neutral-900/80 hover:shadow-[0_0_20px_rgba(34,197,94,.06)]"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div className="relative">
                      <img
                        src={`https://i.pravatar.cc/150?u=${item.username}`}
                        alt={item.username}
                        className="h-12 w-12 rounded-full border-2 border-neutral-700 transition-colors group-hover:border-green-500/40"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-900 bg-green-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold capitalize text-white">{item.username}</p>
                      <p className="text-xs text-gray-500">Registered user</p>
                    </div>
                    <button
                      onClick={() => onStartChat(item.username)}
                      className="shrink-0 rounded-full bg-green-500/10 px-4 py-2 text-xs font-semibold text-green-400 ring-1 ring-green-500/20 transition-all duration-200 hover:bg-green-500 hover:text-black hover:ring-transparent hover:shadow-[0_0_14px_rgba(34,197,94,.4)]"
                    >
                      <span className="flex items-center gap-1.5">
                        <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
                        Message
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
