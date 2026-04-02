import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { CameraIcon, CheckCircleIcon, PencilIcon, XMarkIcon } from '@heroicons/react/24/outline';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const api = {
  changeProfilePicture: async (userId, imageUrl, currentBio = '') => {
    const res = await fetch(`${API_BASE_URL}/update_profile/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: currentBio, profile_image_url: imageUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to change profile picture');
    return data;
  },
  updateBio: async (userId, newBio, currentProfileImageUrl = null) => {
    const res = await fetch(`${API_BASE_URL}/update_profile/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: newBio, profile_image_url: currentProfileImageUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to update bio');
    return data;
  },
  getProfile: async (userId) => {
    const res = await fetch(`${API_BASE_URL}/get_profile/${encodeURIComponent(userId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to fetch profile');
    return data;
  },
};

/* ── Avatar with skeleton fallback ── */
function Avatar({ url, username, size = 'lg' }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const sizeClasses = size === 'xl' ? 'h-28 w-28' : 'h-24 w-24';

  return (
    <div className={`relative ${sizeClasses}`}>
      {!imgLoaded && (
        <div className="absolute inset-0 animate-pulse rounded-full bg-neutral-800" />
      )}
      <img
        src={url || `https://i.pravatar.cc/150?u=${username}`}
        alt={username}
        onLoad={() => setImgLoaded(true)}
        className={`relative z-10 h-full w-full rounded-full border-2 border-neutral-700 object-cover shadow-lg transition-all duration-300 ${
          imgLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          boxShadow: '0 0 30px rgba(34,197,94,.15), 0 4px 20px rgba(0,0,0,.4)',
        }}
      />
      <span className="absolute right-0 bottom-1 z-20 h-4 w-4 rounded-full border-[3px] border-neutral-900 bg-green-500 shadow" />
    </div>
  );
}

/* ── Feedback toast (success / error) ── */
function FeedbackToast({ message, type, onDismiss }) {
  if (!message) return null;
  const color = type === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-green-500/10 text-green-400 border-green-500/30';
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${color}`}>
      {type === 'success' && <CheckCircleIcon className="h-4 w-4 shrink-0" />}
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ProfilePage({
  user,
  onNavigateToHome,
  onShowNotifications,
  onShowChat,
  onNavigateToFriends,
  onLogout,
  showNotification,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Avatar state
  const [avatarInput, setAvatarInput] = useState('');
  const [changingAvatar, setChangingAvatar] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState(null);

  // Bio state
  const [bioInput, setBioInput] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [bioFeedback, setBioFeedback] = useState(null);

  /* ── Fetch profile on mount ── */
  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const data = await api.getProfile(user);
        if (!cancelled) {
          setProfile(data);
          setBioInput(data.bio || '');
        }
      } catch (e) {
        console.error('Profile fetch failed:', e);
        if (!cancelled) {
          setProfile({ username: user, bio: '', profile_image_url: null });
          setBioInput('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, [user]);

  /* ── Change profile picture ── */
  const handleChangePicture = async (e) => {
    e.preventDefault();
    if (!avatarInput.trim()) return;
    setChangingAvatar(true);
    setAvatarFeedback(null);
    try {
      const result = await api.changeProfilePicture(user, avatarInput, profile?.bio || '');
      setProfile((prev) => prev ? { ...prev, profile_image_url: result.profile_image_url || avatarInput } : prev);
      setAvatarFeedback({ message: 'Profile picture updated!', type: 'success' });
      setAvatarInput('');
      setTimeout(() => setAvatarFeedback(null), 3000);
    } catch (e) {
      setAvatarFeedback({ message: e.message || 'Could not change picture.', type: 'error' });
    } finally {
      setChangingAvatar(false);
    }
  };

  /* ── Update bio ── */
  const handleUpdateBio = async (e) => {
    e.preventDefault();
    setSavingBio(true);
    setBioFeedback(null);
    try {
      await api.updateBio(user, bioInput, profile?.profile_image_url || null);
      setProfile((prev) => prev ? { ...prev, bio: bioInput } : prev);
      setBioFeedback({ message: 'Bio updated!', type: 'success' });
      setEditingBio(false);
      setTimeout(() => setBioFeedback(null), 3000);
    } catch (e) {
      setBioFeedback({ message: e.message || 'Could not update bio.', type: 'error' });
    } finally {
      setSavingBio(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-neutral-950 text-gray-200">
      <div className="mx-auto flex max-w-7xl">

        {/* ── LEFT: Sidebar ── */}
        <aside className="sticky top-0 h-screen w-1/4">
          <Sidebar
            activePage="Profile"
            onShowNotifications={onShowNotifications}
            onShowChat={onShowChat}
            onNavigateToHome={onNavigateToHome}
            onNavigateToProfile={onNavigateToHome}
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
        <main className="flex min-h-screen flex-1 flex-col border-l border-neutral-800/60 bg-neutral-900/20">
          <div className="px-6 pt-8 pb-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">Your Profile</h2>
            <p className="mt-1 text-sm text-gray-500">Manage your avatar and bio.</p>
          </div>

          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="animate-pulse space-y-8 text-center">
                <div className="mx-auto h-28 w-28 rounded-full bg-neutral-800" />
                <div className="mx-auto h-5 w-32 rounded bg-neutral-800" />
                <div className="mx-auto h-4 w-48 rounded bg-neutral-800" />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="mx-auto max-w-xl space-y-8">

                {/* ── Avatar Section ── */}
                <section className="rounded-2xl border border-neutral-800/70 bg-neutral-900/40 p-6 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                    <Avatar url={profile?.profile_image_url} username={user} size="xl" />
                    <div className="flex-1 text-center sm:text-left">
                      <h3 className="text-lg font-semibold capitalize text-white">{user}</h3>
                      <p className="text-sm text-gray-500">Username</p>
                      <form onSubmit={handleChangePicture} className="mt-4 flex flex-col gap-2">
                        <input
                          type="text"
                          value={avatarInput}
                          onChange={(e) => setAvatarInput(e.target.value)}
                          placeholder="Paste image URL…"
                          className="w-full rounded-lg border border-neutral-700/60 bg-neutral-800/50 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition focus:border-green-500/40 focus:ring-1 focus:ring-green-500/20"
                        />
                        <button
                          type="submit"
                          disabled={changingAvatar || !avatarInput.trim()}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 ring-1 ring-green-500/20 transition-all duration-200 hover:bg-green-500 hover:text-black hover:ring-transparent disabled:opacity-40"
                        >
                          <CameraIcon className="h-4 w-4" />
                          {changingAvatar ? 'Saving…' : 'Update Picture'}
                        </button>
                      </form>
                      <FeedbackToast message={avatarFeedback?.message} type={avatarFeedback?.type} onDismiss={() => setAvatarFeedback(null)} />
                    </div>
                  </div>
                </section>

                {/* ── Bio Section ── */}
                <section className="rounded-2xl border border-neutral-800/70 bg-neutral-900/40 p-6 backdrop-blur-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Bio</h3>
                    {!editingBio && (
                      <button
                        onClick={() => setEditingBio(true)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-green-400 transition hover:bg-green-500/10"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    )}
                  </div>

                  {editingBio ? (
                    <form onSubmit={handleUpdateBio} className="space-y-3">
                      <textarea
                        value={bioInput}
                        onChange={(e) => setBioInput(e.target.value)}
                        rows={3}
                        maxLength={200}
                        placeholder="Tell others about yourself…"
                        className="w-full rounded-lg border border-neutral-700/60 bg-neutral-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none resize-none transition focus:border-green-500/40 focus:ring-1 focus:ring-green-500/20"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{bioInput.length}/200</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingBio(false); setBioInput(profile?.bio || ''); setBioFeedback(null); }}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition hover:bg-white/5"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={savingBio || bioInput === profile?.bio}
                            className="rounded-lg bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 ring-1 ring-green-500/20 transition-all duration-200 hover:bg-green-500 hover:text-black hover:ring-transparent disabled:opacity-40"
                          >
                            {savingBio ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                      <FeedbackToast message={bioFeedback?.message} type={bioFeedback?.type} onDismiss={() => setBioFeedback(null)} />
                    </form>
                  ) : (
                    <div className="rounded-lg border border-neutral-800/40 bg-neutral-900/30 px-4 py-3">
                      <p className="text-sm leading-relaxed text-gray-300">
                        {profile?.bio ? profile.bio : <span className="text-gray-500 italic">No bio yet. Click Edit to add one.</span>}
                      </p>
                    </div>
                  )}
                </section>

                {/* ── Stats / Info ── */}
                <section className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Messages', value: '—' },
                    { label: 'Friends', value: '—' },
                    { label: 'Status', value: 'Online' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-neutral-800/70 bg-neutral-900/40 px-4 py-5 text-center backdrop-blur-sm">
                      <p className="text-lg font-bold text-white">{stat.value}</p>
                      <p className="mt-1 text-xs uppercase tracking-wider text-gray-500">{stat.label}</p>
                    </div>
                  ))}
                </section>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
