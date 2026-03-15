// src/AuthPage.jsx
import { useState } from 'react';


// --- API Configuration (No Changes) ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const api = {
    signup: (username, email, password) => fetch(`${API_BASE_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
    }),
    login: (username, password) => fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
};

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleAuthAction = async () => {
    if (mode === 'login') {
      if (!username || !password) {
        alert('Please enter username and password.');
        return;
      }
      try {
        const response = await api.login(username, password);
        const data = await response.json(); 
        if (response.ok) {
          onLogin(data.username);
        } else {
          alert(`Login failed: ${data.detail}`);
        }
      } catch (error) {
        alert('An error occurred during login. Is the backend server running?');
        console.error("Login API call failed:", error); 
      }
    } else {
      if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
      }
      if (!username || !email || !password) {
         alert('Please fill out all fields.');
         return;
      }
      try {
        const response = await api.signup(username, email, password);
        const data = await response.json();
        if (response.ok) {
          alert('Sign up successful! Please log in.');
          setMode('login'); 
        } else {
          alert(`Sign up failed: ${data.detail}`);
        }
      } catch (error) {
        alert('An error occurred during sign up. Is the backend server running?');
        console.error("Signup API call failed:", error); 
      }
    }
  };

  return (
    // NEW: Dark background for auth page
    <div className="flex items-center justify-center min-h-screen bg-neutral-950">
      {/* NEW: Darker card, subtle border */}
      <div className="w-full max-w-sm p-8 space-y-6 bg-[#202020] rounded-xl shadow-lg border border-[#333333]">
        {/* Placeholder for Logo - will be updated in Task 2 */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-white mb-2">SafeChat</h1>
          <p className="text-sm text-gray-400">Your secure communication platform</p>
        </div>

        <h2 className="text-2xl font-bold text-center text-[#1DB954]">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="text-center text-gray-400 text-sm">
          {mode === 'login' ? 'Log in to continue your secure chat' : 'Join the SafeChat community today'}
        </p>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            // NEW: Dark inputs, vibrant green focus
            className="w-full px-4 py-3 text-white bg-neutral-800 border border-neutral-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1DB954] placeholder-gray-500"
          />
          {mode === 'signup' && (
             <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 text-white bg-neutral-800 border border-neutral-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1DB954] placeholder-gray-500" />
          )}
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 text-white bg-neutral-800 border border-neutral-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1DB954] placeholder-gray-500" />
          {mode === 'signup' && (
            <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 text-white bg-neutral-800 border border-neutral-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1DB954] placeholder-gray-500" />
          )}
        </div>

        <button
          onClick={handleAuthAction}
          // NEW: Vibrant green button
          className="w-full px-4 py-3 font-bold text-black bg-[#1DB954] rounded-md hover:bg-emerald-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1DB954]"
        >
          {mode === 'login' ? 'Login' : 'Sign Up'}
        </button>

        <p className="text-sm text-center text-gray-400">
          {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            // NEW: Vibrant green link
            className="font-semibold text-[#1DB954] hover:underline ml-1"
          >
            {mode === 'login' ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}