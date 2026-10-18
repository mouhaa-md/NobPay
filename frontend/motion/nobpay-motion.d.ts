export interface MotionOptions {
  smoothScroll?: boolean;
  reveal?: boolean;
  parallax?: boolean;
  tabs?: boolean;
}

export interface MotionInstance {
  lenis: unknown;
  destroy(): void;
}

declare const NobPayMotion: {
  init(options?: MotionOptions): MotionInstance;
  reducedMotion: boolean;
};

export default NobPayMotion;
