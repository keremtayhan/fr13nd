<script lang="ts">
  // tiny inline trend line — give it numbers, it draws a normalized polyline.
  let {
    points = [],
    width = 96,
    height = 22,
    color = 'var(--gold)',
  }: { points?: number[]; width?: number; height?: number; color?: string } = $props();

  const path = $derived.by(() => {
    if (points.length < 2) return '';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const stepX = width / (points.length - 1);
    return points
      .map((p, i) => {
        const x = (i * stepX).toFixed(1);
        const y = (height - 1 - ((p - min) / span) * (height - 2)).toFixed(1);
        return `${i ? 'L' : 'M'}${x} ${y}`;
      })
      .join(' ');
  });
  const lastXY = $derived.by(() => {
    if (points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const x = width;
    const y = height - 1 - ((points[points.length - 1] - min) / span) * (height - 2);
    return { x, y };
  });
</script>

{#if points.length >= 2}
  <svg class="spark" viewBox="0 0 {width} {height}" width={width} height={height} preserveAspectRatio="none" aria-hidden="true">
    <path d={path} fill="none" stroke={color} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    {#if lastXY}<circle cx={lastXY.x} cy={lastXY.y} r="1.6" fill={color} />{/if}
  </svg>
{:else}
  <span class="spark-empty">— need 2+ —</span>
{/if}

<style>
  .spark { display: block; overflow: visible; }
  .spark-empty { font-size: 8px; color: var(--muted); letter-spacing: 0.04em; }
</style>
