declare module "d3-force-3d" {
  export interface ForceCollide<T> {
    (alpha: number): void;
    radius(
      radius: number | ((node: T, index: number, nodes: T[]) => number),
    ): this;
    strength(strength: number): this;
    iterations(iterations: number): this;
  }

  export function forceCollide<T>(): ForceCollide<T>;
}
