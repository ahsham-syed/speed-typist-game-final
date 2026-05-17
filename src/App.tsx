/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  Trophy, 
  Zap, 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX,
  Keyboard,
  Shield,
  Ghost
} from 'lucide-react';
import { WORD_LIST } from './constants/words';

// --- Types ---

type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
type GameMode = 'EASY' | 'MEDIUM' | 'HARD' | 'SURVIVAL';
type PowerUpType = 'FREEZE' | 'DOUBLE_SCORE' | 'EXTRA_LIFE' | 'NONE';

interface GameWord {
  id: string;
  text: string;
  x: number;
  y: number;
  speed: number;
  width: number;
  powerUp: PowerUpType;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

// --- Constants ---

const INITIAL_LIVES = 5;
const SPAWN_INTERVAL = 2000;
const SPEED_INCREMENT = 0.05;
const BASE_SPEED = 1.5;

// --- Helper Components ---

const ParticleSystem = ({ particles }: { particles: Particle[] }) => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    {particles.map(p => (
      <div 
        key={p.id}
        className="absolute w-1.5 h-1.5 rounded-full"
        style={{ 
          left: `${p.x}px`, 
          top: `${p.y}px`, 
          backgroundColor: p.color,
          opacity: p.life,
          transform: `scale(${p.life})`
        }}
      />
    ))}
  </div>
);

// --- Main App ---

