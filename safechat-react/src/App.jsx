// src/App.jsx
import { useState, useCallback, useEffect } from 'react';
import HomePage from './HomePage';
import AuthPage from './AuthPage';
import Notification from './Notification';
import ProfilePage from './ProfilePage';
import FindFriendsPage from './FindFriendsPage';
import AdminPanel from './AdminPanel';
import AdminLogin from './AdminLogin';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [notification, setNotification] = useState(null); // This is for the pop-up
  const [currentPage, setCurrentPage] = useState('home');
  const [chatTargetUser, setChatTargetUser] = useState(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [isAdminRoute, setIsAdminRoute] = useState(window.location.pathname === '/admin');
  
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
  const handleAdminLogin = (username) => {
    setAdminAuthenticated(true);
  };
  const handleAdminLogout = () => {
    setAdminAuthenticated(false);
    setIsAdminRoute(false);
    window.history.pushState({}, '', '/');
  };
  const handleChatTargetConsumed = useCallback(() => setChatTargetUser(null), []);

  // Check for admin route on component mount
  useEffect(() => {
    const handlePopState = () => {
      const isAdmin = window.location.pathname === '/admin';
      setIsAdminRoute(isAdmin);
      if (!isAdmin) {
        setAdminAuthenticated(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle /admin route access
  if (isAdminRoute) {
    if (!adminAuthenticated) {
      return (
        <AdminLogin 
          onLoginSuccess={handleAdminLogin}
          onCancel={() => {
            setIsAdminRoute(false);
            window.history.pushState({}, '', '/');
          }}
        />
      );
    }
    return (
      <AdminPanel
        user={currentUser}
        onNavigateToHome={() => setIsAdminRoute(false)}
        onLogout={handleAdminLogout}
        showNotification={showNotification}
      />
    );
  }

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
          notifications={notifications}
          setNotifications={setNotifications}
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