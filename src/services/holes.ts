import { typeid } from "typeid-js";
/**
 * ====
 * Holes
 * ====
 */

/**
 * Return a default Hole object conforming to the interface
 * @returns {Hole} a default Hole interface
 */
export function defaultCurrentHole(): Hole {
    return {
        id: typeid("hole").toString(),
        index: 0,
        strokes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}