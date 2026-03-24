import { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';

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

  return (
    <div className="relative min-h-screen text-gray-200 bg-neutral-950">
      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-0 h-screen w-1/4">
          <Sidebar
            onShowNotifications={() => showNotification('Open Notifications from Home page.')}
            onShowChat={() => showNotification('Open Messages from Home page.')}
            onNavigateToHome={onNavigateToHome}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToFriends={onNavigateToFriends}
          />
          <div className="absolute bottom-4 p-4">
            <button onClick={onLogout} className="flex items-center gap-4 rounded-full p-3 text-lg text-gray-200 transition-all hover:bg-neutral-800 hover:text-green-500">
              <span>Logout <strong>{user}</strong></span>
            </button>
          </div>
        </aside>

        <main className="w-3/4 min-h-screen border-l border-neutral-800 bg-neutral-900 p-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white">Find Friends</h2>
            <p className="text-gray-400 mt-1">Browse registered users and start chatting instantly.</p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 mb-6">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search registered users..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {loading ? (
            <p className="text-gray-400">Loading users...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-gray-500">No registered users found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredUsers.map((item) => (
                <div key={item.username} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={`https://i.pravatar.cc/150?u=${item.username}`} alt={item.username} className="w-12 h-12 rounded-full" />
                    <div>
                      <p className="text-white font-semibold capitalize">{item.username}</p>
                      <p className="text-xs text-gray-500">Registered user</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onStartChat(item.username)}
                    className="rounded-full bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-600"
                  >
                    Message
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
