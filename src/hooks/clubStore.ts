import { computed } from '@preact/signals';
import { CLUBS_KEY, GolfClub, getDefaultClubs, getUserClubs } from 'services/clubs';
import { SettingsStore } from 'hooks/settingsStore';
import { Store, StateManager } from 'hooks/core';

/**
 * ClubStore is a derived "view" into a SettingsStore that focuses on the club
 * setting specifically. Must be initialized with a SettingStore, which will
 * manage persistance/etc
 */
export interface ClubStateManager extends StateManager<GolfClub[]> {
    add: (club: GolfClub) => void,
    remove: (club: GolfClub) => void,
    reset: () => void
};

const clubStore = (settingsStore): Store<GolfClub[]> => {
    const settings = settingsStore.data;
    const clubs = computed(() => getUserClubs(settings.value));
    return {
        data: clubs,
        isLoading: settingsStore.isLoading,
        error: settingsStore.error
    }
}

export const clubStateManager = (settingsStore: SettingsStore): ClubStateManager => {
    const store = clubStore(settingsStore);
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