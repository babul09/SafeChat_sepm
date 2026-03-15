// src/ProfilePage.jsx
import { useState, useRef, useEffect } from 'react';
import { UserCircleIcon, CameraIcon } from '@heroicons/react/24/outline';
import Sidebar from './Sidebar'; // We need the sidebar for the layout

// --- API Configuration for Profile ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const api = {
    getProfile: (username) => fetch(`${API_BASE_URL}/get_profile/${username}`).then(res => res.json()),
    
    // NEW: API function to upload the actual file
    uploadImage: (username, fileData) => fetch(`${API_BASE_URL}/upload_image/${username}`, {
        method: 'POST',
        body: fileData // Note: Not JSON, we send FormData
    }).then(res => res.json()),

    // API function to save the text data and new image URL
    updateProfile: (username, profileData) => fetch(`${API_BASE_URL}/update_profile/${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
    }).then(res => res.json())
};
// -----------------------------------------

export default function ProfilePage({ user, onLogout, onNavigateHome, onNavigateToProfile }) { 
  const [bio, setBio] = useState(""); 
  const [email, setEmail] = useState(""); 
  const [profileImagePreview, setProfileImagePreview] = useState(null); // Local preview URL
  const [profileImageUrl, setProfileImageUrl] = useState(null); // URL from DB
  const [selectedFile, setSelectedFile] = useState(null); // The actual file to upload
  const fileInputRef = useRef(null);

  // --- useEffect to fetch data ---
  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const data = await api.getProfile(user);
        if (data) {
          setBio(data.bio || "");
          setEmail(data.email || "");
          // NEW: We must add the base URL to the relative path from the DB
          if (data.profile_image_url) {
            setProfileImageUrl(`${API_BASE_URL}${data.profile_image_url}`);
          }
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      }
    };
    fetchProfileData();
  }, [user]);

  // --- handleImageSelect ---
  // This function now saves the file and creates a preview
  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setProfileImagePreview(URL.createObjectURL(file)); // Show local preview
      setSelectedFile(file); // Save the actual file for upload
    }
  };

  // --- handleSave (Completely new logic) ---
  const handleSave = async () => {
    try {
      // Start with the existing DB URL (relative path)
      let finalImageUrl = profileImageUrl ? profileImageUrl.replace(API_BASE_URL, "") : null; 
      
      // 1. If a new file was selected, upload it first
      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        
        const uploadResponse = await api.uploadImage(user, formData);
        
        if (uploadResponse.file_url) {
          finalImageUrl = uploadResponse.file_url; // Get the new URL from the backend
        } else {
          throw new Error("File upload failed to return a URL.");
        }
      }

      // 2. Now, save the bio and the (new or old) image URL to the database
      const updatedProfile = {
        bio: bio,
        profile_image_url: finalImageUrl 
      };
      
      const data = await api.updateProfile(user, updatedProfile);
      
      // 3. Update the state with the final saved data
      setBio(data.bio);
      if (data.profile_image_url) {
        setProfileImageUrl(`${API_BASE_URL}${data.profile_image_url}`);
      } else {
        setProfileImageUrl(null);
      }
      setProfileImagePreview(null); // Clear the local preview
      setSelectedFile(null); // Clear the selected file
      
      alert("Profile Saved!");
      onNavigateHome(); // Go back to the home feed
      
    } catch (error) {
      console.error("Failed to save profile:", error);
      alert("Error: Could not save profile.");
    }
  };

  // This logic decides what image to show:
  // 1. The new preview (if it exists)
  // 2. The saved image from the DB (if it exists)
  // 3. The fallback icon
  const displayImage = profileImagePreview || profileImageUrl;

  return (
    // Black & Green Theme (3-column layout)
    <div className="relative min-h-screen text-gray-200">
      <div className="mx-auto flex max-w-7xl">
        
        {/* --- LEFT COLUMN: NAVIGATION --- */}
        <aside className="sticky top-0 h-screen w-1/4">
          <Sidebar 
            onShowNotifications={() => alert("Notifications only available on Home page for now")}
            onShowChat={() => alert("Chat only available on Home page for now")}
            onNavigateToHome={onNavigateHome} 
            onNavigateToProfile={onNavigateToProfile}
          />
           <div className="absolute bottom-4 p-4">
             <button onClick={onLogout} className="flex items-center gap-4 rounded-full p-3 text-lg text-gray-200 transition-all hover:bg-neutral-800 hover:text-green-500">
                <span>Logout <strong>{user}</strong></span>
             </button>
           </div>
        </aside>
        
        {/* --- MIDDLE COLUMN: PROFILE CONTENT --- */}
        <main className="w-1/2 min-h-screen border-r border-neutral-700 bg-neutral-900"> 
          <div className="p-6">
            <h2 className="mb-6 text-2xl font-bold text-white">Profile Settings</h2>
            
            <div className="rounded-xl bg-neutral-800 p-6 shadow-md border border-neutral-700">
              
              {/* Profile Picture Section */}
              <div className="flex flex-col items-center">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <div className="relative">
                  {/* Use the new displayImage logic */}
                  {displayImage ? (
                    <img src={displayImage} alt="Profile" className="h-32 w-32 rounded-full object-cover" />
                  ) : (
                    <UserCircleIcon className="h-32 w-32 text-gray-500" />
                  )}
                  <button
                    onClick={() => fileInputRef.current.click()}
                    className="absolute bottom-1 right-1 rounded-full bg-green-500 p-2 text-black transition-all hover:bg-green-600"
                  >
                    <CameraIcon className="h-5 w-5" />
                  </button>
                </div>
                <h3 className="mt-4 text-2xl font-bold text-white capitalize">{user}</h3>
                <p className="text-sm text-gray-400">{email}</p> 
              </div>

              {/* Edit Bio Section */}
              <div className="mt-8">
                <label htmlFor="bio" className="text-sm font-semibold text-gray-400">YOUR BIO</label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell everyone a little about yourself..."
                  className="mt-2 w-full h-32 resize-none rounded-md bg-neutral-700 border border-neutral-600 p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Save Button */}
              <div className="mt-6 text-right">
                <button
                  onClick={handleSave}
                  className="rounded-full bg-green-500 px-6 py-2 font-bold text-black transition-all hover:bg-green-600"
                >
                  Save Changes
                </button>
              </div>

            </div>
          </div>
        </main>

        {/* --- RIGHT COLUMN: WIDGETS --- */}
        <aside className="sticky top-0 h-screen w-1/4 p-6 bg-neutral-900">
          <div className="rounded-xl bg-neutral-800 shadow-md p-4 border border-neutral-700">
            <h3 className="mb-4 text-lg font-bold text-white">Who to Follow</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src="https://i.pravatar.cc/150?u=alex" alt="alex" className="h-10 w-10 rounded-full" />
                  <span className="font-semibold text-gray-200">Alex</span>
                </div>
                <button className="rounded-full bg-green-500 px-3 py-1 text-sm font-semibold text-black hover:bg-green-600">Follow</button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src="https://i.pravatar.cc/150?u=dana" alt="dana" className="h-10 w-10 rounded-full" />
                  <span className="font-semibold text-gray-200">Dana</span>
                </div>
                <button className="rounded-full bg-green-500 px-3 py-1 text-sm font-semibold text-black hover:bg-green-600">Follow</button>
              </div>
            </div>
          </div>
        </aside>
        
      </div>
    </div>
  );
}