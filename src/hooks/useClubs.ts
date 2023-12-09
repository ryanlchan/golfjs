import { signal, effect } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { GolfClub, getUsableClubs, getDefaultClubs, saveUserClubs } from 'services/clubs';

export const useClubs = () => {
    const clubs: Signal<GolfClub[]> = signal(getUsableClubs());
    const add = (club: GolfClub) => clubs.value = [...clubs.value, club];
    const remove = (club: GolfClub) => clubs.value = clubs.value.filter(c => c.id == club.id);
    const reset = () => { clubs.value = getDefaultClubs() };
    effect(() => {
        saveUserClubs(clubs.value);
    })
    return { clubs, add, remove, reset };
}