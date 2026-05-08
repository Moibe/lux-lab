<script lang="ts">
  let {
    value = $bindable(''),
    placeholder = 'Describe el video...',
    rows = 6,
    disabled = false,
    maxlength = undefined,
    small = false,
    onfocusEvent
  }: {
    value: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    maxlength?: number;
    small?: boolean;
    onfocusEvent?: (e: FocusEvent & { currentTarget: HTMLTextAreaElement }) => void;
  } = $props();
</script>

<textarea
  bind:value
  class="prompt"
  class:small
  {placeholder}
  {rows}
  {disabled}
  {maxlength}
  onfocus={onfocusEvent}
></textarea>

<style>
  .prompt {
    width: 100%;
    min-height: 8rem;
    padding: 1rem 1.25rem;
    background: #fff;
    border: 1.5px solid #000;
    border-radius: var(--radius-card);
    color: #000;
    font-family: var(--font-sans);
    font-size: 1rem;
    line-height: 1.5;
    resize: vertical;
    outline: none;
    box-shadow: var(--shadow-card);
    box-sizing: border-box;
    transition: box-shadow var(--transition-fast);
  }
  .prompt.small { min-height: 4rem; }
  .prompt::placeholder { color: rgba(0, 0, 0, 0.45); }
  .prompt:focus { box-shadow: var(--accent-shadow), var(--shadow-card); }
  .prompt:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
