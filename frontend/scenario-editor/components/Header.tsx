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
    <header>
      <h1>Scenario Editor</h1>
      <div className="auth-status">
        {isLoading ? (
          <span>Checking...</span>
        ) : user ? (
          <>
            <span>Logged in as {user.email || user.username}</span>
            <button className="btn btn-secondary" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <span>Not logged in</span>
            <button className="btn btn-primary" onClick={handleLogin}>
              Login
            </button>
          </>
        )}
      </div>
    </header>
  );
}

