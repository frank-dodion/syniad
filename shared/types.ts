export interface Game {
  gameId: string;
  status: 'waiting' | 'active' | 'finished';
  player1: Player; // Required: Creator (Player 1) - always the game creator
  player2?: Player; // Optional: Second player (Player 2) - set when someone joins
  // Denormalized index fields for efficient database queries:
  player1Id: string; // Index field: equals player1.userId for efficient "games created by player1" queries
  player2Id?: string; // Index field: equals player2.userId when player2 exists
  turnNumber: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Player {
  name: string;
  userId: string; // Required: Cognito sub (unique, immutable identifier)
  // Note: playerIndex is implicit - player1 is always index 1, player2 is always index 2
}

export interface GameDefinition {
  gameDefId: string;
  name: string;
  description: string;
  category: string;
  maxPlayers: number;
  minPlayers: number;
  map: MapDefinition;
  startingUnits: StartingUnit[];
  unitTypes: Record<string, UnitType>;
}

export interface MapDefinition {
  width: number;
  height: number;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface StartingUnit {
  playerIndex: number;
  units: {
    unitType: string;
    hexX: number;
    hexY: number;
  }[];
}

export interface UnitType {
  name: string;
  movement: number;
  attack: number;
  defense: number;
  health: number;
  range: number;
  cost?: number;
}

export interface Unit {
  unitId: string;
  unitType: string;
  ownerPlayerIndex: number;
  hexX: number;
  hexY: number;
  currentHealth: number;
  maxHealth: number;
  hasMoved?: boolean;
  hasAttacked?: boolean;
}

