
import { CourseFeatureCollection, courseCacheAll, courseCacheDelete } from 'services/courses';
import { Store, store, asyncMutate, StateManager } from 'hooks/core';
import { useMemo } from 'preact/hooks';

export interface CoursesStore extends StateManager<CourseFeatureCollection[]> {
    load: () => Promise<CourseFeatureCollection[]>,
    del: (item: CourseFeatureCollection) => Promise<CourseFeatureCollection[]>,
}

function coursesStore(initialState?): Store<CourseFeatureCollection[]> {
    return store(initialState);
}

function courseMutator(itemStore) {
    const load = async () => {
        return asyncMutate(itemStore, async () => {
            const loaded = await courseCacheAll();
            loaded.sort((a, b) => a.course.name.localeCompare(b.course.name));
            return loaded
        });
    }

    const del = async (item) => {
        return asyncMutate(itemStore, async () => {
            await courseCacheDelete(item);
            return itemStore.data.value.filter(c => (item.id == c.course?.id && item.name == c.course?.name))
        })

    }
    return { load, del }
}

export function coursesStateManager(initialState?): CoursesStore {
    const s = coursesStore(initialState);
    const mutator = courseMutator(s);
    return { ...s, ...mutator };
}

export function useCourses(initialState?): CoursesStore {
    return useMemo(() => {
        const sm = coursesStateManager(initialState);
        sm.load();
        return sm
    }, [])
}
