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
    <div className="container">
      <h1>🎮 Syniad</h1>
      <p className="subtitle">Main Game Application</p>
      
      <div className="status">
        <div className="status-item">
          <span className="status-label">Status:</span>
          <span>
            {isLoading ? 'Checking...' : user ? 'Authenticated ✓' : 'Not authenticated'}
          </span>
        </div>
        {user && (
          <div className="status-item">
            <span className="status-label">User:</span>
            <span>{user.email || user.username || user.userId}</span>
          </div>
        )}
      </div>
      
      <div>
        {!user && !isLoading && (
          <button onClick={handleLogin}>Login</button>
        )}
        {user && (
          <button onClick={handleLogout}>Logout</button>
        )}
      </div>
      
      <div style={{ marginTop: '2rem', fontSize: '0.9rem', opacity: 0.8 }}>
        <p>This is a placeholder for the main game application.</p>
        <p>
          <a href="https://editor.dev.syniad.net" className="link">Scenario Editor</a> |
          <a href="/api/docs" className="link">API Docs</a>
        </p>
      </div>
    </div>
  );
}

