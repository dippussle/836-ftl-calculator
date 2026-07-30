/* tslint:disable */
/* eslint-disable */

export function wasm_calculate(pearl_x: number, pearl_z: number, dest_x: number, dest_z: number, max_tnt: number, max_ticks: number, max_distance: number, cannon_max_tnt: number, version: string): any;

export function wasm_get_pearl_blocker(pos_x: number, pos_y: number, pos_z: number, mot_x: number, mot_y: number, mot_z: number): string;

export function wasm_simulate(pos_x: number, pos_y: number, pos_z: number, mot_x: number, mot_y: number, mot_z: number): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly wasm_calculate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => any;
    readonly wasm_get_pearl_blocker: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly wasm_simulate: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
