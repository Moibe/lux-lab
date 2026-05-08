import { cubicIn, expoOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

interface DramaticParams {
  delay?: number;
  duration?: number;
  startScale?: number;
  blur?: number;
}

export function dramaticIn(
  _node: Element,
  { delay = 0, duration = 700, startScale = 0.3, blur = 14 }: DramaticParams = {}
): TransitionConfig {
  return {
    delay,
    duration,
    easing: expoOut,
    css: (t, u) => `
      transform: scale(${startScale + (1 - startScale) * t});
      opacity: ${t};
      filter: blur(${u * blur}px);
    `
  };
}

export function dramaticOut(
  _node: Element,
  { delay = 0, duration = 400, startScale = 1.6, blur = 10 }: DramaticParams = {}
): TransitionConfig {
  return {
    delay,
    duration,
    easing: cubicIn,
    css: (t, u) => `
      transform: scale(${startScale + (1 - startScale) * t});
      opacity: ${t};
      filter: blur(${u * blur}px);
    `
  };
}
