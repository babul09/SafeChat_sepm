// src/NotificationsPanel.jsx

// 1. Receive the 'notifications' list as a prop
export default function NotificationsPanel({ onClose, notifications }) {

    // 2. Define the colors for our new 'like' type
    const typeClasses = {
        warning: 'bg-yellow-900/50 text-yellow-300',
        like: 'bg-pink-900/50 text-pink-300', // Using pink for likes
        comment: 'bg-blue-900/50 text-blue-300',
        message: 'bg-emerald-900/50 text-emerald-300',
    };

    return (
        // Dark overlay
        <div className="fixed inset-0 z-40" onClick={onClose}>
            {/* Dark panel */}
            <div
                className="absolute top-16 right-4 w-80 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700 z-50"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-neutral-700 flex justify-between items-center">
                    <h3 className="font-bold text-white">Notifications</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                <div className="flex flex-col max-h-96 overflow-y-auto">
                    
                    {/* 3. Map over the LIVE 'notifications' prop instead of dummy data */}
                    {Array.isArray(notifications) && notifications.length > 0 ? (
                        notifications.map((note) => (
                            <div key={note.id} className={`p-4 border-b border-neutral-700 text-sm ${typeClasses[note.type] || 'bg-gray-700'}`}>
                                {note.user ? <strong className="font-semibold capitalize mr-1">{note.user}</strong> : ''}
                                {note.text}
                            </div>
                        ))
                    ) : (
                        // Show this message if the list is empty
                        <p className="p-4 text-center text-gray-500">No new notifications.</p>
                    )}
                    
                </div>
            </div>
        </div>
    );
}