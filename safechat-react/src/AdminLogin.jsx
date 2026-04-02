import { useState, useEffect } from 'react';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function AdminLogin({ onLoginSuccess, onCancel }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Update URL to /admin
    window.history.pushState({}, '', '/admin');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Simulate login delay
    setTimeout(() => {
      // Simple credential check: admin / 123
      if (username === 'admin' && password === '123') {
        onLoginSuccess(username);
        setUsername('');
        setPassword('');
      } else {
        setError('Invalid username or password');
      }
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header with Back Button */}
      <div className="bg-gradient-to-r from-green-900 to-green-800 border-b border-green-700 px-4 py-4">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-green-100 hover:text-white transition"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          <span>Back</span>
        </button>
      </div>

      {/* Login Form Container */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-8 shadow-2xl">
            {/* Title */}
            <h1 className="text-3xl font-bold text-white mb-2 text-center">Admin Access</h1>
            <p className="text-gray-400 text-center mb-8">Enter your credentials to access the admin panel</p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username Field */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter username"
                  disabled={isLoading}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition disabled:opacity-50"
                />
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter password"
                  disabled={isLoading}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition disabled:opacity-50"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !username || !password}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            {/* Demo Hint */}
            <p className="text-gray-500 text-xs text-center mt-6">
              This is a secure admin interface. Contact your system administrator for access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
