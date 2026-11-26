<script lang="ts">
  import { store } from '$lib/store.svelte';
  import type { Recipe } from '$lib/types';
  import { localDay } from '$lib/day';

  let selectedId = $state<string | null>(null);
  let addOpen    = $state(false);
  let editingId  = $state<string | null>(null);

  let newTitle       = $state('');
  let newTags        = $state('');
  let newIngredients = $state('');
  let newSteps       = $state('');

  let editTitle       = $state('');
  let editTags        = $state('');
  let editIngredients = $state('');
  let editSteps       = $state('');

  const selected = $derived(store.data.recipes.find(r => r.id === selectedId) ?? null);

  function selectRecipe(r: Recipe) {
    if (selectedId === r.id) { selectedId = null; return; }
    selectedId = r.id;
    editingId  = null;
  }

  function markCooked(r: Recipe) {
    r.lastCooked = localDay();
    store.save();
  }

  function startEdit(r: Recipe) {
    editingId       = r.id;
    editTitle       = r.title;
    editTags        = r.tags;
    editIngredients = r.ingredients;
    editSteps       = r.steps;
  }

  function saveEdit(r: Recipe) {
    r.title       = editTitle.trim() || r.title;
    r.tags        = editTags;
    r.ingredients = editIngredients;
    r.steps       = editSteps;
    editingId     = null;
    store.save();
  }

  function deleteRecipe(id: string) {
    store.data.recipes = store.data.recipes.filter(r => r.id !== id);
    selectedId = null;
    store.save();
  }

  function addRecipe() {
    const t = newTitle.trim();
    if (!t) return;
    store.data.recipes.push({
      id: store.newId(),
      title: t,
      tags: newTags,
      ingredients: newIngredients,
      steps: newSteps,
      lastCooked: '',
    });
    store.save();
    newTitle = ''; newTags = ''; newIngredients = ''; newSteps = '';
    addOpen = false;
  }
</script>

<div class="panel">
  <div class="list">
    {#each store.data.recipes as r (r.id)}
      <div class="recipe-block">
        <div role="button" tabindex="0" onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectRecipe(r); } }} class="recipe-row" class:open={selectedId === r.id} onclick={() => selectRecipe(r)}>
          <span class="title">{r.title}</span>
          {#if r.tags}
            <span class="tags muted">{r.tags}</span>
          {/if}
          {#if r.lastCooked}
            <span class="cooked muted">{r.lastCooked}</span>
          {/if}
        </div>

        {#if selectedId === r.id}
          {#if editingId === r.id}
            <div class="detail edit-form">
              <input bind:value={editTitle} placeholder="title" />
              <input bind:value={editTags} placeholder="tags" />
              <textarea bind:value={editIngredients} rows="3" placeholder="ingredients (semicolon-separated)"></textarea>
              <textarea bind:value={editSteps} rows="4" placeholder="steps"></textarea>
              <div class="row-actions">
                <button class="btn btn-gold" onclick={() => saveEdit(r)}>[SAVE]</button>
                <button class="btn" onclick={() => editingId = null}>[CANCEL]</button>
                <button class="btn" style="color:var(--red);" onclick={() => deleteRecipe(r.id)}>[DEL]</button>
              </div>
            </div>
          {:else}
            <div class="detail">
              {#if r.ingredients}
                <div class="section-label muted">INGREDIENTS</div>
                <div class="detail-text">{r.ingredients.replace(/;/g, '\n·')}</div>
              {/if}
              {#if r.steps}
                <div class="section-label muted">STEPS</div>
                <div class="detail-text">{r.steps}</div>
              {/if}
              <div class="row-actions">
                <button class="btn btn-gold" onclick={() => markCooked(r)}>[COOKED TODAY]</button>
                <button class="btn" onclick={() => startEdit(r)}>[EDIT]</button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/each}

    {#if store.data.recipes.length === 0}
      <div class="empty muted">— no recipes —</div>
    {/if}
  </div>

  <hr class="divider" />

  {#if addOpen}
    <div class="add-form">
      <input bind:value={newTitle} placeholder="recipe name" />
      <input bind:value={newTags} placeholder="tags (fast, batch, comfort...)" />
      <textarea bind:value={newIngredients} rows="3" placeholder="ingredients; separated; like; this"></textarea>
      <textarea bind:value={newSteps} rows="3" placeholder="steps"></textarea>
      <div class="row-actions">
        <button class="btn btn-gold" onclick={addRecipe}>[ADD]</button>
        <button class="btn" onclick={() => addOpen = false}>[CANCEL]</button>
      </div>
    </div>
  {:else}
    <button class="add-btn" onclick={() => addOpen = true}>+ new recipe</button>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .list {
    flex: 1;
    overflow-y: auto;
  }
  .recipe-block {
    border-bottom: 1px solid var(--line);
  }
  .recipe-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 6px 8px;
    cursor: pointer;
  }
  .recipe-row:hover .title { color: var(--gold); }
  .recipe-row.open .title  { color: var(--gold); }
  .title   { font-size: 12px; flex: 1; }
  .tags    { font-size: 10px; }
  .cooked  { font-size: 10px; flex-shrink: 0; }
  .detail  {
    padding: 6px 8px 8px 8px;
    background: var(--panel2);
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .section-label {
    font-size: 9px;
    letter-spacing: 0.1em;
    margin-top: 2px;
  }
  .detail-text {
    font-size: 11px;
    white-space: pre-wrap;
    line-height: 1.6;
  }
  .row-actions { display: flex; gap: 6px; }
  .add-form {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }
  .edit-form { padding: 6px 8px; }
  .add-btn {
    padding: 8px;
    font-size: 11px;
    color: var(--muted);
    text-align: left;
    width: 100%;
  }
  .add-btn:hover { color: var(--gold); }
  .empty {
    padding: 16px;
    text-align: center;
    font-size: 11px;
  }
</style>
