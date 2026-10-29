declare module 'canvas-confetti' {
  export interface ConfettiOptions {
    particleCount?: number
    angle?: number
    spread?: number
    startVelocity?: number
    decay?: number
    gravity?: number
    drift?: number
    ticks?: number
    origin?: { x?: number; y?: number }
    colors?: string[]
    shapes?: Array<'square' | 'circle' | 'star'>
    scalar?: number
    flat?: boolean
    disableForReducedMotion?: boolean
    zIndex?: number
  }

  export interface ConfettiInstance {
    (options?: ConfettiOptions): Promise<undefined> | null
    reset: () => void
  }

  interface ConfettiFactory {
    (options?: ConfettiOptions): Promise<undefined> | null
    create: (
      canvas: HTMLCanvasElement,
      options?: { resize?: boolean; useWorker?: boolean; disableForReducedMotion?: boolean },
    ) => ConfettiInstance
    reset: () => void
  }

  const confetti: ConfettiFactory
  export default confetti
}
