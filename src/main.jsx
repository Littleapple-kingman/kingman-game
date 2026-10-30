import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Trophy, Shell, Play, RotateCcw, Volume2, VolumeX, Crown, Smartphone } from 'lucide-react';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey && !supabaseUrl.includes('YOUR_PROJECT') && !supabaseKey.includes('YOUR_')
  ? createClient(supabaseUrl, supabaseKey) : null;
const LANES = [18, 50, 82];
const randomLane = () => Math.floor(Math.random() * 3);

function App() {
  const [status, setStatus] = useState('ready');
  const [lane, setLane] = useState(1);
  const [score, setScore] = useState(0);
  const [shells, setShells] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem('kingman-best') || 0));
  const [objects, setObjects] = useState([]);
  const [muted, setMuted] = useState(true);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('kingman-name') || 'KINGMAN');
  const [nameDraft, setNameDraft] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [onlineReady, setOnlineReady] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const gameRef = useRef({ lane: 1, score: 0, shells: 0, objects: [], lastSpawn: 0, lastFrame: 0, speed: 0.045, ended: false });
  const touchStart = useRef(null);

  const loadLeaderboard = useCallback(async () => {
    if (!supabase) { setOnlineReady(false); return; }
    const { data, error } = await supabase.from('kingman_scores').select('player_name, score, shells, created_at').order('score', { ascending: false }).limit(10);
    if (!error) { setLeaderboard(data || []); setOnlineReady(true); }
    else { setOnlineReady(false); console.warn('Leaderboard error:', error.message); }
  }, []);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const submitScore = useCallback(async (finalScore, finalShells) => {
    if (!supabase || finalScore <= 0) {
      setSavedMessage(supabase ? 'เล่นอีกครั้งเพื่อทำคะแนนให้สูงขึ้น!' : 'โหมดทดลอง: คะแนนเก็บไว้ในเครื่องนี้เท่านั้น');
      return;
    }
    const name = (playerName || 'KINGMAN').trim().slice(0, 18) || 'KINGMAN';
    const { error } = await supabase.from('kingman_scores').insert({ player_name: name, score: finalScore, shells: finalShells });
    if (error) setSavedMessage('ส่งคะแนนไม่สำเร็จ ลองใหม่อีกครั้ง');
    else { setSavedMessage('ส่งคะแนนขึ้นกระดานออนไลน์แล้ว!'); loadLeaderboard(); }
  }, [playerName, loadLeaderboard]);

  const endGame = useCallback(() => {
    const g = gameRef.current;
    if (g.ended) return;
    g.ended = true;
    setStatus('over');
    const finalScore = Math.floor(g.score);
    setScore(finalScore); setShells(g.shells);
    if (finalScore > best) { setBest(finalScore); localStorage.setItem('kingman-best', String(finalScore)); }
    submitScore(finalScore, g.shells);
  }, [best, submitScore]);

  const startGame = () => {
    gameRef.current = { lane: 1, score: 0, shells: 0, objects: [], lastSpawn: 0, lastFrame: 0, speed: 0.045, ended: false };
    setLane(1); setScore(0); setShells(0); setObjects([]); setSavedMessage(''); setStatus('playing');
  };

  const move = useCallback((dir) => {
    if (status !== 'playing') return;
    const g = gameRef.current;
    g.lane = Math.max(0, Math.min(2, g.lane + dir));
    setLane(g.lane);
  }, [status]);

  useEffect(() => {
    if (status !== 'playing') return;
    let raf;
    let lastPublish = 0;
    const tick = (now) => {
      const g = gameRef.current;
      if (!g.lastFrame) g.lastFrame = now;
      const dt = Math.min(40, now - g.lastFrame); g.lastFrame = now;
      if (g.ended) return;
      g.score += dt * 0.012;
      g.speed = Math.min(0.16, 0.045 + g.score / 18000);
      if (now - g.lastSpawn > Math.max(1100, 1800 - g.score / 12)) {
        const kind = Math.random() < 0.64 ? 'shell' : 'rock';
        let l = randomLane();
        if (g.objects.some(o => o.y < 15 && o.lane === l)) l = (l + 1) % 3;
        g.objects.push({ id: `${now}-${Math.random()}`, lane: l, y: -12, kind, hit: false });
        g.lastSpawn = now;
      }
      let didHit = false;
      g.objects = g.objects.map(o => {
        const next = { ...o, y: o.y + g.speed * dt };
        if (!next.hit && next.y > 72 && next.y < 88 && next.lane === g.lane) {
          next.hit = true;
          if (next.kind === 'shell') g.shells += 1;
          else didHit = true;
        }
        return next;
      }).filter(o => o.y < 115 && !(o.hit && o.kind === 'shell'));
      if (didHit) { setObjects([...g.objects]); endGame(); return; }
      if (now - lastPublish > 80) {
        setScore(Math.floor(g.score)); setShells(g.shells); setObjects([...g.objects]); lastPublish = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, endGame]);

  const handleTouchStart = (e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const handleTouchEnd = (e) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? -1 : 1);
    touchStart.current = null;
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') move(-1); if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') move(1); if (e.key === ' ' && status !== 'playing') startGame(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [move, status]);

  const saveName = () => { const n = nameDraft.trim().slice(0,18); if (n) { setPlayerName(n); localStorage.setItem('kingman-name', n); setNameDraft(''); } };

  return <main className="page">
    <header className="topbar"><div className="brand"><span className="brand-icon">K</span><div><strong>KINGMAN</strong><small>SHELL RUNNER</small></div></div><button className="sound-btn" onClick={() => setMuted(!muted)} aria-label="เสียง"><span>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</span></button></header>
    <section className="intro"><div className="eyebrow"><span className="pulse"/> ENDLESS RUNNER</div><h1>วิ่งเก็บกระดอง!</h1><p>ปัดซ้าย–ขวา หลบก้อนหิน เก็บกระดองให้ได้เยอะที่สุด</p></section>
    <div className="game-layout">
      <section className="game-column">
        <div className="stats"><div className="stat"><span>คะแนน</span><strong>{score.toLocaleString('th-TH')}</strong></div><div className="stat shell-stat"><span><Shell size={14}/> กระดอง</span><strong>{shells}</strong></div><div className="stat"><span>สถิติสูงสุด</span><strong>{best.toLocaleString('th-TH')}</strong></div></div>
        <div className="arena" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="sky-glow"/><div className="cloud cloud-one"/><div className="cloud cloud-two"/>
          <div className="track-label">KINGMAN IS ON THE RUN</div>
          <div className="track">
            <div className="lane-line line-one"/><div className="lane-line line-two"/>
            {objects.map(o => <div key={o.id} className={`object ${o.kind}`} style={{ left: `${LANES[o.lane]}%`, top: `${o.y}%` }}>{o.kind === 'shell' ? <span>🐢</span> : <span>🪨</span>}</div>)}
            <div className="runner" style={{ left: `${LANES[lane]}%` }}><div className="runner-shadow"/><img src="/kingman.png" alt="คิงแมน" draggable="false"/><span className="runner-tag">YOU</span></div>
          </div>
          {status !== 'playing' && <div className="overlay"><div className="overlay-card"><div className="mascot-mini"><img src="/kingman.png" alt="KINGMAN"/></div>{status === 'ready' ? <><div className="overlay-kicker">READY, SET, RUN!</div><h2>พร้อมลุยหรือยัง?</h2><p>เก็บกระดองให้ครบ หลบหินให้ไว!</p><button className="primary-btn" onClick={startGame}><Play size={18} fill="currentColor"/> เริ่มเล่นเลย</button></> : <><div className="overlay-kicker">GAME OVER</div><h2>เก่งมาก! ลองอีกครั้งไหม</h2><div className="result-row"><div><small>คะแนน</small><b>{score}</b></div><div><small>กระดอง</small><b>{shells} 🐢</b></div></div><button className="primary-btn" onClick={startGame}><RotateCcw size={18}/> เล่นอีกครั้ง</button><p className="save-message">{savedMessage}</p></>}</div></div>}
          <div className="swipe-hint"><Smartphone size={14}/> {status === 'playing' ? 'ปัดซ้าย / ขวาเพื่อเปลี่ยนเลน' : 'เล่นได้ทั้งมือถือและคอมพิวเตอร์'}</div>
        </div>
        <div className="mobile-controls"><button onClick={() => move(-1)} disabled={status !== 'playing'}>← ซ้าย</button><button onClick={() => move(1)} disabled={status !== 'playing'}>ขวา →</button></div>
        <div className="howto"><div className="how-icon">↔</div><div><strong>วิธีเล่น</strong><p>ปัดหน้าจอไปทางซ้ายหรือขวาเพื่อเปลี่ยนเลน เก็บ 🐢 เพื่อสะสมกระดอง และหลบ 🪨 ให้ดี!</p></div></div>
      </section>
      <aside className="side-column">
        <section className="panel profile-panel"><div className="panel-heading"><Crown size={18}/><h3>นักวิ่งของคุณ</h3></div><div className="profile"><img src="/kingman.png" alt="คิงแมน"/><div><strong>{playerName}</strong><span>นักเก็บกระดองมือใหม่</span></div><span className="level">LV.1</span></div><label className="field-label" htmlFor="nickname">ชื่อที่ใช้บนกระดานคะแนน</label><div className="name-form"><input id="nickname" value={nameDraft} maxLength={18} onChange={e => setNameDraft(e.target.value)} placeholder={playerName}/><button onClick={saveName}>บันทึก</button></div><p className="hint">ชื่อจะแสดงบนตารางอันดับออนไลน์</p></section>
        <section className="panel leaderboard"><div className="panel-heading"><Trophy size={18}/><h3>กระดานอันดับ</h3><span className={`online-pill ${onlineReady ? 'connected' : ''}`}><i/> {onlineReady ? 'ONLINE' : 'SETUP'}</span></div>{!supabase ? <div className="setup-note"><div className="trophy-illustration">🏆</div><strong>เปิดใช้คะแนนออนไลน์</strong><p>เชื่อมต่อ Supabase แล้วคะแนนของผู้เล่นทุกคนจะแสดงบนกระดานเดียวกัน</p><small>ตอนนี้ยังเล่นได้ตามปกติ แต่คะแนนออนไลน์ยังไม่เปิดใช้งาน</small></div> : leaderboard.length ? <div className="rank-list">{leaderboard.map((item,i)=><div className="rank-row" key={`${item.player_name}-${item.created_at}-${i}`}><span className={`rank-num rank-${i+1}`}>{i+1}</span><span className="rank-name">{item.player_name}</span><strong>{item.score.toLocaleString()}</strong></div>)}</div> : <div className="empty-ranks">ยังไม่มีคะแนน เริ่มเล่นเพื่อเป็นคนแรก!</div>}<button className="refresh-btn" onClick={loadLeaderboard}>↻ รีเฟรชอันดับ</button></section>
        <div className="tip-card"><span>💡</span><div><strong>ทิปจากคิงแมน</strong><p>อย่ามองแค่กระดองข้างหน้า คอยสังเกตก้อนหินด้วยนะ!</p></div></div>
      </aside>
    </div>
    <footer>© {new Date().getFullYear()} KINGMAN SHELL RUNNER <span>•</span> Made for fun 💜</footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
