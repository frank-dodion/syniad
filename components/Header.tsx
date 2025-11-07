'use client';

import { useAuth, login, logout } from '@/lib/auth-client';

export default function Header() {
  const { user, isLoading } = useAuth();

  function handleLogin() {
    login(window.location.href);
  }

  function handleLogout() {
    logout();
  }

  return (
    <header className="fixed top-0 left-0 right-0 bg-gray-800 text-white px-8 py-4 flex justify-between items-center z-[1000] shadow-md">
      <h1 className="text-xl font-semibold m-0">Scenario Editor</h1>
      <div className="flex items-center gap-4">
        {isLoading ? (
          <span>Checking...</span>
        ) : user ? (
          <>
            <span>Logged in as {user.email || user.username}</span>
            <button 
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors text-sm"
              onClick={handleLogout}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <span>Not logged in</span>
            <button 
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors text-sm"
              onClick={handleLogin}
            >
              Login
            </button>
          </>
        )}
      </div>
    </header>
  );
}

