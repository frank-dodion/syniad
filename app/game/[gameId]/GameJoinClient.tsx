"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth, login } from "@/lib/auth-client";
import { getGame, joinGame } from "@/lib/game-api";
import type { Game } from "@/shared/types";
import { getGameStatus } from "@/shared/types";

export function GameJoinClient({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const hasAttemptedJoin = useRef(false);

  // Extract gameId from params
  useEffect(() => {
    params.then((p) => {
      setGameId(p.gameId);
    });
  }, [params]);

  // Redirect to login if not authenticated, preserving the game URL
  useEffect(() => {
    if (!isLoading && !isAuthenticated && gameId) {
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname + window.location.search + window.location.hash;
        sessionStorage.setItem("authRedirect", currentPath);
        login(window.location.href);
      }
    }
  }, [isLoading, isAuthenticated, gameId]);

  // Load game and handle automatic joining when authenticated
  useEffect(() => {
    if (gameId && isAuthenticated && user?.userId && !loading && !joining && !redirecting && !hasAttemptedJoin.current) {
      void handleGameFlow();
    }
  }, [gameId, isAuthenticated, user?.userId, loading, joining, redirecting]);

  async function handleGameFlow() {
    if (!gameId || !user?.userId) return;
    
    try {
      setLoading(true);
      const response = await getGame(gameId);
      const game = response.game;
      setGame(game);
      
      const isPlayer1 = game.player1Id === user.userId;
      const isPlayer2 = game.player2Id === user.userId;
      const isAlreadyPlayer = isPlayer1 || isPlayer2;
      const gameStatus = getGameStatus(game);
      
      // Case 1: User is already a player → redirect to game
      if (isAlreadyPlayer) {
        setRedirecting(true);
        // Use window.location for immediate redirect
        window.location.href = `/game/${gameId}`;
        return;
      }
      
      // Case 2: Game has 2 players and user is NOT one → redirect to home with error
      if (gameStatus === 'active' && game.player2) {
        setRedirecting(true);
        // Store error message in sessionStorage to show on home page
        sessionStorage.setItem('gameJoinError', 'This game already has both players. It is not possible to join.');
        router.push('/');
        return;
      }
      
      // Case 3: Game is waiting → automatically join
      if (gameStatus === 'waiting' && !game.player2) {
        hasAttemptedJoin.current = true;
        setJoining(true);
        try {
          const joinResponse = await joinGame(gameId);
          setGame(joinResponse.game);
          // Redirect to game after successful join
          setRedirecting(true);
          // Use window.location for immediate redirect
          window.location.href = `/game/${gameId}`;
        } catch (error: any) {
          console.error('Error joining game:', error);
          // If join fails, redirect to home with error
          sessionStorage.setItem('gameJoinError', `Failed to join game: ${error.message}`);
          router.push('/');
        } finally {
          setJoining(false);
        }
        return;
      }
      
      // Fallback: redirect to home
      sessionStorage.setItem('gameJoinError', 'Unable to join this game.');
      router.push('/');
    } catch (error: any) {
      console.error('Error loading game:', error);
      sessionStorage.setItem('gameJoinError', `Game not found: ${error.message}`);
      router.push('/');
    } finally {
      setLoading(false);
    }
  }

  // Show loading/redirecting state
  if (isLoading || !isAuthenticated || loading || joining || redirecting) {
    let message = "Loading...";
    if (!isAuthenticated && !isLoading) {
      message = "Redirecting to login...";
    } else if (joining) {
      message = "Joining game...";
    } else if (redirecting) {
      message = "Redirecting to game...";
    } else if (loading) {
      message = "Loading game...";
    }
    
    return (
      <div className="min-h-screen min-w-full bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
    );
  }

  // This should never be reached due to automatic redirects, but just in case
  return (
    <div className="min-h-screen min-w-full bg-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Processing...</p>
      </div>
    </div>
  );
}

