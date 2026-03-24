// src/HomePage.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import ChatPanel from './ChatPanel';
import NotificationsPanel from './NotificationsPanel';
import HeartIcon from './icons/HeartIcon';
import CommentIcon from './icons/CommentIcon';
import ImageIcon from './icons/ImageIcon';
import Sidebar from './Sidebar';
import { TrashIcon } from '@heroicons/react/24/outline';
import { supabase } from './lib/supabaseClient';

// --- API Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const api = {
    getPosts: () => fetch(`${API_BASE_URL}/get_posts`).then(res => res.json()),
    getUsers: (username) => fetch(`${API_BASE_URL}/get_users/${username}`).then(res => res.json()),
    getChatNotifications: (username, since) => {
      const query = since ? `?since=${encodeURIComponent(since)}` : '';
      return fetch(`${API_BASE_URL}/chat_notifications/${username}${query}`).then(res => res.json());
    },
    createPost: (user, text, parent_id = null) => fetch(`${API_BASE_URL}/create_post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, text, parent_id })
    }).then(res => res.json()),
    approvePost: (id) => fetch(`${API_BASE_URL}/approve_post/${id}`, { method: 'POST' }),
    blockPost: (id) => fetch(`${API_BASE_URL}/block_post/${id}`, { method: 'POST' }),
    deletePost: (id) => fetch(`${API_BASE_URL}/delete_post/${id}`, { method: 'POST' })
};
// -------------------------

// 1. Receive 'notifications' and 'setNotifications' from App.jsx
export default function HomePage({ 
  user, 
  onLogout, 
  showNotification, 
  onNavigateToProfile, 
  onNavigateToHome,
  onNavigateToFriends,
  notifications, 
  setNotifications,
  chatTargetUser,
  onChatTargetConsumed
}) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [posts, setPosts] = useState([]);
  const [chatTarget, setChatTarget] = useState(null);
  const [chatRefreshToken, setChatRefreshToken] = useState(0);
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [newPostText, setNewPostText] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);
  const lastNotificationAtRef = useRef(new Date().toISOString());
  const seenMessageIdsRef = useRef(new Set());
  const [commentTexts, setCommentTexts] = useState({});

  // --- Functions ---
  const fetchPosts = useCallback(async () => {
    try {
      const fetchedPosts = await api.getPosts();
      if (Array.isArray(fetchedPosts)) {
        setPosts(fetchedPosts);
      } else { setPosts([]); }
    } catch (error) {
       console.error("Failed to fetch posts:", error);
       setPosts([]);
    }
  }, []);
  useEffect(() => {
    fetchPosts();

    const fetchUsers = async () => {
      try {
        const users = await api.getUsers(user);
        if (Array.isArray(users)) {
          setRegisteredUsers(users);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    };

    const fetchIncomingMessages = async () => {
      try {
        const incoming = await api.getChatNotifications(user, lastNotificationAtRef.current);
        if (!Array.isArray(incoming) || incoming.length === 0) {
          return;
        }

        incoming.forEach((note) => {
          if (seenMessageIdsRef.current.has(note.id)) {
            return;
          }
          seenMessageIdsRef.current.add(note.id);

          const isSameOpenConversation = isChatOpen && chatTarget && note.from_user === chatTarget;
          if (isSameOpenConversation) {
            setChatRefreshToken((prev) => prev + 1);
          } else {
            showNotification(`New message: ${note.text}`, { type: 'message', user: note.from_user });
          }
        });

        const lastIncoming = incoming[incoming.length - 1];
        if (lastIncoming?.created_at) {
          lastNotificationAtRef.current = lastIncoming.created_at;
        }
      } catch (error) {
        console.error('Failed to fetch incoming message notifications:', error);
      }
    };

    fetchUsers();
    fetchIncomingMessages();
    const notificationInterval = setInterval(fetchIncomingMessages, 4000);

    if (!supabase) {
      return () => clearInterval(notificationInterval);
    }

    const channel = supabase
      .channel(`home_updates_${user}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          fetchPosts();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => {
          fetchIncomingMessages();
        }
      )
      .subscribe();

    return () => {
      clearInterval(notificationInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchPosts, user, showNotification, isChatOpen, chatTarget]);

  useEffect(() => {
    if (!chatTargetUser) return;
    setChatTarget(chatTargetUser);
    setIsChatOpen(true);
    if (onChatTargetConsumed) {
      onChatTargetConsumed();
    }
  }, [chatTargetUser, onChatTargetConsumed]);

  // 2. THIS IS THE FIX for the "Like" button
  const handleLike = (postId, postUser) => {
    // Create a new notification message
    const newNotification = {
      id: Date.now(),
      type: 'like', // New type
      text: `${user} liked ${postUser}'s post.` // Create a real message
    };
    // Add it to the live list in App.jsx
    setNotifications(prev => [newNotification, ...prev]);
    // We don't show an alert() anymore
  };

  const handleImageSelect = (event) => {
     const file = event.target.files[0];
     if (file) {
       setSelectedImage(URL.createObjectURL(file));
     }
  };
  const handleCreatePost = async () => {
    if (!newPostText.trim()) { alert("Please add some text to your post."); return; }
    try {
      const response = await api.createPost(user, newPostText);
      if (response.notification) { showNotification(response.notification); }
      setNewPostText("");
      setSelectedImage(null);
      fetchPosts();
    } catch {
      showNotification("Error: Could not create post.");
    }
  };
  const handleAddComment = async (postId, commentText) => {
    if (!commentText || !commentText.trim()) return;
    try {
      const response = await api.createPost(user, commentText, postId);
      if (response.notification) { showNotification(response.notification); }
      setCommentTexts(prev => ({ ...prev, [postId]: '' }));
      fetchPosts();
    } catch {
      showNotification("Error: Could not post comment.");
    }
  };
  const handleApprove = async (postId) => {
    await api.approvePost(postId); fetchPosts();
  };
  const handleBlock = async (postId) => {
    await api.blockPost(postId); fetchPosts();
  };
   const handleDelete = async (postId) => {
    try {
      await api.deletePost(postId);
      fetchPosts();
    } catch {
      showNotification("Error: Could not delete post.");
    }
  };
  // -------------------------

  return (
    // Black & Green Theme
    <div className="relative min-h-screen text-gray-200 bg-neutral-950">
      <div className="mx-auto flex max-w-7xl">
        
        {/* --- LEFT COLUMN: NAVIGATION --- */}
        <aside className="sticky top-0 h-screen w-1/4">
          <Sidebar 
            onShowNotifications={() => setIsNotificationsOpen(true)}
            onShowChat={() => setIsChatOpen(true)}
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
        
        {/* --- MIDDLE COLUMN: FEED --- */}
        <main className="w-1/2 min-h-screen border-x border-neutral-800 bg-neutral-900">
          <div className="p-6">
            <div className="mb-6 rounded-2xl border border-neutral-800 bg-gradient-to-r from-neutral-900 to-neutral-800 p-6">
              <h2 className="text-2xl font-bold text-white">Welcome, {user}</h2>
              <p className="text-gray-400 mt-1">Share updates, reply to comments, and stay connected in real time.</p>
            </div>
            
            {/* --- CREATE POST SECTION --- */}
            <section className="mb-8 rounded-2xl bg-neutral-800 p-6 shadow-md border border-neutral-700">
              <textarea
                value={newPostText}
                onChange={(e) => setNewPostText(e.target.value)}
                placeholder={`What's on your mind, ${user}?`}
                className="w-full resize-none border-b border-neutral-600 bg-transparent p-3 text-lg text-white placeholder-gray-500 focus:outline-none"
              />
              {selectedImage && (
                <div className="mt-4 relative">
                  <img src={selectedImage} alt="Preview" className="w-full rounded-lg" />
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1 leading-none"
                  >
                    &#x2715;
                  </button>
                </div>
              )}
              <div className="mt-4 flex items-center justify-between">
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} className="hidden" />
                <button
                  onClick={() => fileInputRef.current.click()}
                  className="rounded-full p-2 text-gray-400 hover:text-green-500 hover:bg-neutral-700"
                >
                  <ImageIcon />
                </button>
                <button
                  onClick={handleCreatePost}
                  className="rounded-full bg-green-500 px-6 py-2 font-bold text-black transition-all hover:bg-green-600"
                >
                  Post
                </button>
              </div>
            </section>

            {/* --- REALTIME FEED SECTION --- */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">Feed</h2>
              <div className="space-y-6">
                
                {Array.isArray(posts) && posts.filter(post => post.status !== 'blocked').map((post) => (
                  <div key={post.id} className={`rounded-2xl bg-neutral-800 overflow-hidden transition-all border shadow-sm ${post.status === 'pending' ? 'border-yellow-500' : 'border-neutral-700'}`}>
                    <div className="p-6">
                      <div className="mb-4 flex justify-between text-sm text-gray-400">
                        <span className="font-bold text-green-500 capitalize">{post.username}</span>
                        <span>{new Date(post.created_at).toLocaleString()}</span>
                      </div>
                      <p className="mb-4 text-gray-200">{post.text}</p>
                      
                      {post.status === 'pending' && (
                        <div className="flex items-center gap-4 rounded-md bg-yellow-900/50 p-3 mt-4 border border-yellow-700">
                            <p className="text-sm font-semibold text-yellow-300">⚠️ This post is pending approval.</p>
                            <button onClick={() => handleApprove(post.id)} className="ml-auto rounded-md bg-green-600 px-3 py-1 text-sm text-black hover:bg-green-500">Approve</button>
                            <button onClick={() => handleBlock(post.id)} className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500">Block</button>
                        </div>
                      )}

                      <div className="flex gap-6 pt-4 mt-4 text-gray-400 border-t border-neutral-700">
                        {/* 3. Pass post username to handleLike */}
                        <button onClick={() => handleLike(post.id, post.username)} className="flex items-center gap-2 transition-colors hover:text-pink-500">
                          <HeartIcon /> {post.likes || 0}
                        </button>
                        <button className="flex items-center gap-2 transition-colors hover:text-blue-500">
                          <CommentIcon /> {post.comments?.length || 0}
                        </button>
                        {post.username === user && (
                          <button onClick={() => handleDelete(post.id)} className="flex items-center gap-2 ml-auto text-gray-500 transition-colors hover:text-red-600">
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>

                      {/* --- Comments Section --- */}
                      <div className="space-y-3 pt-4 mt-4 border-t border-neutral-700">
                        {Array.isArray(post.comments) && post.comments.filter(comment => comment.status !== 'blocked').map((comment) => (
                          <div key={comment.id} className="text-sm">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="mr-2 font-semibold capitalize text-green-500">{comment.username}</span>
                                <span className="text-gray-300">{comment.text}</span>
                              </div>
                              {comment.status === 'pending' && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-yellow-500">(pending)</span>
                                  <button onClick={() => handleApprove(comment.id)} className="rounded-md bg-green-600 px-2 py-0.5 text-xs text-black hover:bg-green-500">Approve</button>
                                  <button onClick={() => handleBlock(comment.id)} className="rounded-md bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-500">Block</button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* --- Comment Form --- */}
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleAddComment(post.id, commentTexts[post.id] || ''); }}
                        className="flex items-center gap-2 pt-4 mt-4 border-t border-neutral-700"
                      >
                        <input
                          type="text"
                          placeholder="Add a comment..."
                          value={commentTexts[post.id] || ''}
                          onChange={(e) => setCommentTexts(prev => ({ ...prev, [post.id]: e.target.value }))}
                          className="w-full rounded-full bg-neutral-700 border border-neutral-600 px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <button type="submit" className="rounded-full bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-600">
                          Post
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
        
        {/* --- RIGHT COLUMN: WIDGETS --- */}
        <aside className="sticky top-0 h-screen w-1/4 p-6 bg-neutral-900">
          <div className="rounded-2xl bg-neutral-800 shadow-md p-4 border border-neutral-700">
            <h3 className="mb-4 text-lg font-bold text-white">Registered Users</h3>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {registeredUsers.length === 0 ? (
                <p className="text-sm text-gray-500">No users found yet.</p>
              ) : (
                registeredUsers.map((item) => (
                  <div key={item.username} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={`https://i.pravatar.cc/150?u=${item.username}`} alt={item.username} className="h-10 w-10 rounded-full" />
                      <span className="font-semibold text-gray-200 capitalize">{item.username}</span>
                    </div>
                    <button
                      onClick={() => {
                        setChatTarget(item.username);
                        setChatRefreshToken((prev) => prev + 1);
                        setIsChatOpen(true);
                      }}
                      className="rounded-full bg-green-500 px-3 py-1 text-sm font-semibold text-black hover:bg-green-600"
                    >
                      Chat
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* 5. Pass the new 'notifications' list down to the panels */}
      {isChatOpen && (
        <ChatPanel
          onClose={() => setIsChatOpen(false)}
          currentUser={user}
          showNotification={showNotification}
          initialActiveUser={chatTarget}
          refreshToken={chatRefreshToken}
        />
      )}
      {isNotificationsOpen && <NotificationsPanel onClose={() => setIsNotificationsOpen(false)} notifications={notifications} />}
    </div>
  );
}