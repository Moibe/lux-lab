<script lang="ts">
  export type ImageSlotState = {
    file: File | null;
    preview: string | null;
    url: string | null;
  };

  let {
    state = $bindable({ file: null, preview: null, url: null }),
    disabled = false,
    accept = 'image/*',
    placeholder = 'Imagen',
    placeholderHint = '',
    optional = false,
    minHeight = '10rem'
  }: {
    state: ImageSlotState;
    disabled?: boolean;
    accept?: string;
    placeholder?: string;
    placeholderHint?: string;
    optional?: boolean;
    minHeight?: string;
  } = $props();

  function onFileChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (state.preview) URL.revokeObjectURL(state.preview);
    state = { file: f, preview: URL.createObjectURL(f), url: null };
  }

  function clearImage(e: Event) {
    e.preventDefault();
    if (state.preview) URL.revokeObjectURL(state.preview);
    state = { file: null, preview: null, url: null };
  }
</script>

<label class="image-slot" class:filled={!!state.preview} class:optional style="--min-h: {minHeight};">
  <input type="file" {accept} {disabled} onchange={onFileChange} />
  {#if state.preview}
    <img src={state.preview} alt={placeholder} />
    <button type="button" class="clear" aria-label="Quitar imagen" onclick={clearImage}>×</button>
  {:else}
    <span class="placeholder">
      <span class="big">+</span>
      <span class="hint">
        {placeholder}
        {#if placeholderHint}<br /><small>{placeholderHint}</small>{/if}
      </span>
    </span>
  {/if}
</label>

<style>
  .image-slot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: var(--min-h, 10rem);
    background: #fff;
    border: 1.5px dashed #000;
    border-radius: var(--radius-card);
    color: #000;
    cursor: pointer;
    box-shadow: var(--shadow-card);
    overflow: hidden;
    transition: border-style var(--transition-fast);
  }
  .image-slot.optional { border-color: rgba(0, 0, 0, 0.5); }
  .image-slot:hover { border-style: solid; }
  .image-slot.filled { border-style: solid; padding: 0; }
  .image-slot input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .image-slot input[type='file']:disabled { cursor: not-allowed; }
  .image-slot img {
    width: 100%;
    height: 100%;
    max-height: 16rem;
    object-fit: cover;
  }
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 1rem;
    text-align: center;
  }
  .placeholder .big {
    font-size: 1.75rem;
    font-weight: 300;
    color: rgba(0, 0, 0, 0.55);
  }
  .placeholder .hint {
    font-size: 0.85rem;
    color: rgba(0, 0, 0, 0.55);
    line-height: 1.2;
  }
  .placeholder .hint small {
    font-size: 0.75rem;
    color: rgba(0, 0, 0, 0.45);
  }
  .clear {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    width: 24px;
    height: 24px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    border: none;
    border-radius: 50%;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .clear:hover { background: rgba(0, 0, 0, 0.9); }
</style>
