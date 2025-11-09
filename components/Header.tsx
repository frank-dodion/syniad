"use client";

import { useAuth, logout } from "@/lib/auth-client";

export default function Header() {
  const { user, isLoading } = useAuth();

  function handleLogout() {
    logout();
  }

  return (
    <header className="fixed top-0 left-0 right-0 bg-gray-800 text-white h-14 px-6 flex justify-between items-center z-[1000] shadow-md">
      <h1 className="text-lg font-semibold m-0 leading-none">
        Scenario Editor
      </h1>
      <div className="flex items-center gap-4">
        {isLoading ? (
          <span className="text-sm">Checking...</span>
        ) : user ? (
          <>
            <span className="text-sm">
              Logged in as {user.email || user.username}
            </span>
            <button
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors text-sm"
              onClick={handleLogout}
            >
              Logout
            </button>
          </>
        ) : (
          <span className="text-sm text-gray-400">Not logged in</span>
        )}
      </div>
    </header>
  );
}
