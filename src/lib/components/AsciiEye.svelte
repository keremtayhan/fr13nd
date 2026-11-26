<script lang="ts">
  import { EYE_FRAMES } from '$lib/eyeArt';

  // fr13nd's avatar: the oracle eye. Static — but blinks once when you click him.
  // Still ignites gold->red when he's thinking. `compact` crops to the iris core
  // (+ inner lashes) and shrinks it to fit the compact window.
  let { busy = false, compact = false }: { busy?: boolean; compact?: boolean } = $props();
  const crop = (f: string) => f.split('\n').slice(10, 30).map((r) => r.slice(16, 62)).join('\n');
  const frames = $derived(compact ? EYE_FRAMES.map(crop) : EYE_FRAMES);
  let frame = $state(0);
  let blinking = false;

  function blink() {
    if (blinking) return;
    blinking = true;
    const last = EYE_FRAMES.length - 1;
    // close down to the shut frame, then back open
    const seq = [...Array(last + 1).keys()].slice(1).concat([...Array(last).keys()].reverse());
    let i = 0;
    const step = () => {
      frame = seq[i++];
      if (i < seq.length) setTimeout(step, 45);
      else { frame = 0; blinking = false; }
    };
    step();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); blink(); }
  }
</script>

<div
  class="eye"
  class:busy
  class:compact
  role="button"
  tabindex="0"
  aria-label="fr13nd"
  title="fr13nd — click to blink"
  onclick={blink}
  onkeydown={onKey}
>
  <pre class="eye-art" aria-hidden="true">{frames[frame]}</pre>
  <div class="eye-glow"></div>
</div>

<style>
  .eye {
    position: relative;
    display: grid;
    place-items: center;
    container-type: inline-size;
    padding: 10px 4px 6px;
    overflow: hidden;
    border-bottom: 1px solid color-mix(in srgb, var(--violet) 14%, var(--line));
    background: radial-gradient(54% 70% at 50% 50%, color-mix(in srgb, var(--gold) 7%, transparent), transparent 72%);
  }
  .eye-art {
    margin: 0;
    font-family: 'Consolas', 'SF Mono', ui-monospace, monospace;
    font-size: 6px;
    line-height: 1;
    letter-spacing: 0;
    white-space: pre;
    color: color-mix(in srgb, var(--gold) 74%, var(--muted));
    text-shadow: 0 0 4px color-mix(in srgb, var(--gold) 28%, transparent);
    transition: color .45s ease, text-shadow .45s ease;
    user-select: none;
  }
  @container (min-width: 1px) {
    .eye-art { font-size: min(7.6px, 2.7cqw); }
  }
  .eye.compact { padding: 2px 1px; border-bottom: none; }
  .eye.compact .eye-art { font-size: 2.6px; line-height: 2.6px; }
  .eye.compact .eye-glow { width: 30px; height: 22px; }
  .eye-glow {
    position: absolute;
    left: 50%; top: 50%;
    width: 54px; height: 40px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--gold) 42%, transparent), transparent 70%);
    opacity: .2;
    pointer-events: none;
    transition: opacity .45s ease;
  }
  .eye.busy .eye-art { color: color-mix(in srgb, var(--gold) 86%, var(--red)); text-shadow: 0 0 7px var(--gold); }
  .eye.busy .eye-glow { animation: eye-ignite .9s ease-in-out infinite alternate; }
  @keyframes eye-ignite {
    from { opacity: .4; background: radial-gradient(circle, color-mix(in srgb, var(--gold) 48%, transparent), transparent 70%); }
    to   { opacity: .85; background: radial-gradient(circle, color-mix(in srgb, var(--red) 62%, var(--gold)), transparent 72%); }
  }
  @media (prefers-reduced-motion: reduce) { .eye.busy .eye-glow { animation: none; } }
</style>
