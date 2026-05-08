<script lang="ts" module>
  export type ImgState = { file: File | null; preview: string | null; url: string | null };
  export type RichElement = { frontal: ImgState; refs: ImgState[]; voiceId: string };

  export function emptyRichElement(): RichElement {
    return { frontal: { file: null, preview: null, url: null }, refs: [], voiceId: '' };
  }
</script>

<script lang="ts">
  import { slide } from 'svelte/transition';

  let {
    elements = $bindable([]),
    disabled = false,
    voiceIdMode = 'enabled'
  }: {
    elements: RichElement[];
    disabled?: boolean;
    voiceIdMode?: 'enabled' | 'pending';
  } = $props();

  function emptyImage(): ImgState {
    return { file: null, preview: null, url: null };
  }

  function setSlot(slot: ImgState, file: File): ImgState {
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }

  function addElement() {
    elements.push(emptyRichElement());
  }

  function removeElement(i: number) {
    if (elements[i].frontal.preview) URL.revokeObjectURL(elements[i].frontal.preview!);
    elements[i].refs.forEach((r) => {
      if (r.preview) URL.revokeObjectURL(r.preview!);
    });
    elements.splice(i, 1);
  }

  function addRefToElement(i: number) {
    elements[i].refs.push(emptyImage());
  }

  function removeRefFromElement(i: number, j: number) {
    if (elements[i].refs[j].preview) URL.revokeObjectURL(elements[i].refs[j].preview!);
    elements[i].refs.splice(j, 1);
  }
</script>

<div class="elements-list">
  {#each elements as el, i (i)}
    <div class="element-rich-card" transition:slide={{ duration: 200 }}>
      <div class="element-head">
        <span class="ref-tag">@Element{i + 1}</span>
        <button
          type="button"
          class="ref-remove static"
          aria-label="Quitar elemento"
          onclick={() => removeElement(i)}
          {disabled}>×</button>
      </div>
      <div class="element-body">
        <div class="frontal">
          <span class="sub-label">Frontal</span>
          <label class="image-square frontal-square" class:filled={!!el.frontal.preview}>
            <input
              type="file"
              accept="image/*"
              {disabled}
              onchange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) elements[i].frontal = setSlot(el.frontal, f);
              }}
            />
            {#if el.frontal.preview}
              <img src={el.frontal.preview} alt="frontal" />
            {:else}
              <span class="big">+</span>
            {/if}
          </label>
        </div>
        <div class="refs">
          <span class="sub-label">Referencias</span>
          <div class="refs-grid">
            {#each el.refs as r, j (j)}
              <div class="ref-mini">
                <label class="image-square small" class:filled={!!r.preview}>
                  <input
                    type="file"
                    accept="image/*"
                    {disabled}
                    onchange={(e) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) elements[i].refs[j] = setSlot(r, f);
                    }}
                  />
                  {#if r.preview}
                    <img src={r.preview} alt={`ref ${j + 1}`} />
                  {:else}
                    <span class="big">+</span>
                  {/if}
                </label>
                <button
                  type="button"
                  class="mini-remove"
                  aria-label="Quitar ref"
                  onclick={() => removeRefFromElement(i, j)}
                  {disabled}>×</button>
              </div>
            {/each}
            <button
              type="button"
              class="add-mini"
              onclick={() => addRefToElement(i)}
              {disabled}>+</button>
          </div>
        </div>
      </div>
      <div class="voice-row">
        <span class="sub-label">
          Voice ID
          {#if voiceIdMode === 'pending'}
            <em>(deshabilitado por ahora — pendiente de habilitar cuando se confirme con créditos)</em>
          {:else}
            <em>(opcional)</em>
          {/if}
        </span>
        <input
          type="text"
          class="voice-input"
          bind:value={elements[i].voiceId}
          placeholder={voiceIdMode === 'pending' ? '(no funcional aun)' : 'ID de voz para este elemento'}
          disabled={disabled || voiceIdMode === 'pending'}
        />
      </div>
    </div>
  {/each}
  <button type="button" class="add-card" onclick={addElement} {disabled}>+ Elemento</button>
</div>

<style>
  .elements-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .element-rich-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.85rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
  }
  .element-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ref-tag {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    background: rgba(37, 99, 235, 0.2);
    border: 1px solid rgba(37, 99, 235, 0.4);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
  }
  .element-body {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    align-items: start;
  }
  .frontal,
  .refs {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .sub-label {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .frontal-square {
    width: 96px;
    height: 96px;
  }
  .image-square {
    position: relative;
    aspect-ratio: 1;
    background: #fff;
    border: 1.5px dashed #000;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .image-square.filled { border-style: solid; }
  .image-square input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .image-square img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .image-square .big {
    font-size: 1.5rem;
    color: rgba(0, 0, 0, 0.55);
    font-weight: 300;
  }
  .refs-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .ref-mini {
    position: relative;
  }
  .ref-mini .image-square {
    width: 56px;
    height: 56px;
  }
  .add-mini {
    width: 56px;
    height: 56px;
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: var(--text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }
  .add-mini:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text-primary);
  }
  .ref-remove,
  .mini-remove {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    width: 22px;
    height: 22px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border: none;
    border-radius: 50%;
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ref-remove.static {
    position: static;
  }
  .ref-remove:hover:not(:disabled),
  .mini-remove:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.85);
  }
  .add-card {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100px;
    padding: 0.65rem;
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-card);
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 0.9rem;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }
  .add-card:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text-primary);
  }
  .voice-row {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .voice-row .sub-label em {
    font-style: normal;
    color: var(--text-muted);
    font-size: 0.7rem;
    opacity: 0.8;
  }
  .voice-input {
    background: rgba(255, 255, 255, 0.04);
    border: var(--border-subtle);
    border-radius: 6px;
    padding: 0.4rem 0.65rem;
    color: var(--text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .voice-input:focus { border-color: var(--accent); }
  .voice-input::placeholder {
    color: var(--text-muted);
    font-family: var(--font-sans);
  }
</style>
