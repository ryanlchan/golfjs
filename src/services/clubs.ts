import { typeid } from "typeid-js";
import { getSetting, setSetting } from "../common/utils";
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';

export class GolfClub {
    id: string;
    name: string; // actually more like type
    dispersion: number;
    displayName?: string;
    class?: string;

    constructor() {
        this.id = typeid("club").toString();
    }
}

export const useClubs = () => {
    const clubs: Signal<GolfClub[]> = signal(getUsableClubs());
    const add = (club: GolfClub) => clubs.value = [...clubs.value, club];
    const remove = (club: GolfClub) => clubs.value = clubs.value.filter(c => c.id == club.id);
    const save = () => saveUserClubs(clubs.value);
    const reset = () => {
        const defaultClubs = getDefaultClubs();
        saveUserClubs(defaultClubs);
        clubs.value = getUsableClubs();
    }
    return { clubs, add, remove, save, reset };
}

/**
 * Lookup function to get all default clubs, currently static
 * @returns {GolfClub[]}
 */
function getDefaultClubs(): GolfClub[] {
    return [
        { id: "1", name: "D", dispersion: 30 },
        { id: "2", name: "3w", dispersion: 27 },
        { id: "3", name: "3h", dispersion: 25.5 },
        { id: "4", name: "4i", dispersion: 22 },
        { id: "5", name: "5i", dispersion: 20 },
        { id: "6", name: "6i", dispersion: 17 },
        { id: "7", name: "7i", dispersion: 16 },
        { id: "8", name: "8i", dispersion: 13.5 },
        { id: "9", name: "9i", dispersion: 11.5 },
        { id: "10", name: "Pw", dispersion: 10 },
        { id: "11", name: "Aw", dispersion: 7.5 },
        { id: "12", name: "Sw", dispersion: 6 },
        { id: "13", name: "Lw", dispersion: 5 },
        { id: "14", name: "P", dispersion: -0.15 },
    ]
}

/**
 * Get all user-settable golf clubs
 * @returns {GolfClub[]} An array of all user-set golf clubs
 */
function getUserClubs(): GolfClub[] {
    return getSetting('clubs') || [];
}

/**
 * Lookup function to get all usable clubs, including non-user set penalty/undeclared clubs
 * @returns {GolfClub[]} an array of all usable Golf Clubs
 */
function getUsableClubs(): GolfClub[] {
    let clubs = getUserClubs();
    if (!clubs || clubs.length == 0) {
        clubs = getDefaultClubs();
    }
    clubs.push({ id: "15", name: "Penalty", dispersion: 1, class: "danger" })
    return clubs;
}

/**
 * Persist a set of user-defined clubs
 * @param {GolfClub[]} clubs an array of golf club objects
 */
function saveUserClubs(clubs: GolfClub[]): void {
    return setSetting('clubs', clubs);
}

function resetUserClubs(): void {
    return saveUserClubs(getDefaultClubs());
}