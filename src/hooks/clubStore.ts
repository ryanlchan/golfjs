import { CLUBS_KEY, GolfClub, getDefaultClubs, getUserClubs } from 'services/clubs';
import { type SettingsStore } from 'hooks/settingsStore';
import { computedStore, type Store } from 'hooks/core';

/**
 * ClubStore is a derived "view" into a SettingsStore that focuses on the club
 * setting specifically. Must be initialized with a SettingStore, which will
 * manage persistance/etc
 */
export interface ClubStore extends Store<GolfClub[]> {
    add: (club: GolfClub) => void,
    remove: (club: GolfClub) => void,
    reset: () => void
};

export const clubStore = (settingsStore: SettingsStore): ClubStore => {
    const settings = settingsStore.data;
    const store = computedStore(settingsStore, () => getUserClubs(settings.value));
    const clubs = store.data.value;
    const setClubs = (val) => settingsStore.set(CLUBS_KEY, val);
    const add = (club: GolfClub) => setClubs([...clubs, club]);
    const remove = (club: GolfClub) => setClubs(clubs.filter(c => c.id == club.id));
    const reset = () => setClubs(getDefaultClubs());
    return {
        ...store,
        add,
        remove,
        reset
    };
}