export default function App() {
  // Game State
  const [gameState, setGameState] = useState<GameState>('START');
  const [gameMode, setGameMode] = useState<GameMode>('MEDIUM');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [level, setLevel] = useState(1);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [words, setWords] = useState<GameWord[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  // Power-up States
  const [isFrozen, setIsFrozen] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const freezeTimeoutRef = useRef<number>(null);
  const multiplierTimeoutRef = useRef<number>(null);
  const gameLoopRef = useRef<number>(null);
  const wordsRef = useRef<GameWord[]>([]);
  const lastSpawnRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load High Score
  useEffect(() => {
    const saved = localStorage.getItem('speedTypedHighScore');
    if (saved) setHighScore(parseInt(saved));
  }, []);

  // Audio Context (Synthesized sounds for zero dependencies)
  const playSound = useCallback((type: 'correct' | 'miss' | 'gameover' | 'level' | 'type') => {
    if (isMuted) return;
    
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      const now = audioCtx.currentTime;
      
      switch(type) {
        case 'type':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          osc.start();
          osc.stop(now + 0.1);
          break;
        case 'correct':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          osc.start();
          osc.stop(now + 0.2);
          break;
        case 'miss':
          osc.type = 'square';
          osc.frequency.setValueAtTime(110, now);
          osc.frequency.exponentialRampToValueAtTime(55, now + 0.3);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          osc.start();
          osc.stop(now + 0.3);
          break;
        case 'gameover':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.linearRampToValueAtTime(110, now + 1);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.linearRampToValueAtTime(0, now + 1);
          osc.start();
          osc.stop(now + 1);
          break;
      }
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }, [isMuted]);

  // Create Explosion
  const createExplosion = useCallback((x: number, y: number, color: string = '#00f3ff') => {
    const newParticles: Particle[] = Array.from({ length: 15 }).map(() => ({
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 1.0,
      color
    }));
    setParticles(prev => [...prev, ...newParticles]);
  }, []);

  // Spawn Word
  const spawnWord = useCallback(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.offsetWidth;
    const wordText = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    
    // Prevent duplicates on screen
    if (wordsRef.current.some(w => w.text === wordText)) return;

    // Determine Power-up
    let powerUp: PowerUpType = 'NONE';
    const rand = Math.random();
    if (rand < 0.05) powerUp = 'FREEZE';
    else if (rand < 0.10) powerUp = 'DOUBLE_SCORE';
    else if (rand < 0.12) powerUp = 'EXTRA_LIFE';

    // Difficulty adjust based on mode
    let modeMultiplier = 1;
    if (gameMode === 'EASY') modeMultiplier = 0.7;
    if (gameMode === 'HARD') modeMultiplier = 1.3;
    if (gameMode === 'SURVIVAL') modeMultiplier = 1 + (level * 0.1);

    const newWord: GameWord = {
      id: Math.random().toString(36).substr(2, 9),
      text: wordText,
      x: Math.random() * (containerWidth - 150) + 75,
      y: -50,
      speed: (BASE_SPEED + (level - 1) * SPEED_INCREMENT) * modeMultiplier,
      width: wordText.length * 10,
      powerUp
    };

    wordsRef.current = [...wordsRef.current, newWord];
    setWords([...wordsRef.current]);
  }, [level]);

  // Game Loop
  const tick = useCallback((time: number) => {
    if (gameState !== 'PLAYING') return;

    // Word Movement
    let healthLost = 0;
    const ground = containerRef.current?.offsetHeight || 800;

    wordsRef.current = wordsRef.current.filter(word => {
      if (!isFrozen) {
        word.y += word.speed;
      }
      if (word.y > ground - 40) { // Hit "floor"
        healthLost++;
        createExplosion(word.x, ground - 40, '#ff00ff');
        playSound('miss');
        return false;
      }
      return true;
    });

    if (healthLost > 0) {
      setLives(prev => {
        const next = prev - healthLost;
        if (next <= 0) {
          setGameState('GAME_OVER');
          playSound('gameover');
          return 0;
        }
        return next;
      });
      setCombo(0);
    }

    // Spawning
    const currentSpawnInterval = Math.max(800, SPAWN_INTERVAL - (level - 1) * 150);
    if (time - lastSpawnRef.current > currentSpawnInterval) {
      spawnWord();
      lastSpawnRef.current = time;
    }

    // Particle update
    setParticles(prev => 
      prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.1, // gravity
          life: p.life - 0.02
        }))
        .filter(p => p.life > 0)
    );

    setWords([...wordsRef.current]);
    gameLoopRef.current = requestAnimationFrame(tick);
  }, [gameState, level, spawnWord, createExplosion, playSound]);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      gameLoopRef.current = requestAnimationFrame(tick);
    } else {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    }
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState, tick]);

  // Input Handling
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().trim();
    setInputValue(value);
    playSound('type');

    const matchedWord = wordsRef.current.find(w => w.text.toLowerCase() === value);
    if (matchedWord) {
      // Trigger Power-up
      if (matchedWord.powerUp === 'FREEZE') {
        setIsFrozen(true);
        if (freezeTimeoutRef.current) clearTimeout(freezeTimeoutRef.current);
        freezeTimeoutRef.current = window.setTimeout(() => setIsFrozen(false), 5000);
      } else if (matchedWord.powerUp === 'DOUBLE_SCORE') {
        setMultiplier(2);
        if (multiplierTimeoutRef.current) clearTimeout(multiplierTimeoutRef.current);
        multiplierTimeoutRef.current = window.setTimeout(() => setMultiplier(1), 10000);
      } else if (matchedWord.powerUp === 'EXTRA_LIFE') {
        setLives(prev => Math.min(INITIAL_LIVES, prev + 1));
      }

      // Correct!
      setScore(prev => {
        const newScore = prev + (matchedWord.text.length * level * Math.max(1, Math.floor(combo / 5))) * multiplier;
        if (newScore > highScore) {
          setHighScore(newScore);
          localStorage.setItem('speedTypedHighScore', newScore.toString());
        }
        return newScore;
      });
      
      setCombo(prev => {
        const next = prev + 1;
        if (next > maxCombo) setMaxCombo(next);
        return next;
      });

      // Leveling up
      if (score > level * 500) {
        setLevel(prev => prev + 1);
        playSound('correct'); // could be level up sound
      }

      createExplosion(matchedWord.x, matchedWord.y, '#00f3ff');
      playSound('correct');

      wordsRef.current = wordsRef.current.filter(w => w.id !== matchedWord.id);
      setWords([...wordsRef.current]);
      setInputValue('');
    }
  };

  const startGame = () => {
    setScore(0);
    setLives(INITIAL_LIVES);
    setLevel(1);
    setCombo(0);
    setWords([]);
    wordsRef.current = [];
    setInputValue('');
    setGameState('PLAYING');
    lastSpawnRef.current = performance.now();
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none" ref={containerRef}>
      {/* Background Effect */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_50%,#001a33,black)] opacity-60" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
      
      {/* HUD */}
      {gameState !== 'START' && (
        <div className="absolute top-0 left-0 right-0 p-6 z-20 flex justify-between items-start">
          <div className="flex gap-4">
            <div className="glass-panel px-4 py-2 flex flex-col items-center min-w-[100px]">
              <span className="text-[10px] text-white/50 uppercase tracking-widest">Score</span>
              <span className="text-2xl font-bold neon-text-blue">{score.toLocaleString()}</span>
            </div>
            <div className="glass-panel px-4 py-2 flex flex-col items-center min-w-[100px]">
              <span className="text-[10px] text-white/50 uppercase tracking-widest">Combo</span>
              <span className="text-2xl font-bold neon-text-pink">{combo}x</span>
            </div>
            <div className="glass-panel px-4 py-2 flex flex-col items-center min-w-[80px]">
              <span className="text-[10px] text-white/50 uppercase tracking-widest">Level</span>
              <span className="text-2xl font-bold text-white">{level}</span>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="glass-panel px-4 py-2 flex flex-col items-center min-w-[100px]">
              <span className="text-[10px] text-white/50 uppercase tracking-widest">Lives</span>
              <div className="flex gap-1 mt-1">
                {Array.from({ length: INITIAL_LIVES }).map((_, i) => (
                  <Heart 
                    key={i} 
                    size={16} 
                    fill={i < lives ? "#ff00ff" : "transparent"} 
                    color={i < lives ? "#ff00ff" : "rgba(255,255,255,0.2)"}
                    className={i < lives ? "drop-shadow-[0_0_5px_#ff00ff]" : ""}
                  />
                ))}
              </div>
            </div>
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="glass-panel p-3 hover:bg-white/10 transition-colors"
            >
              {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
            <button 
              onClick={() => setGameState(gameState === 'PLAYING' ? 'PAUSED' : 'PLAYING')}
              className="glass-panel p-3 hover:bg-white/10 transition-colors"
            >
              {gameState === 'PAUSED' ? <Play size={24} /> : <Pause size={24} />}
            </button>
          </div>
        </div>
      )}

      {/* Main Game Stage */}
      <div className="relative w-full h-full flex flex-col items-center justify-end pb-24 z-10">
        <ParticleSystem particles={particles} />
        
        <AnimatePresence>
          {words.map(word => (
            <motion.div
              key={word.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                x: word.x, 
                y: word.y,
                filter: isFrozen ? 'hue-rotate(180deg) brightness(1.5)' : 'none'
              }}
              exit={{ opacity: 0, scale: 1.5, filter: 'blur(10px)' }}
              className={`absolute text-xl font-bold tracking-tight px-4 py-1.5 rounded-full glass-panel border-2 transition-colors ${
                word.powerUp === 'FREEZE' ? 'border-cyan-400 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]' :
                word.powerUp === 'DOUBLE_SCORE' ? 'border-yellow-400 text-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]' :
                word.powerUp === 'EXTRA_LIFE' ? 'border-green-400 text-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]' :
                'border-neon-blue neon-text-blue'
              }`}
              style={{ x: word.x, y: word.y }}
            >
              {word.text}
              {word.powerUp !== 'NONE' && (
                <div className="absolute -top-3 -right-2 bg-white text-black text-[10px] px-1 rounded font-black animate-bounce">
                  {word.powerUp === 'FREEZE' ? 'ICE' : word.powerUp === 'DOUBLE_SCORE' ? '2X' : '+1UP'}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Input Area */}
        {gameState === 'PLAYING' && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-md px-4"
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-neon-blue to-neon-pink rounded-2xl blur opacity-25 group-focus-within:opacity-75 transition duration-1000 group-hover:duration-200"></div>
              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                spellCheck={false}
                autoComplete="off"
                className="relative w-full bg-black/80 border-2 border-white/10 rounded-xl px-6 py-4 text-2xl font-mono text-center tracking-widest focus:outline-none focus:border-neon-blue transition-all"
                placeholder="TYPE TO DESTROY"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30">
                <Keyboard size={20} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl"
          >
            <div className="text-center max-w-2xl px-6">
              <motion.div 
                animate={{ scale: [1, 1.05, 1] }} 
                transition={{ repeat: Infinity, duration: 3 }}
                className="mb-8"
              >
                <h1 className="text-8xl font-black italic tracking-tighter mb-2">
                  SPEED <span className="neon-text-blue">TYPIST</span>
                </h1>
                <p className="text-white/60 tracking-[0.4em] uppercase text-sm">Arcade Reality Processor</p>
              </motion.div>

              <div className="grid grid-cols-3 gap-6 mb-12">
                <div className="glass-panel p-6">
                  <Zap className="mx-auto mb-2 neon-text-blue" />
                  <h3 className="font-bold text-lg">Hyper-Speed</h3>
                  <p className="text-xs text-white/40">Increasing velocity</p>
                </div>
                <div className="glass-panel p-6">
                  <Shield className="mx-auto mb-2 neon-text-pink" />
                  <h3 className="font-bold text-lg">Defend Core</h3>
                  <p className="text-xs text-white/40">5 hearts initial</p>
                </div>
                <div className="glass-panel p-6">
                  <Ghost className="mx-auto mb-2 text-neon-green/80" />
                  <h3 className="font-bold text-lg">Neon Style</h3>
                  <p className="text-xs text-white/40">Cyber-physics enabled</p>
                </div>
              </div>

              <div className="flex flex-col gap-4 mb-12">
                <p className="text-white/40 uppercase tracking-widest text-xs">Select Mode</p>
                <div className="flex justify-center gap-2">
                  {(['EASY', 'MEDIUM', 'HARD', 'SURVIVAL'] as GameMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setGameMode(mode)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        gameMode === mode 
                        ? 'bg-neon-blue text-black shadow-[0_0_15px_rgba(0,243,255,0.5)]' 
                        : 'bg-white/5 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={startGame}
                className="group relative px-12 py-5 bg-white text-black font-black text-2xl rounded-full overflow-hidden transition-all hover:pr-16 active:scale-95"
              >
                <div className="absolute inset-0 bg-neon-blue translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <span className="relative z-10 flex items-center gap-2">
                  INITIATE SYSTEM <Play size={24} fill="currentColor" />
                </span>
              </button>

              <div className="mt-8 text-white/30 flex items-center justify-center gap-4">
                <span className="flex items-center gap-2">
                  <Trophy size={16} /> HIGH SCORE: {highScore.toLocaleString()}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'PAUSED' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="text-center glass-panel p-12">
              <h2 className="text-4xl font-bold mb-8">SYSTEM PAUSED</h2>
              <button 
                onClick={() => setGameState('PLAYING')}
                className="px-8 py-4 bg-neon-blue text-black font-black rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                RESUME <Play size={20} fill="currentColor" />
              </button>
            </div>
          </motion.div>
        )}

        {gameState === 'GAME_OVER' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-2xl"
          >
            <div className="text-center">
              <h2 className="text-7xl font-black mb-2 text-white italic">SYSTEM <span className="text-neon-pink">FAILURE</span></h2>
              <p className="text-white/40 uppercase tracking-widest mb-12">All lives consumed</p>
              
              <div className="grid grid-cols-2 gap-8 max-w-md mx-auto mb-12">
                <div className="glass-panel p-8">
                  <p className="text-white/50 text-xs uppercase mb-1">Final Score</p>
                  <p className="text-4xl font-bold neon-text-blue">{score.toLocaleString()}</p>
                </div>
                <div className="glass-panel p-8">
                  <p className="text-white/50 text-xs uppercase mb-1">Max Combo</p>
                  <p className="text-4xl font-bold neon-text-pink">{maxCombo}x</p>
                </div>
              </div>

              <div className="flex gap-4 justify-center">
                <button 
                  onClick={startGame}
                  className="px-10 py-5 bg-white text-black font-black text-xl rounded-full hover:bg-neon-blue transition-colors flex items-center gap-2"
                >
                  REBOOT SYSTEM <RotateCcw size={20} />
                </button>
                <button 
                  onClick={() => setGameState('START')}
                  className="px-10 py-5 glass-panel text-white font-bold text-xl rounded-full hover:bg-white/10 transition-colors"
                >
                  EXIT TO HUB
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative Floor */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-neon-pink to-transparent opacity-50 blur-[2px]" />
      <div className="absolute bottom-0 left-0 right-0 h-[80px] bg-gradient-to-t from-neon-pink/10 to-transparent pointer-events-none" />
    </div>
  );
}
