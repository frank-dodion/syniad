"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth, login } from "@/lib/auth-client";
import Header from "@/components/Header";
import HexLogo from "@/components/HexLogo";
import { getAllGames, deleteGame, createGame, updateGameTitle } from "@/lib/game-api";
import { getAllScenarios, deleteScenario, createScenario, getScenario } from "@/lib/scenario-api";
import type { Game } from "@/shared/types";
import { getGameStatus } from "@/shared/types";
import type { Scenario } from "@/lib/scenario-api";
import { v4 as uuidv4 } from "uuid";

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [expandedGames, setExpandedGames] = useState<Set<string>>(new Set());
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [editingGameTitle, setEditingGameTitle] = useState<string | null>(null);
  const [editingGameTitleValue, setEditingGameTitleValue] = useState<string>("");
  const hasLoadedRef = useRef<string | null>(null); // Track which userId we've loaded for
  const loadingGamesRef = useRef(false);
  const loadingScenariosRef = useRef(false);

  // Check for game join error message from sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const gameJoinError = sessionStorage.getItem('gameJoinError');
      if (gameJoinError) {
        sessionStorage.removeItem('gameJoinError');
        setMessage({ text: gameJoinError, type: "error" });
      }
    }
  }, []);

  function handleLogin() {
    if (typeof window !== "undefined") {
      const currentPath =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      if (currentPath && currentPath !== "/") {
        sessionStorage.setItem("authRedirect", currentPath);
      }
    }
    login(window.location.href);
  }


  // After successful login, redirect to intended destination if stored
  useEffect(() => {
    // Don't redirect if we're on the OAuth callback page - let Better Auth handle it
    if (typeof window !== "undefined" && window.location.pathname.includes('/api/auth/callback')) {
      return;
    }
    
    if (!isLoading && user && typeof window !== "undefined") {
      const redirectPath = sessionStorage.getItem("authRedirect");
      if (redirectPath) {
        sessionStorage.removeItem("authRedirect");
        router.push(redirectPath);
      }
    }
  }, [isLoading, user, router]);

  async function loadGames() {
    // Prevent concurrent calls and check authentication
    if (loadingGamesRef.current || !user?.userId || isLoading) {
      console.log('[loadGames] Skipping - already loading, not authenticated, or still loading');
      return;
    }
    
    loadingGamesRef.current = true;
    try {
      setLoadingGames(true);
      const response = await getAllGames(100, undefined, undefined, user.userId, undefined);
      setGames(response.games || []);
      hasLoadedRef.current = user.userId; // Mark as loaded for this userId
    } catch (error: any) {
      console.error('Error loading games:', error);
      // Check if error is authentication-related (401 or message contains auth keywords)
      const isAuthError = error.message?.includes('Authentication required') || 
                         error.message?.includes('401') ||
                         error.message?.includes('Please log in');
      if (!isAuthError) {
        showMessage(`Error loading games: ${error.message}`, "error");
      } else {
        console.log('[loadGames] Authentication error - stopping automatic retries');
        // Mark as attempted to prevent infinite loop - user can manually refresh
      }
      // Always mark as attempted after an error to prevent infinite retries
      hasLoadedRef.current = user.userId; // Mark as attempted for this userId
    } finally {
      setLoadingGames(false);
      loadingGamesRef.current = false;
    }
  }

  async function loadScenarios() {
    // Prevent concurrent calls and check authentication
    if (loadingScenariosRef.current || !user?.userId || isLoading) {
      console.log('[loadScenarios] Skipping - already loading, not authenticated, or still loading');
      return;
    }
    
    loadingScenariosRef.current = true;
    try {
      setLoadingScenarios(true);
      const response = await getAllScenarios(100, null, undefined, user.userId);
      setScenarios(response.scenarios || []);
      hasLoadedRef.current = user.userId; // Mark as loaded for this userId
    } catch (error: any) {
      console.error('Error loading scenarios:', error);
      // Check if error is authentication-related (401 or message contains auth keywords)
      const isAuthError = error.message?.includes('Authentication required') || 
                         error.message?.includes('401') ||
                         error.message?.includes('Please log in');
      if (!isAuthError) {
        showMessage(`Error loading scenarios: ${error.message}`, "error");
      } else {
        console.log('[loadScenarios] Authentication error - stopping automatic retries');
        // Mark as attempted to prevent infinite loop - user can manually refresh
      }
      // Always mark as attempted after an error to prevent infinite retries
      hasLoadedRef.current = user.userId; // Mark as attempted for this userId
    } finally {
      setLoadingScenarios(false);
      loadingScenariosRef.current = false;
    }
  }

  // Load games and scenarios when user is authenticated - only once per userId
  useEffect(() => {
    const currentUserId = user?.userId;
    console.log('[HomePage] useEffect triggered:', {
      isLoading,
      hasUser: !!user,
      userId: currentUserId,
      hasLoaded: hasLoadedRef.current,
      loadingGames: loadingGamesRef.current,
      loadingScenarios: loadingScenariosRef.current,
      shouldLoad: !isLoading && user && currentUserId && hasLoadedRef.current !== currentUserId && !loadingGamesRef.current && !loadingScenariosRef.current
    });
    
    // Only load if:
    // 1. Authentication check is complete
    // 2. User is authenticated with userId
    // 3. We haven't already loaded for this userId
    // 4. We're not currently loading games or scenarios
    if (!isLoading && user && currentUserId && hasLoadedRef.current !== currentUserId && !loadingGamesRef.current && !loadingScenariosRef.current) {
      console.log('[HomePage] Loading games and scenarios for userId:', currentUserId);
      loadGames();
      loadScenarios();
    }
    
    // Reset when user logs out
    if (!isLoading && !user) {
      hasLoadedRef.current = null;
      setGames([]);
      setScenarios([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user?.userId]);

  function showMessage(text: string, type: "success" | "error") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleDeleteGame(gameId: string) {
    if (!confirm("Are you sure you want to delete this game?")) return;
    try {
      await deleteGame(gameId);
      showMessage("Game deleted successfully", "success");
      await loadGames();
    } catch (error: any) {
      showMessage(`Error deleting game: ${error.message}`, "error");
    }
  }

  async function handleDeleteScenario(scenarioId: string) {
    if (!confirm("Are you sure you want to delete this scenario?")) return;
    try {
      await deleteScenario(scenarioId);
      showMessage("Scenario deleted successfully", "success");
      await loadScenarios();
    } catch (error: any) {
      showMessage(`Error deleting scenario: ${error.message}`, "error");
    }
  }

  async function handleCreateGameFromScenario(scenarioId: string) {
    try {
      const response = await createGame(scenarioId);
      showMessage("Game created successfully", "success");
      await loadGames();
      // Open game page in new tab - WebSocket will connect via route
      window.open(`/game/${response.gameId}`, '_blank');
    } catch (error: any) {
      showMessage(`Error creating game: ${error.message}`, "error");
    }
  }

  async function handleRenameGame(gameId: string, newTitle: string) {
    try {
      await updateGameTitle(gameId, newTitle);
      showMessage("Game title updated successfully", "success");
      setEditingGameTitle(null);
      await loadGames();
    } catch (error: any) {
      showMessage(`Error updating game title: ${error.message}`, "error");
    }
  }

  async function handleCreateNewScenario() {
    if (!user) {
      showMessage("Please sign in to create scenarios", "error");
      return;
    }

    try {
      // Create a new scenario with default values
      const scenarioData = {
        title: "New Scenario",
        description: "",
        columns: 12,
        rows: 10,
        turns: 15,
        hexes: [],
        units: [],
      };

      const response = await createScenario(scenarioData);
      showMessage("Scenario created successfully", "success");
      
      // Open scenario editor in a new tab
      window.open(`/scenario/${response.scenario.scenarioId}`, '_blank');
    } catch (error: any) {
      showMessage(`Error creating scenario: ${error.message}`, "error");
    }
  }

  async function handleCloneScenario(scenarioId: string) {
    if (!user) {
      showMessage("Please sign in to clone scenarios", "error");
      return;
    }

    try {
      // Fetch the full scenario data including hexes and units
      const sourceResponse = await getScenario(scenarioId);
      const sourceScenario = sourceResponse.scenario;

      // Create a timestamp string for the title
      const timestamp = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Create cloned scenario data
      const scenarioData = {
        title: `${sourceScenario.title} (cloned ${timestamp})`,
        description: sourceScenario.description || "",
        columns: sourceScenario.columns,
        rows: sourceScenario.rows,
        turns: sourceScenario.turns,
        hexes: sourceScenario.hexes || [],
        units: sourceScenario.units ? sourceScenario.units.map(unit => ({
          ...unit,
          id: uuidv4(), // Generate new IDs for cloned units
        })) : [],
      };

      const response = await createScenario(scenarioData);
      showMessage("Scenario cloned successfully", "success");
      
      // Open scenario editor in a new tab
      window.open(`/scenario/${response.scenario.scenarioId}`, '_blank');
    } catch (error: any) {
      showMessage(`Error cloning scenario: ${error.message}`, "error");
    }
  }

  return (
    <div className="h-screen min-w-full bg-slate-100 flex flex-col overflow-hidden">
      <Header title="Syniad" />
      <div className="flex-1 mt-14 px-6 py-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-4 mb-4">
              <HexLogo size={64} />
              <h1 className="text-4xl font-bold text-gray-800">Syniad</h1>
            </div>
            <p className="text-lg text-gray-600 mb-2">Strategic Hex-Based Wargame</p>
            <p className="text-sm text-gray-500">Create scenarios, play games, and command your forces in turn-based tactical combat</p>
          </div>

          {!user && !isLoading && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 mb-6 text-center max-w-md mx-auto">
              <p className="text-gray-700 mb-4">Sign in to create scenarios, join games, and start playing.</p>
              <button
                onClick={handleLogin}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
              >
                Sign In
              </button>
            </div>
          )}

          {user && (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Message display */}
              {message && (
                <div className={`p-4 rounded-lg ${
                  message.type === "success" 
                    ? "bg-green-100 text-green-800 border border-green-200" 
                    : "bg-red-100 text-red-800 border border-red-200"
                }`}>
                  {message.text}
                </div>
              )}

              {/* My Games and My Scenarios - Side by Side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* My Games */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 h-[2.5rem]">
                  <h2 className="text-2xl font-semibold text-gray-800">My Games</h2>
                  <div className="w-20 h-[2.25rem]"></div>
                </div>
                {loadingGames ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading games...</p>
                  </div>
                ) : games.length === 0 ? (
                  <p className="text-gray-500 italic text-center py-8">No games yet. Create a game from a scenario in the scenarios section.</p>
                ) : (
                  <div className="space-y-2">
                    {games.map((game) => {
                      const gameLink = typeof window !== 'undefined' 
                        ? `${window.location.origin}/game/${game.gameId}`
                        : '';
                      const isExpanded = expandedGames.has(game.gameId);
                      return (
                        <div
                          key={game.gameId}
                          className="border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
                        >
                          <div 
                            className="p-3 cursor-pointer flex items-center justify-between gap-3 min-h-[3.5rem]"
                            onClick={() => {
                              const newExpanded = new Set(expandedGames);
                              if (isExpanded) {
                                newExpanded.delete(game.gameId);
                              } else {
                                newExpanded.add(game.gameId);
                              }
                              setExpandedGames(newExpanded);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-800">
                                {game.title || game.scenarioSnapshot?.title || 'Game'}
                              </h3>
                              {!isExpanded && (
                                <p className="text-xs font-mono text-gray-500 mt-1 break-all">
                                  {game.gameId}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/game/${game.gameId}`, '_blank');
                                }}
                                className="px-2 py-1 text-xs font-medium rounded transition-colors bg-blue-500 hover:bg-blue-600 text-white whitespace-nowrap"
                              >
                                Open
                              </button>
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-0 border-t border-gray-100">
                              <div className="space-y-1 mt-3">
                                {editingGameTitle === game.gameId ? (
                                  <div className="space-y-2">
                                    <input
                                      type="text"
                                      value={editingGameTitleValue}
                                      onChange={(e) => setEditingGameTitleValue(e.target.value)}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          handleRenameGame(game.gameId, editingGameTitleValue);
                                        } else if (e.key === 'Escape') {
                                          setEditingGameTitle(null);
                                        }
                                      }}
                                      className="w-full p-2 border border-gray-300 rounded text-sm"
                                      autoFocus
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRenameGame(game.gameId, editingGameTitleValue);
                                        }}
                                        className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingGameTitle(null);
                                        }}
                                        className="text-xs px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm text-gray-600">
                                        Title: <span className="font-medium">{game.title || game.scenarioSnapshot?.title || 'Game'}</span>
                                      </p>
                                      {game.player1Id === user?.userId && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingGameTitle(game.gameId);
                                            setEditingGameTitleValue(game.title || game.scenarioSnapshot?.title || '');
                                          }}
                                          className="text-xs px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded"
                                        >
                                          Rename
                                        </button>
                                      )}
                                    </div>
                                    <p className="text-xs font-mono text-gray-500 break-all">
                                      ID: {game.gameId}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      Status: <span className="font-medium capitalize">{getGameStatus(game)}</span>
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      Player 1: {game.player1.name}
                                    </p>
                                    {game.player2 ? (
                                      <p className="text-sm text-gray-600">
                                        Player 2: {game.player2.name}
                                      </p>
                                    ) : (
                                      <p className="text-sm text-gray-500 italic">
                                        Waiting for player 2...
                                      </p>
                                    )}
                                    <p className="text-xs text-gray-500">
                                      Turn: {game.gameState.turnNumber}
                                    </p>
                                  </>
                                )}
                              </div>
                              {editingGameTitle !== game.gameId && (
                                <div className="flex items-center gap-2 mt-3">
                                  {getGameStatus(game) === 'waiting' && !game.player2 && (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await navigator.clipboard.writeText(gameLink);
                                          showMessage("Game link copied to clipboard!", "success");
                                        } catch (error) {
                                          showMessage(`Game link: ${gameLink}`, "error");
                                        }
                                      }}
                                      className="text-xs px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded"
                                    >
                                      Copy Link
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteGame(game.gameId);
                                    }}
                                    className="text-xs px-2 py-1 font-medium rounded transition-colors bg-red-500 hover:bg-red-600 text-white whitespace-nowrap"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>

                {/* My Scenarios */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 h-[2.5rem]">
                  <h2 className="text-2xl font-semibold text-gray-800">My Scenarios</h2>
                  <button
                    onClick={handleCreateNewScenario}
                    className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-green-500 hover:bg-green-600 text-white"
                  >
                    Create New
                  </button>
                </div>
                {loadingScenarios ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading scenarios...</p>
                  </div>
                ) : scenarios.length === 0 ? (
                  <p className="text-gray-500 italic text-center py-8">No scenarios yet. Create your first scenario!</p>
                ) : (
                  <div className="space-y-2">
                    {scenarios.map((scenario) => {
                      const isExpanded = expandedScenarios.has(scenario.scenarioId);
                      return (
                        <div
                          key={scenario.scenarioId}
                          className="border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
                        >
                          <div 
                            className="p-3 cursor-pointer flex items-center justify-between gap-3 min-h-[3.5rem]"
                            onClick={() => {
                              const newExpanded = new Set(expandedScenarios);
                              if (isExpanded) {
                                newExpanded.delete(scenario.scenarioId);
                              } else {
                                newExpanded.add(scenario.scenarioId);
                              }
                              setExpandedScenarios(newExpanded);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-800">
                                {scenario.title}
                              </h3>
                              {!isExpanded && (
                                <p className="text-xs font-mono text-gray-500 mt-1 break-all">
                                  {scenario.scenarioId}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCreateGameFromScenario(scenario.scenarioId);
                                }}
                                className="px-2 py-1 text-xs font-medium rounded transition-colors bg-purple-500 hover:bg-purple-600 text-white whitespace-nowrap"
                              >
                                Create Game
                              </button>
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-0 border-t border-gray-100">
                              <div className="space-y-1 mt-3">
                                <p className="text-xs font-mono text-gray-500 break-all">
                                  ID: {scenario.scenarioId}
                                </p>
                                {scenario.description && (
                                  <p className="text-sm text-gray-600 mt-2">
                                    {scenario.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                                  <span>{scenario.columns}×{scenario.rows}</span>
                                  <span>{scenario.turns} turns</span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-3 gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteScenario(scenario.scenarioId);
                                  }}
                                  className="text-xs px-2 py-1 font-medium rounded transition-colors bg-red-500 hover:bg-red-600 text-white whitespace-nowrap"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCloneScenario(scenario.scenarioId);
                                  }}
                                  className="text-xs px-2 py-1 font-medium rounded transition-colors bg-blue-500 hover:bg-blue-600 text-white whitespace-nowrap"
                                >
                                  Clone
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(`/scenario/${scenario.scenarioId}`, '_blank');
                                  }}
                                  className="text-xs px-2 py-1 font-medium rounded transition-colors bg-orange-500 hover:bg-orange-600 text-white whitespace-nowrap"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
            </div>
          )}

          {/* Additional Links */}
          <div className="mt-6 text-center">
            <a
              href="/api/docs"
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              View API Documentation
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
