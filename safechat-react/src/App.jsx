// src/App.jsx
import { useState, useCallback } from 'react';
import HomePage from './HomePage';
import AuthPage from './AuthPage';
import Notification from './Notification';
import ProfilePage from './ProfilePage';
import FindFriendsPage from './FindFriendsPage';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [notification, setNotification] = useState(null); // This is for the pop-up
  const [currentPage, setCurrentPage] = useState('home');
  const [chatTargetUser, setChatTargetUser] = useState(null);
  
  // --- NEW: This is the live list for the "Bell Icon" panel ---
  const [notifications, setNotifications] = useState([]);
  // -----------------------------------------------------------

  const showNotification = useCallback((message, options = {}) => {
    const { type = 'warning', user = null } = options;
    // 1. Show the pop-up (your existing code)
    setNotification(message);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
    
    // 2. NEW: Add this message to the "Bell Icon" list
    const newNotification = {
      id: Date.now(),
      type,
      user,
      text: message 
    };
    // Add the new notification to the top of the list
    setNotifications(prevNotifications => [newNotification, ...prevNotifications]);
  }, []);

  const handleLogin = (username) => {
    setCurrentUser(username);
    setCurrentPage('home');
    setChatTargetUser(null);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setChatTargetUser(null);
  };

  const navigateToHome = (targetUser = null) => {
    setCurrentPage('home');
    setChatTargetUser(targetUser);
  };
  const navigateToProfile = () => setCurrentPage('profile');
  const navigateToFriends = () => setCurrentPage('friends');
  const handleChatTargetConsumed = useCallback(() => setChatTargetUser(null), []);

  // This function decides which main page to render
  const renderPage = () => {
    if (currentPage === 'home') {
      return (
        <HomePage 
          user={currentUser} 
          onLogout={handleLogout} 
          showNotification={showNotification} 
          onNavigateToProfile={navigateToProfile}
          onNavigateToHome={navigateToHome}
          onNavigateToFriends={navigateToFriends}
          notifications={notifications} // <-- 3. Pass the new list down
          setNotifications={setNotifications} // <-- 4. Pass the "setter" function down
          chatTargetUser={chatTargetUser}
          onChatTargetConsumed={handleChatTargetConsumed}
        />
      );
    }
    if (currentPage === 'profile') {
      return (
        <ProfilePage 
          user={currentUser} 
          onLogout={handleLogout} 
          onNavigateHome={navigateToHome}
          onNavigateToProfile={navigateToProfile}
          onNavigateToFriends={navigateToFriends}
        />
      );
    }
    if (currentPage === 'friends') {
      return (
        <FindFriendsPage
          user={currentUser}
          onLogout={handleLogout}
          onNavigateToHome={navigateToHome}
          onNavigateToProfile={navigateToProfile}
          onNavigateToFriends={navigateToFriends}
          onStartChat={(username) => navigateToHome(username)}
          showNotification={showNotification}
        />
      );
    }
  };

  return (
    <div>
      {notification && <Notification message={notification} onClose={() => setNotification(null)} />}

      {currentUser
        ? renderPage()
        : <AuthPage onLogin={handleLogin} />
      }
    </div>
  );
}

export default App;