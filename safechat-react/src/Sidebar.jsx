// src/Sidebar.jsx
import { BellIcon, ChatBubbleOvalLeftEllipsisIcon, HomeIcon, UserIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
// NO Logo.jsx import

// 1. Accept new props for navigation
export default function Sidebar({ 
  onShowNotifications, 
  onShowChat, 
  onNavigateToHome, 
  onNavigateToProfile,
  onNavigateToFriends
}) {

  const navItems = [
    // 2. Connect the correct onClick functions
    { name: 'Home', icon: HomeIcon, onClick: onNavigateToHome },
    { name: 'Notifications', icon: BellIcon, onClick: onShowNotifications },
    { name: 'Messages', icon: ChatBubbleOvalLeftEllipsisIcon, onClick: onShowChat },
    { name: 'Find Friends', icon: MagnifyingGlassIcon, onClick: onNavigateToFriends },
    // 3. Connect the correct onClick functions
    { name: 'Profile', icon: UserIcon, onClick: onNavigateToProfile },
  ];

  return (
    // 4. Black and Green Theme
    <div className="flex h-full flex-col p-4 bg-neutral-900 border-r border-neutral-700">
      
      {/* 5. Removed Logo.jsx, using text with green accent */}
      <h1 className="mb-8 text-3xl font-bold text-green-500">
        SafeChat
      </h1>
      
      <nav className="flex flex-col space-y-2">
        {navItems.map((item) => (
          <button
            key={item.name}
            onClick={item.onClick}
            // 6. Black and Green Theme for buttons
            className="flex items-center gap-4 rounded-full p-3 text-xl text-gray-200 transition-colors hover:bg-neutral-800 hover:text-green-500"
          >
            <item.icon className="h-7 w-7" />
            <span>{item.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

