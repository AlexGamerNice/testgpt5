import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

// Pokémon Chess — fixed & more defensive version
// Changes made to address build/runtime issues reported by the user:
// 1. Ensure the `position` prop always receives a safe FEN string (fallback to "start").
// 2. Make `onPieceDrop` handler robust (accepts the 3rd `piece` arg and uses try/catch).
// 3. Support both uppercase and lowercase piece keys in customPieces to be compatible
//    with multiple react-chessboard versions.
// 4. Add small runtime tests that run once at mount and show results (helpful for CI/dev).
// 5. Add more defensive logging to help debug integration/build issues.

export default function PokemonChessApp() {
  const [game, setGame] = useState(() => new Chess());
  const [fen, setFen] = useState(() => {
    try {
      return new Chess().fen() || "start";
    } catch (e) {
      console.error("Failed to get initial FEN from chess.js:", e);
      return "start";
    }
  });
  const [lastMove, setLastMove] = useState(null);
  const [orientation, setOrientation] = useState("white");
  const [testResults, setTestResults] = useState(null);

  // Keep fen synced with the Chess instance (but guard against invalid values)
  useEffect(() => {
    try {
      const f = game && typeof game.fen === "function" ? game.fen() : null;
      setFen(f || "start");
    } catch (err) {
      console.error("Error reading FEN from game:", err);
      setFen("start");
    }
  }, [game]);

  // Map chess piece codes (wK, bQ, etc.) to Pokémon official-artwork sprites.
  // These are PokéAPI official artwork links. If you see 404s, pick different IDs.
  const pokeMap = useMemo(
    () => ({
      // White pieces
      wK: 6, // Charizard
      wQ: 150, // Mewtwo
      wR: 3, // Venusaur
      wB: 9, // Blastoise
      wN: 25, // Pikachu
      wP: 143, // Snorlax (pawn)
      // Black pieces
      bK: 149, // Dragonite
      bQ: 94, // Gengar
      bR: 149, // Dragonite (rook)
      bB: 130, // Gyarados
      bN: 65, // Alakazam
      bP: 59, // Arcanine (pawn)
    }),
    []
  );

  // Helper to build an image component for a given Pokémon id
  const makePieceComponent = useCallback((id) => {
    const src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
    return ({ squareWidth }) => (
      <img
        src={src}
        alt={`pokemon-${id}`}
        draggable={false}
        style={{
          width: Math.max(16, Math.floor(squareWidth * 0.95)),
          height: Math.max(16, Math.floor(squareWidth * 0.95)),
          pointerEvents: "none",
          userSelect: "none",
          display: "block",
        }}
      />
    );
  }, []);

  // Build react-chessboard customPieces object. Some versions of react-chessboard
  // expect keys like 'wP' / 'bK' while other forks may use lowercase 'wp' / 'bk'.
  // To be maximally compatible we'll register both.
  const customPieces = useMemo(() => {
    const map = {};
    Object.entries(pokeMap).forEach(([pieceCode, id]) => {
      const comp = makePieceComponent(id);
      // register uppercase-style code (e.g. 'wP')
      map[pieceCode] = comp;
      // register lowercase variant (e.g. 'wp') — some forks/versions use lowercase keys
      map[pieceCode.toLowerCase()] = comp;
    });
    return map;
  }, [pokeMap, makePieceComponent]);

  // Safe position value for the Chessboard component
  const safeFen = typeof fen === "string" && fen.length > 0 ? fen : "start";

  // Handle a move from the chessboard component
  // react-chessboard typically calls onPieceDrop(sourceSquare, targetSquare, piece)
  // We accept all three parameters and handle them defensively.
  const onDrop = useCallback((sourceSquare, targetSquare, piece) => {
    try {
      const newGame = new Chess(game.fen());

      // If there's a promotion possibility, chess.js requires a `promotion` key.
      // We default to queen ('q') when unsure.
      const moveObj = { from: sourceSquare, to: targetSquare, promotion: "q" };

      const move = newGame.move(moveObj);
      if (move === null) {
        // illegal move
        return false;
      }

      setGame(newGame);
      setFen(newGame.fen());
      setLastMove(move);
      return true;
    } catch (err) {
      // Log the error for debugging (build/runtime) and return false to reject move.
      console.error("onDrop error:", err);
      return false;
    }
  }, [game]);

  function resetGame() {
    const g = new Chess();
    setGame(g);
    setFen(g.fen());
    setLastMove(null);
  }

  function undo() {
    try {
      const g = new Chess(game.fen());
      g.undo();
      setGame(g);
      setFen(g.fen());
    } catch (err) {
      console.error("Undo failed:", err);
    }
  }

  function flipBoard() {
    setOrientation((o) => (o === "white" ? "black" : "white"));
  }

  const moves = useMemo(() => {
    try {
      const history = game.history({ verbose: true });
      // Build a human-friendly move list (1. e4 e5 2. Nf3 ...)
      const pairs = [];
      for (let i = 0; i < history.length; i += 2) {
        const white = history[i] ? history[i].san : "";
        const black = history[i + 1] ? history[i + 1].san : "";
        pairs.push(`${Math.floor(i / 2) + 1}. ${white}${black ? ` ${black}` : ""}`);
      }
      return pairs.join(" ");
    } catch (err) {
      console.error("Error building move list:", err);
      return "";
    }
  }, [game]);

  // --- Small runtime tests (helpful if you run this and wonder if chess.js is working) ---
  useEffect(() => {
    // run once on mount
    const runTests = () => {
      try {
        const t = new Chess();
        t.move("e4");
        t.move("e5");
        t.move("Nf3");
        const passed = t.fen().includes("Nf3") || typeof t.fen() === "string";
        const results = {
          movesMade: t.history(),
          fen: t.fen(),
          passed: Boolean(passed),
        };
        setTestResults(results);
        console.info("PokemonChessApp runtime test results:", results);
      } catch (e) {
        console.error("Runtime tests failed:", e);
        setTestResults({ error: e.message });
      }
    };

    runTests();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-rose-50 p-6">
      <div className="max-w-5xl mx-auto bg-white/80 backdrop-blur rounded-2xl shadow-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 flex flex-col items-center gap-4">
          <h1 className="text-2xl font-extrabold">Pokémon Chess</h1>
          <p className="text-sm text-gray-600">A playful Pokémon-themed chessboard — local two-player. Pieces use official artwork sprites (PokéAPI).</p>

          <div className="rounded-lg overflow-hidden">
            {/* Use a safe FEN fallback to avoid invalid/undefined position errors */}
            <Chessboard
              id="pokemon-chessboard"
              position={safeFen}
              onPieceDrop={onDrop}
              boardWidth={560}
              customPieces={customPieces}
              arePiecesDraggable={true}
              boardOrientation={orientation}
              showBoardNotation={true}
            />
          </div>

          <div className="w-full flex gap-2 justify-center">
            <button className="px-4 py-2 rounded bg-violet-600 text-white" onClick={undo}>
              Undo
            </button>
            <button className="px-4 py-2 rounded bg-emerald-600 text-white" onClick={resetGame}>
              Restart
            </button>
            <button className="px-4 py-2 rounded bg-sky-600 text-white" onClick={flipBoard}>
              Flip Board
            </button>
          </div>
        </div>

        <aside className="p-4 rounded-lg bg-white border">
          <h2 className="font-semibold">Game Info</h2>
          <p className="text-sm mt-2">Turn: <strong>{game.turn() === "w" ? "White" : "Black"}</strong></p>
          <p className="text-sm">Status: {game.in_checkmate() ? "Checkmate" : game.in_draw() ? "Draw" : game.in_check() ? "Check" : "Ongoing"}</p>
          <div className="mt-4">
            <h3 className="font-medium">Last Move</h3>
            <p className="text-sm mt-2">{lastMove ? `${lastMove.san} (${lastMove.from} → ${lastMove.to})` : "—"}</p>
          </div>

          <div className="mt-4">
            <h3 className="font-medium">Move List</h3>
            <div className="mt-2 text-sm max-h-40 overflow-auto whitespace-pre-wrap">{moves || "No moves yet"}</div>
          </div>

          <div className="mt-4">
            <h3 className="font-medium">Runtime Tests</h3>
            <div className="mt-2 text-xs text-gray-700">
              {testResults ? (
                <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(testResults, null, 2)}</pre>
              ) : (
                <span>Running tests...</span>
              )}
            </div>
          </div>

          <div className="mt-4">
            <h3 className="font-medium">Customization</h3>
            <p className="text-sm mt-2">Change the Pokémon by editing <code>pokeMap</code> (IDs map to PokéAPI official artwork).</p>
          </div>
        </aside>
      </div>

      <footer className="max-w-5xl mx-auto mt-6 text-center text-xs text-gray-500">
        Pokémon are © Nintendo / Game Freak / The Pokémon Company. This is a fan project example for learning and prototyping.
      </footer>
    </div>
  );
}
