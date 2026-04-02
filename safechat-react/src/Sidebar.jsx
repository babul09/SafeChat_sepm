// src/Sidebar.jsx
import { BellIcon, ChatBubbleOvalLeftEllipsisIcon, HomeIcon, UserIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

/* ────────────────────────────────────────────────────────────
   Sidebar ── polished nav rail
   Props: onShowNotifications, onShowChat, onNavigateToHome,
          onNavigateToProfile, onNavigateToFriends
   ──────────────────────────────────────────────────────────── */

const NAV_ROUTES = ['Home', 'Profile', 'Find Friends'];

export default function Sidebar({
  onShowNotifications,
  onShowChat,
  onNavigateToHome,
  onNavigateToProfile,
  onNavigateToFriends,
  activePage = 'Home',        // optional: highlight the current page
}) {
  const [active, setActive] = useState(activePage);

  const handleNav = (item, onClick) => {
    setActive(item);
    onClick?.();
  };

  const navItems = [
    { name: 'Home',             icon: HomeIcon,                  onClick: onNavigateToHome },
    { name: 'Notifications',    icon: BellIcon,                  onClick: onShowNotifications },
    { name: 'Messages',         icon: ChatBubbleOvalLeftEllipsisIcon, onClick: onShowChat },
    { name: 'Find Friends',     icon: MagnifyingGlassIcon,       onClick: onNavigateToFriends },
    { name: 'Profile',          icon: UserIcon,                  onClick: onNavigateToProfile },
  ];

  return (
    <div className="relative flex h-full w-full flex-col gap-8 bg-black/60 backdrop-blur-md">
      {/* ── Brand ── */}
      <div className="px-4 pt-6">
        <h1 className="bg-gradient-to-r from-green-400 to-emerald-600 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent drop-shadow-[0_0_8px_rgba(34,197,94,.45)]">
          SafeChat
        </h1>
        <div className="mt-2 h-px w-20 rounded-full bg-gradient-to-r from-green-500/60 to-transparent" />
      </div>

      {/* ── Nav ── */}
      <nav className="flex flex-col gap-1 px-3" role="navigation">
        {navItems.map((item) => {
          const isActive = active === item.name;
          const isMain = NAV_ROUTES.includes(item.name);
          return (
            <button
              key={item.name}
              onClick={() => handleNav(item.name, item.onClick)}
              className={[
                'group flex items-center gap-4 rounded-xl px-4 py-3 text-[15px] font-medium transition-all duration-200',
                isActive
                  ? 'bg-green-500/10 text-green-400 shadow-[inset_2px_0_0_0_rgba(34,197,94,.7)]'
                  : 'text-gray-400 hover:bg-white/[.06] hover:text-green-300',
                'before:absolute before:inset-0 before:rounded-xl before:bg-white/[.02] before:opacity-0 before:transition-opacity before:duration-200 before:group-hover:before:opacity-100',
                'relative overflow-hidden',
              ].filter(Boolean).join(' ')}
              title={item.name}
            >
              {/* subtle glow behind icon */}
              <span
                className={[
                  'absolute -left-1 h-8 w-8 rounded-full blur transition-all duration-300',
                  isActive ? 'bg-green-500/20 opacity-100' : 'opacity-0 group-hover:bg-green-400/10',
                ].join(' ')}
              />
              <item.icon
                className={[
                  'relative z-10 h-6 w-6 transition-colors duration-200',
                  isActive ? 'text-green-400' : 'text-gray-500 group-hover:text-green-400',
                ].join(' ')}
              />
              <span className="relative z-10">{item.name}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Bottom divider ── */}
      <div className="mt-auto px-4 pb-6">
        <div className="h-px w-full rounded-full bg-gradient-to-r from-transparent to-green-500/20" />
      </div>
    </div>
  );
}

