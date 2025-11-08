'use client';

import { useAuth, login, logout } from '@/lib/auth-client';

export default function HomePage() {
  const { user, isLoading } = useAuth();

  function handleLogin() {
    login(window.location.href);
  }

  function handleLogout() {
    logout();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 flex items-center justify-center text-white">
      <div className="text-center p-8 max-w-2xl">
        <h1 className="text-5xl font-bold mb-4 drop-shadow-lg">🎮 Syniad</h1>
        <p className="text-xl mb-8 opacity-90">Main Game Application</p>
        
        <div className="bg-white/20 backdrop-blur-lg rounded-xl p-6 mb-8">
          <div className="mb-2">
            <span className="font-bold mr-2">Status:</span>
            <span>
              {isLoading ? 'Checking...' : user ? 'Authenticated ✓' : 'Not authenticated'}
            </span>
          </div>
          {user && (
            <div>
              <span className="font-bold mr-2">User:</span>
              <span>{user.email || user.username || user.userId}</span>
            </div>
          )}
        </div>
        
        <div className="mb-8">
          {!user && !isLoading && (
            <button 
              onClick={handleLogin}
              className="bg-white/30 hover:bg-white/50 border-2 border-white text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 mx-2"
            >
              Login
            </button>
          )}
          {user && (
            <button 
              onClick={handleLogout}
              className="bg-white/30 hover:bg-white/50 border-2 border-white text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 mx-2"
            >
              Logout
            </button>
          )}
        </div>
        
        <div className="mt-8 text-sm opacity-80">
          <p className="mb-2">This is a placeholder for the main game application.</p>
          <p>
            <a href="/editor" className="underline hover:opacity-80 mx-1">Scenario Editor</a> |
            <a href="/api/docs" className="underline hover:opacity-80 mx-1">API Docs</a>
          </p>
        </div>
      </div>
    </div>
  );
}

