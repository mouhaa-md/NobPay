'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';
import NobPayMotion from '@motion/nobpay-motion';

/**
 * Starts the landing page animations (smooth scroll, text reveal, parallax, auto tabs) once the page is hydrated.
 * The text the kit splits into words belongs to server-rendered markup that never re-renders, so React and the kit
 * do not fight over the same nodes.
 */
export function MotionProvider() {
  useEffect(() => {
    (window as unknown as { Lenis?: typeof Lenis }).Lenis = Lenis;
    const instance = NobPayMotion.init();
    return () => instance.destroy();
  }, []);
  return null;
}
