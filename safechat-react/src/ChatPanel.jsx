// src/ChatPanel.jsx
import { useState, useEffect, useRef, useCallback } from 'react'; // <-- 1. ADD useRef
import { PhoneIcon, VideoCameraIcon } from '@heroicons/react/24/outline';

// --- API Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const api = {
    // NEW: API now requires the username to fetch the correct feed
    getMessages: (username) => fetch(`${API_BASE_URL}/get_feed/${username}`).then(res => res.json()),
    
    // NEW: API now requires a "receiver_username"
    sendMessage: (senderUser, receiverUser, text) => fetch(`${API_BASE_URL}/send_message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: senderUser, receiver_username: receiverUser, text: text })
    }).then(res => res.json())
};

export default function ChatPanel({ onClose, currentUser, showNotification }) {
  // We'll keep 'Dana' as the hardcoded chat partner for now
  const activeUser = "Dana"; 
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState([]);
  
  // --- 2. ADD A ref FOR THE CHAT WINDOW ---
  const chatWindowRef = useRef(null);
  // ------------------------------------

  // --- 3. NEW AUTO-SCROLL FUNCTION ---
  const scrollToBottom = () => {
    if (chatWindowRef.current) {
      // Use smooth scroll for a nice effect
      chatWindowRef.current.scrollTo({
        top: chatWindowRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };
  // ---------------------------------

  // --- Functions ---
  const fetchMessages = useCallback(async () => {
    if (!currentUser) return; // Don't fetch if user isn't set yet
    try {
      // NEW: Pass the current user's name to fetch their messages
      const fetchedMessages = await api.getMessages(currentUser);
      if (Array.isArray(fetchedMessages)) {
        setMessages(fetchedMessages);
      }
    } catch (error) { 
      console.error("Failed to fetch messages:", error); 
    }
  }, [currentUser]);

  useEffect(() => {
    fetchMessages(); // Fetch messages when component loads
    const interval = setInterval(fetchMessages, 3000); // Refresh every 3 seconds
    return () => clearInterval(interval); // Cleanup timer
  }, [fetchMessages]); // Re-run if the user changes

  // --- 4. UPDATE useEffect TO SCROLL ---
  // This scrolls when messages load or new messages are added
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  // -----------------------------------

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    try {
      // NEW: Send message from currentUser to activeUser
      const response = await api.sendMessage(currentUser, activeUser, newMessage);
      if (response.notification) {
        showNotification(response.notification);
      }
      setNewMessage('');
      fetchMessages(); // This will trigger the useEffect to scroll
    } catch (error) {
      console.error("Failed to send message:", error);
      showNotification("Error: Could not send message.");
    }
  };

  return (
    // Simple slide-out panel (Black & Green Theme)
    <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose}>
      <div
        className="fixed top-0 right-0 h-full w-full max-w-md flex flex-col bg-neutral-800 shadow-2xl border-l border-neutral-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chat Header */}
        <header className="flex items-center justify-between p-4 border-b border-neutral-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src={`https://i.pravatar.cc/150?u=${activeUser}`} alt={activeUser} className="w-10 h-10 rounded-full" />
            <span className="text-lg font-bold text-white capitalize">{activeUser}</span>
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
        
        {/* --- 5. ADD THE ref TO THE MESSAGES WINDOW --- */}
        <div ref={chatWindowRef} className="flex-grow p-4 space-y-4 overflow-y-auto bg-neutral-900">
          {Array.isArray(messages) && messages.map((msg, index) => (
            <div key={index} className={`flex items-end gap-2 ${msg.user === currentUser ? 'justify-end' : 'justify-start'}`}>
              {/* Show avatar only for other users */}
              {msg.user !== currentUser && <img src={`https://i.pravatar.cc/150?u=${msg.user}`} alt={msg.user} className="w-8 h-8 rounded-full" />}
              {/* Chat Bubble with the correct Green accent */}
              <p className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${msg.user === currentUser ? 'bg-green-600 text-black' : 'bg-neutral-700 text-gray-200'}`}>
                {msg.text}
              </p>
            </div>
          ))}
        </div>
        
        {/* Message Input */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-neutral-700 flex gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Message ${activeUser}...`}
            className="w-full px-4 py-3 text-white bg-neutral-700 border border-neutral-600 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-500"
          />
          <button type="submit" className="rounded-full bg-green-500 p-3 text-black transition-colors hover:bg-green-600">
            {/* Send Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
              <path d="M3.105 3.105a.75.75 0 01.056 1.053l4.354 5.216-5.216 4.354a.75.75 0 01-1.109-1.002l5.002-5.998-5.998 5.001a.75.75 0 01-1.002-1.109l4.354-5.216-5.216-4.354a.75.75 0 011.053-.056l5.998 5.002L3.105 3.105zM16.25 10a.75.75 0 01-.75.75H8.75a.75.75 0 010-1.5h6.75a.75.75 0 01.75.75z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}