export interface Game {
  gameId: string;
  status: 'waiting' | 'active' | 'finished';
  players: Player[];
  turnNumber: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Player {
  name: string;
  userId?: string;
  playerIndex?: number;
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

