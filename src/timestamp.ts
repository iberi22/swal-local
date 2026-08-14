/**
 * Timestamp local (epoch ms) — helper compartido
 */
export type Timestamp = number;
export const now = (): Timestamp => Date.now();
