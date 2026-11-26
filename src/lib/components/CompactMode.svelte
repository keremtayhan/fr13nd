<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { isDesktop } from '$lib/runtime';
  import { store } from '$lib/store.svelte';
  import { EYE_FRAMES } from '$lib/eyeArt';
  import { localDay } from '$lib/day';

  let { onExpand }: { onExpand: () => void | Promise<void> } = $props();

  const eye = EYE_FRAMES[0];

  // star geometry — a 5-point star drawn at a few scales (layered outlines of
  // varying thickness), the largest filled near-black so the eye reads inside it.
  const cx = 230, cy = 212, baseR = 178, ratio = 0.4, pts = 5;
  function starPath(scale: number): string {
    let d = '';
    for (let i = 0; i < 2 * pts; i++) {
      const rad = (i % 2 ? baseR * ratio : baseR) * scale;
      const a = -Math.PI / 2 + (i * Math.PI) / pts;
      d += (i ? 'L' : 'M') + (cx + rad * Math.cos(a)).toFixed(1) + ' ' + (cy + rad * Math.sin(a)).toFixed(1);
    }
    return d + 'Z';
  }
  const layers = [
    { d: starPath(1.18), fill: '#070707', w: 0.8 },
    { d: starPath(1.09), fill: 'none', w: 1.4 },
    { d: starPath(1.0), fill: 'none', w: 2.6 },
  ];

  // clock-in / out timer
  let now = $state(Date.now());
  let fontTick = $state(0);
  onMount(() => {
    // Only tick / reshuffle while clocked IN and the window is visible. Clocked out
    // or minimized, nothing repaints, so fr13nd sits near-idle on the CPU.
    const live = () => clockedIn && !document.hidden;
    const t = setInterval(() => { if (live()) now = Date.now(); }, 1000);
    const ft = setInterval(() => { if (live()) fontTick = (fontTick + 1) % 997; }, 250); // ransom fonts, 4x/sec
    return () => { clearInterval(t); clearInterval(ft); };
  });
  const clockedIn = $derived(!!store.data.work.clockedInAt);
  const sessionSec = $derived.by(() => {
    now;
    const w = store.data.work;
    return w.clockedInAt ? Math.max(0, Math.floor((now - w.clockedInAt) / 1000)) : 0;
  });
  const todayMin = $derived.by(() => {
    now;
    const w = store.data.work;
    const key = localDay();
    const logged = w.log.filter((s) => localDay(new Date(s.start)) === key).reduce((a, s) => a + s.minutes, 0);
    return logged + Math.floor(sessionSec / 60);
  });
  const overtime = $derived(clockedIn && todayMin > store.data.work.targetMinutes);
  function fmtHMS(sec: number) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  // mixed-font timer: each glyph rendered in a different typeface
  const FONTS = [
    // gothic / blackletter
    "'UnifrakturCook', cursive", "'UnifrakturMaguntia', cursive", "'Pirata One', cursive", "'Metal Mania', cursive",
    "'Henny Penny', cursive", "'Old English Text MT', cursive", "'Blackadder ITC', cursive",
    // brutalist / heavy / industrial
    "'Anton', sans-serif", "'Archivo Black', sans-serif", "'Bebas Neue', sans-serif", "'Black Ops One', cursive",
    "'Rubik Mono One', monospace", "'Bungee', cursive", "'Bungee Inline', cursive", "'Monoton', cursive",
    "'Impact', sans-serif", "'Arial Black', sans-serif", "'Stencil', fantasy", "'Bauhaus 93', cursive", "'Broadway', cursive",
    // horror / weird / decorative
    "'Creepster', cursive", "'Nosifer', cursive", "'Eater', cursive", "'Rye', cursive", "'Frijole', cursive",
    "'Ewert', cursive", "'Fascinate', cursive", "'Faster One', cursive", "'Special Elite', cursive",
    "'Rubik Glitch', cursive", "'Rubik Wet Paint', cursive",
    "'Jokerman', cursive", "'Chiller', cursive", "'Algerian', fantasy", "'Curlz MT', cursive", "'Wide Latin', serif",
    // gothic / medieval (more)
    "'Grenze Gotisch', serif", "'New Rocker', cursive", "'Germania One', cursive", "'MedievalSharp', cursive", "'Cinzel Decorative', serif",
    // heavy / brutalist / stencil (more)
    "'Russo One', sans-serif", "'Titan One', cursive", "'Sigmar One', cursive", "'Passion One', sans-serif", "'Bowlby One', cursive",
    "'Bowlby One SC', cursive", "'Squada One', sans-serif", "'Staatliches', sans-serif", "'Oswald', sans-serif", "'Teko', sans-serif",
    "'Saira Stencil One', sans-serif", "'Wallpoet', cursive", "'Bungee Shade', cursive", "'Bungee Outline', cursive", "'Plaster', cursive",
    // sci-fi / tech / pixel / terminal
    "'Orbitron', sans-serif", "'Audiowide', cursive", "'Michroma', sans-serif", "'Syncopate', sans-serif", "'Press Start 2P', cursive",
    "'VT323', monospace", "'Major Mono Display', monospace", "'Codystar', cursive",
    // horror / distressed / glitch
    "'Butcherman', cursive", "'Griffy', cursive", "'Lacquer', cursive", "'Sancreek', cursive", "'Smokum', cursive",
    "'Vast Shadow', serif", "'Flavors', cursive", "'Slackey', cursive", "'Diplomata SC', cursive", "'Bahiana', cursive",
    "'Barrio', cursive", "'Kumar One', cursive", "'Londrina Sketch', cursive", "'Londrina Shadow', cursive", "'Trade Winds', cursive",
    "'Rubik Beastly', system-ui", "'Rubik Burned', system-ui", "'Rubik Distressed', system-ui", "'Rubik Maze', system-ui", "'Rubik Iso', system-ui",
    "'Rubik Spray Paint', system-ui", "'Rubik Puddles', system-ui", "'Rubik Microbe', system-ui", "'Rubik Vinyl', system-ui", "'Rubik Storm', system-ui",
    "'Rubik Marker Hatch', system-ui",
    // plain anchors
    "'Georgia', serif", "'Courier New', monospace", "'Times New Roman', serif",
  ];
  const timeStr = $derived(fmtHMS(clockedIn ? sessionSec : todayMin * 60));
  const timeChars = $derived(timeStr.split(''));

  function toggleClock() {
    if (store.data.work.clockedInAt) store.clockOut(); else store.clockIn();
    now = Date.now();
  }
  async function expand() { await onExpand(); }

  // drag the star to move the window; a click without a drag expands instead.
  let down: { x: number; y: number; moved: boolean } | null = null;
  function onDown(e: MouseEvent) { if (e.button !== 0) return; down = { x: e.clientX, y: e.clientY, moved: false }; }
  function onMove(e: MouseEvent) {
    if (!down || down.moved) return;
    if (Math.abs(e.clientX - down.x) > 4 || Math.abs(e.clientY - down.y) > 4) {
      down.moved = true;
      if (isDesktop()) void getCurrentWindow().startDragging();
    }
  }
  function onUp() { if (down && !down.moved) expand(); down = null; }
  function onKey(e: KeyboardEvent) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expand(); } }
