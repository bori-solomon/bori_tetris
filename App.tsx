
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Tetromino, Position, TetrominoType } from './types';
import { TETROMINOES, INITIAL_WIDTH, INITIAL_HEIGHT, SCORING, COLORS } from './constants';
import { GeminiCoachService } from './geminiService';

// --- Utility Components ---

const Block: React.FC<{ color: string; isGhost?: boolean }> = ({ color, isGhost }) => (
  <div className={`w-full h-full border rounded-sm transition-all duration-150 ${color} ${isGhost ? 'opacity-20' : ''}`} />
);

const PiecePreview: React.FC<{ piece: Tetromino | null; label: string }> = ({ piece, label }) => {
  // Filter out empty rows/cols for the preview to center it better
  const renderShape = piece?.shape.filter(row => row.some(cell => cell !== 0)) || [];
  const maxCols = renderShape.length > 0 ? Math.max(...renderShape.map(row => row.length)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs uppercase tracking-widest text-slate-500 px-2 font-bold">{label}</div>
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-center min-h-[120px] w-32 shadow-inner relative overflow-hidden">
        {piece ? (
          <div 
            className="grid gap-1"
            style={{ 
              gridTemplateColumns: `repeat(${maxCols}, minmax(0, 1fr))`,
            }}
          >
            {renderShape.map((row, y) => 
              row.map((cell, x) => (
                <div key={`${x}-${y}`} className="w-5 h-5">
                  {cell ? <Block color={piece.color} /> : null}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="text-slate-700 text-[10px] uppercase font-mono italic text-center">Empty</div>
        )}
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    grid: Array.from({ length: INITIAL_HEIGHT }, () => Array(INITIAL_WIDTH).fill(null)),
    currentPiece: null,
    nextPiece: {
      type: 'I',
      shape: TETROMINOES['I'].shape,
      color: TETROMINOES['I'].color,
      position: { x: 0, y: 0 }
    },
    heldPiece: null,
    canHold: true,
    isFrozen: false,
    score: 0,
    lines: 0,
    level: 1,
    status: 'IDLE',
    config: { 
      width: INITIAL_WIDTH, 
      height: INITIAL_HEIGHT,
      baseSpeed: 500
    }
  });

  const [coachComment, setCoachComment] = useState<string>("System Ready. Calibrate field dimensions to begin.");
  const coachService = useRef(new GeminiCoachService());
  const gameLoopRef = useRef<number | null>(null);

  // --- Constants for styling ---
  const FROZEN_COLOR = 'bg-red-600 border-red-400 shadow-[0_0_20px_rgba(220,38,38,1)] animate-pulse';

  // --- Helper Functions ---

  const getRandomPiece = useCallback((width: number): Tetromino => {
    const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    const type = types[Math.floor(Math.random() * types.length)];
    const def = TETROMINOES[type];
    return {
      type,
      shape: JSON.parse(JSON.stringify(def.shape)), // Deep copy shape
      color: def.color,
      position: { x: Math.floor(width / 2) - Math.floor(def.shape[0].length / 2), y: 0 }
    };
  }, []);

  const checkCollision = useCallback((piece: Tetromino, grid: (string | null)[][], moveX = 0, moveY = 0, newShape?: number[][]) => {
    const shape = newShape || piece.shape;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          const nextX = piece.position.x + x + moveX;
          const nextY = piece.position.y + y + moveY;
          if (
            nextX < 0 || 
            nextX >= grid[0].length || 
            nextY >= grid.length ||
            (nextY >= 0 && grid[nextY][nextX])
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }, []);

  const toggleFreeze = useCallback(() => {
    setGameState(prev => {
      if (prev.status !== 'PLAYING') return prev;
      return { ...prev, isFrozen: !prev.isFrozen };
    });
  }, []);

  const stopGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      status: 'IDLE',
      currentPiece: null,
      isFrozen: false,
      score: 0,
      lines: 0,
      level: 1
    }));
    setCoachComment("Session terminated. Awaiting new calibration.");
  }, []);

  const rotate = useCallback((clockwise: boolean) => {
    setGameState(prev => {
      if (!prev.currentPiece || prev.status !== 'PLAYING' || prev.isFrozen) return prev;
      
      const shape = prev.currentPiece.shape;
      const newShape = shape[0].map((_, index) =>
        shape.map(row => row[index])
      );
      
      if (clockwise) {
        newShape.forEach(row => row.reverse());
      } else {
        newShape.reverse();
      }

      if (!checkCollision(prev.currentPiece, prev.grid, 0, 0, newShape)) {
        return {
          ...prev,
          currentPiece: { ...prev.currentPiece, shape: newShape }
        };
      }
      return prev;
    });
  }, [checkCollision]);

  const lockPiece = useCallback((state: GameState): GameState => {
    const { currentPiece, grid, nextPiece, config, score, lines, level } = state;
    if (!currentPiece) return state;

    const newGrid = grid.map(row => [...row]);
    currentPiece.shape.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell) {
          const gridY = currentPiece.position.y + y;
          const gridX = currentPiece.position.x + x;
          if (gridY >= 0 && gridY < config.height) {
            newGrid[gridY][gridX] = currentPiece.color;
          }
        }
      });
    });

    let clearedLinesCount = 0;
    const filteredGrid = newGrid.filter(row => {
      if (row.every(cell => cell !== null)) {
        clearedLinesCount++;
        return false;
      }
      return true;
    });

    while (filteredGrid.length < config.height) {
      filteredGrid.unshift(Array(config.width).fill(null));
    }

    const newScore = score + (clearedLinesCount > 0 ? (SCORING[clearedLinesCount as keyof typeof SCORING] || 0) * level : 0);
    const newLinesTotal = lines + clearedLinesCount;
    const newLevel = Math.floor(newLinesTotal / 10) + 1;

    // IMPORTANT: The next piece spawns here
    const spawnPos = { x: Math.floor(config.width / 2) - Math.floor(nextPiece.shape[0].length / 2), y: 0 };
    const nextToSpawn = { ...nextPiece, position: spawnPos };

    if (checkCollision(nextToSpawn, filteredGrid)) {
      return {
        ...state,
        grid: filteredGrid,
        currentPiece: null,
        status: 'GAME_OVER',
        score: newScore,
        lines: newLinesTotal,
        isFrozen: false
      };
    }

    return {
      ...state,
      grid: filteredGrid,
      currentPiece: nextToSpawn,
      nextPiece: getRandomPiece(config.width),
      canHold: true,
      isFrozen: false,
      score: newScore,
      lines: newLinesTotal,
      level: newLevel
    };
  }, [checkCollision, getRandomPiece]);

  const move = useCallback((dx: number, dy: number) => {
    setGameState(prev => {
      if (!prev.currentPiece || prev.status !== 'PLAYING') return prev;
      if (prev.isFrozen && dy !== 0) return prev; 

      if (!checkCollision(prev.currentPiece, prev.grid, dx, dy)) {
        return {
          ...prev,
          currentPiece: { 
            ...prev.currentPiece, 
            position: { 
              x: prev.currentPiece.position.x + dx, 
              y: prev.currentPiece.position.y + dy 
            } 
          }
        };
      }

      if (dy > 0) {
        return lockPiece(prev);
      }

      return prev;
    });
  }, [checkCollision, lockPiece]);

  const hardDrop = useCallback(() => {
    setGameState(prev => {
      if (!prev.currentPiece || prev.status !== 'PLAYING') return prev;
      let dropY = 0;
      while (!checkCollision(prev.currentPiece, prev.grid, 0, dropY + 1)) {
        dropY++;
      }
      const droppedPiece = {
        ...prev.currentPiece,
        position: { x: prev.currentPiece.position.x, y: prev.currentPiece.position.y + dropY }
      };
      return lockPiece({ ...prev, currentPiece: droppedPiece });
    });
  }, [checkCollision, lockPiece]);

  const moveToEnd = useCallback((dx: number) => {
    setGameState(prev => {
      if (!prev.currentPiece || prev.status !== 'PLAYING' || prev.isFrozen) return prev;
      let finalDx = 0;
      while (!checkCollision(prev.currentPiece, prev.grid, finalDx + dx, 0)) {
        finalDx += dx;
      }
      return {
        ...prev,
        currentPiece: {
          ...prev.currentPiece,
          position: { ...prev.currentPiece.position, x: prev.currentPiece.position.x + finalDx }
        }
      };
    });
  }, [checkCollision]);

  // --- Game Loop and Effects ---

  useEffect(() => {
    if (gameState.status === 'PLAYING' && !gameState.isFrozen) {
      const currentSpeed = Math.max(50, gameState.config.baseSpeed * Math.pow(0.9, gameState.level - 1));
      gameLoopRef.current = window.setInterval(() => {
        move(0, 1);
      }, currentSpeed);
    } else {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    }
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [gameState.status, gameState.level, gameState.config.baseSpeed, gameState.isFrozen, move]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState.status !== 'PLAYING') return;

      switch (e.code) {
        case 'ArrowLeft':
          if (e.ctrlKey) moveToEnd(-1);
          else move(-1, 0);
          break;
        case 'ArrowRight':
          if (e.ctrlKey) moveToEnd(1);
          else move(1, 0);
          break;
        case 'ArrowDown':
          move(0, 1);
          break;
        case 'ArrowUp':
          rotate(true);
          break;
        case 'Space':
          e.preventDefault();
          hardDrop();
          break;
        case 'KeyF':
          toggleFreeze();
          break;
        case 'Escape':
          stopGame();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.status, move, rotate, hardDrop, toggleFreeze, moveToEnd, stopGame]);

  const updateConfig = (dim: keyof GameState['config'], val: number) => {
    setGameState(prev => ({
      ...prev,
      config: { ...prev.config, [dim]: val },
      grid: dim === 'width' || dim === 'height' 
        ? Array.from({ length: dim === 'height' ? val : prev.config.height }, () => Array(dim === 'width' ? val : prev.config.width).fill(null))
        : prev.grid
    }));
  };

  const startGame = () => {
    const { width, height } = gameState.config;
    const p1 = getRandomPiece(width);
    const p2 = getRandomPiece(width);

    setGameState(prev => ({
      ...prev,
      grid: Array.from({ length: height }, () => Array(width).fill(null)),
      currentPiece: { ...p1, position: { x: Math.floor(width / 2) - Math.floor(p1.shape[0].length / 2), y: 0 } },
      nextPiece: p2,
      status: 'PLAYING',
      score: 0,
      lines: 0,
      level: 1,
      isFrozen: false,
      heldPiece: null,
      canHold: true
    }));
  };

  const getGhostPosition = () => {
    if (!gameState.currentPiece || gameState.isFrozen) return null;
    let dropY = 0;
    while (!checkCollision(gameState.currentPiece, gameState.grid, 0, dropY + 1)) {
      dropY++;
    }
    return {
      x: gameState.currentPiece.position.x,
      y: gameState.currentPiece.position.y + dropY
    };
  };

  const ghostPos = getGhostPosition();

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (gameState.status !== 'PLAYING') return;
    e.preventDefault();
    if (e.button === 0) move(-1, 0); // Left Click
    if (e.button === 2) move(1, 0);  // Right Click
    if (e.button === 1) hardDrop();  // Wheel Click
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (gameState.status !== 'PLAYING' || gameState.isFrozen) return;
    rotate(e.deltaY < 0);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-mono select-none overflow-hidden">
      <div className="fixed inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#334155_1px,transparent_1px)] bg-[length:24px_24px]" />
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row gap-8 items-start max-w-5xl w-full">
        
        {/* Left Panel */}
        <div className="flex flex-col gap-6 w-full lg:w-48">
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-sm shadow-2xl">
            <h1 className="text-2xl font-black italic tracking-tighter text-cyan-400 mb-2">NEON<br/>STACKER</h1>
            <div className="h-1 w-12 bg-cyan-500 rounded-full mb-6 shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
            
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Score</div>
                <div className="text-2xl font-mono text-white tabular-nums">{gameState.score.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Level</div>
                <div className="text-2xl font-mono text-white tabular-nums">{gameState.level}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-xs uppercase tracking-widest text-slate-500 px-2 font-bold">Tactics</div>
            <button 
              onClick={(e) => { e.stopPropagation(); toggleFreeze(); }}
              disabled={gameState.status !== 'PLAYING'}
              className={`w-full py-3 rounded-xl font-black text-[10px] tracking-[0.2em] transition-all transform active:scale-95 shadow-lg border-2 
                ${gameState.status === 'PLAYING' 
                  ? gameState.isFrozen 
                    ? 'bg-red-600 border-red-400 text-white shadow-red-900/60 animate-pulse' 
                    : 'bg-cyan-600 border-cyan-400 text-white shadow-cyan-900/40 hover:bg-cyan-500' 
                  : 'bg-slate-800 border-slate-700 text-slate-500 opacity-50 cursor-not-allowed'}`}
            >
              {gameState.isFrozen ? 'RELEASE' : 'FREEZE'}
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); stopGame(); }}
              disabled={gameState.status !== 'PLAYING' && gameState.status !== 'GAME_OVER'}
              className="w-full py-3 rounded-xl font-black text-[10px] tracking-[0.2em] transition-all transform active:scale-95 shadow-lg border-2 bg-slate-900 border-red-900/50 text-red-500 hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              TERMINATE
            </button>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-[9px] text-slate-400 leading-tight">
             <div className="text-slate-500 font-bold mb-2 uppercase tracking-widest">Neural Link</div>
             <div className="grid grid-cols-2 gap-y-2">
                <span className="text-cyan-500">M1/M3</span><span>L/R MOVE</span>
                <span className="text-cyan-500">M2_P</span><span>DROP</span>
                <span className="text-cyan-500">M2_S</span><span>ROTATE</span>
                <span className="text-cyan-500">ESC</span><span>STOP</span>
             </div>
          </div>
        </div>

        {/* Center: Game Container */}
        <div className="relative group">
          <div className={`absolute -inset-1 rounded-2xl blur opacity-75 transition-all duration-500 ${gameState.isFrozen ? 'bg-red-500/30' : 'bg-gradient-to-b from-cyan-500/20 to-purple-500/20'}`} />
          
          <div 
            className={`relative bg-slate-950 border-2 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-colors duration-500 ${gameState.isFrozen ? 'border-red-600' : 'border-slate-800'}`}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Grid Area */}
            <div 
              className="grid gap-[1px] bg-slate-800/20" 
              style={{ 
                gridTemplateColumns: `repeat(${gameState.config.width}, minmax(0, 1fr))`,
                width: `${gameState.config.width * 28}px`,
                height: `${gameState.config.height * 28}px`,
                maxWidth: '90vw',
                maxHeight: '80vh',
                minWidth: '200px',
                minHeight: '400px'
              }}
            >
              {gameState.grid.map((row, y) => 
                row.map((cell, x) => {
                  let blockColor = cell;
                  let isGhost = false;

                  if (!blockColor && ghostPos && gameState.currentPiece) {
                    const { shape } = gameState.currentPiece;
                    const relativeX = x - ghostPos.x;
                    const relativeY = y - ghostPos.y;
                    if (relativeX >= 0 && relativeX < shape[0].length && relativeY >= 0 && relativeY < shape.length && shape[relativeY][relativeX]) {
                      blockColor = gameState.currentPiece.color;
                      isGhost = true;
                    }
                  }

                  if (gameState.currentPiece) {
                    const { shape, position } = gameState.currentPiece;
                    const relativeX = x - position.x;
                    const relativeY = y - position.y;
                    if (relativeX >= 0 && relativeX < shape[0].length && relativeY >= 0 && relativeY < shape.length && shape[relativeY][relativeX]) {
                      blockColor = gameState.isFrozen ? FROZEN_COLOR : gameState.currentPiece.color;
                      isGhost = false;
                    }
                  }

                  return (
                    <div key={`${x}-${y}`} className="bg-slate-950/80">
                      {blockColor && <Block color={blockColor} isGhost={isGhost} />}
                    </div>
                  );
                })
              )}
            </div>

            {/* Start / Game Over Overlay */}
            {gameState.status !== 'PLAYING' && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
                {gameState.status === 'GAME_OVER' ? (
                  <div className="mb-8 w-full max-w-[280px]">
                    <div className="text-red-500 text-xs font-bold tracking-[0.5em] uppercase mb-4 animate-pulse">Connection Interrupted</div>
                    <div className="text-4xl font-black text-white italic mb-4">SESSION ENDED</div>
                    
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-6 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Final Score</span>
                        <span className="text-lg font-mono text-cyan-400">{gameState.score.toLocaleString()}</span>
                      </div>
                      <div className="h-[1px] bg-slate-800" />
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Lines Cleared</span>
                        <span className="text-lg font-mono text-white">{gameState.lines}</span>
                      </div>
                    </div>

                    <button 
                      onClick={stopGame}
                      className="text-xs text-slate-400 hover:text-white underline underline-offset-4 uppercase tracking-widest"
                    >
                      Return to calibration
                    </button>
                  </div>
                ) : (
                  <div className="mb-8">
                    <div className="text-cyan-400 text-xs font-bold tracking-[0.5em] uppercase mb-4">Core Calibration</div>
                    <div className="text-4xl font-black text-white italic uppercase tracking-tighter">NEON_STACKER_V2</div>
                  </div>
                )}

                {/* Configuration Sliders (Visible in IDLE state) */}
                {gameState.status === 'IDLE' && (
                  <div className="w-full max-w-[240px] space-y-6 mb-12">
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500">
                        <span>Grid Width</span>
                        <span className="text-cyan-400 font-mono">{gameState.config.width}</span>
                      </div>
                      <input 
                        type="range" min="6" max="20" step="1"
                        value={gameState.config.width}
                        onChange={(e) => updateConfig('width', parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500">
                        <span>Gravity Lag</span>
                        <span className="text-purple-400 font-mono">{gameState.config.baseSpeed}ms</span>
                      </div>
                      <input 
                        type="range" min="100" max="1000" step="50"
                        value={gameState.config.baseSpeed}
                        onChange={(e) => updateConfig('baseSpeed', parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>
                  </div>
                )}

                {gameState.status === 'IDLE' && (
                  <button 
                    onClick={startGame}
                    className="group relative px-12 py-4 bg-transparent border-2 border-cyan-500 text-cyan-400 rounded-full font-black text-sm tracking-[0.2em] transition-all hover:bg-cyan-500 hover:text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-cyan-500/60"
                  >
                    <span className="relative z-10">BOOT SYSTEM</span>
                    <div className="absolute inset-0 rounded-full bg-cyan-500 blur-md opacity-0 group-hover:opacity-40 transition-opacity"></div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex flex-col gap-6 w-full lg:w-64">
          <PiecePreview piece={gameState.nextPiece} label="Pipeline" />
          
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-sm flex-1 flex flex-col min-h-[160px]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
              <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Neural Link</div>
            </div>
            
            <div className="text-xs text-slate-400 italic font-mono leading-relaxed flex-1">
              "{coachComment}"
            </div>

            <div className="mt-6 pt-6 border-t border-slate-800/50">
              <div className="flex justify-between text-[10px] uppercase text-slate-600 mb-2">
                <span>Signal Strength</span>
                <span>{gameState.status === 'PLAYING' ? '98%' : '0%'}</span>
              </div>
              <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${gameState.isFrozen ? 'bg-red-500' : 'bg-cyan-500'}`} 
                  style={{ width: gameState.status === 'PLAYING' ? '98%' : '5%' }} 
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
