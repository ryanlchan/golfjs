import { Signal, computed } from '@preact/signals';
import { CLUBS_KEY, GolfClub, getDefaultClubs, getUserClubs } from 'services/clubs';
import { SettingsStore } from 'hooks/settingsStore';

/**
 * ClubStore is a derived "view" into a SettingsStore that focuses on the club
 * setting specifically. Must be initialized with a SettingStore, which will
 * manage persistance/etc
 */
export interface ClubStore {
    clubs: Signal<GolfClub[]>,
    add: (club: GolfClub) => void,
    remove: (club: GolfClub) => void,
    reset: () => void
};
export const initClubStore = (settingsStore: SettingsStore): ClubStore => {
    const settings = settingsStore.settings;
    const clubs: Signal<GolfClub[]> = computed(() => getUserClubs(settings.value));
    const setClubs = (val) => settingsStore.set(CLUBS_KEY, val);
    const add = (club: GolfClub) => setClubs([...clubs.value, club]);
    const remove = (club: GolfClub) => setClubs(clubs.value.filter(c => c.id == club.id));
    const reset = () => setClubs(getDefaultClubs());
    return { clubs, add, remove, reset };
}