</script>

<div class="star-compact" class:overtime>
  <div
    class="starwrap" role="button" tabindex="0" title="0uch!"
    onmousedown={onDown} onmousemove={onMove} onmouseup={onUp} onkeydown={onKey}
  >
    <svg class="stars" viewBox="0 0 460 430" aria-hidden="true">
      {#each layers as L}
        <path d={L.d} fill={L.fill} stroke="#fafafa" stroke-width={L.w} stroke-linejoin="miter" />
      {/each}
    </svg>
    <pre class="eye" aria-hidden="true">{eye}</pre>
    <div class="eye-glint" class:on={clockedIn}></div>
  </div>
  <button class="clock" onclick={toggleClock} title="clock in / out">
    {#each timeChars as ch, i (i)}<span class="dg" style="font-family:{FONTS[(i * 17 + fontTick * 7) % FONTS.length]}">{ch}</span>{/each}
  </button>
</div>

<style>
  .star-compact {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 100vh;
    padding: 8px 0 14px;
    background: transparent;
    user-select: none;
  }
  .starwrap { position: relative; width: 460px; max-width: 100%; height: 430px; flex-shrink: 0; cursor: grab; }
  .starwrap:active { cursor: grabbing; }
  .stars { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .eye {
    position: absolute;
    left: 50%;
    top: 46%;
    transform: translate(-50%, -50%);
    margin: 0;
    font-family: 'Consolas', 'SF Mono', ui-monospace, monospace;
    font-size: 3.45px;
    line-height: 3.45px;
    letter-spacing: 0;
    white-space: pre;
    color: #ececec;
  }
  .clock {
    display: flex;
    align-items: baseline;
    gap: 1px;
    background: none;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    font-size: 25px;
    font-weight: 500;
    color: #fafafa;
  }
  .clock .dg {
    line-height: 1;
    text-shadow: 0 0 4px #000, 0 1px 3px #000;
  }
  .eye-glint {
    position: absolute;
    left: 50%;
    top: 46%;
    transform: translate(-50%, -50%);
    width: 18px;
    height: 15px;
    border-radius: 50%;
    background: radial-gradient(circle, #ff2f2f 0%, rgba(255, 47, 47, 0.5) 44%, transparent 72%);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.5s ease;
  }
  .eye-glint.on { opacity: 0.95; animation: glint 1.7s ease-in-out infinite alternate; }
  @keyframes glint { to { opacity: 0.5; } }
  .star-compact.overtime .eye,
  .star-compact.overtime .stars path { animation: ot-pulse 0.9s ease-in-out infinite alternate; }
  @keyframes ot-pulse { to { opacity: 0.4; } }
  @media (prefers-reduced-motion: reduce) {
    .star-compact.overtime .eye, .star-compact.overtime .stars path { animation: none; }
  }
</style>
