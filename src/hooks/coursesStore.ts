
import { type CourseFeatureCollection, courseCacheAll, courseCacheDelete } from 'services/courses';
import { type Store, store, asyncMutate } from 'hooks/core';
import { useMemo } from 'preact/hooks';

export interface CoursesStore extends Store<CourseFeatureCollection[]> {
    load: () => Promise<CourseFeatureCollection[]>,
    del: (item: CourseFeatureCollection) => Promise<CourseFeatureCollection[]>,
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

export function coursesStore(initialState?): CoursesStore {
    const s = store(initialState);
    const mutator = courseMutator(s);
    return { ...s, ...mutator };
}

export function useCourses(initialState?): CoursesStore {
    return useMemo(() => {
        const sm = coursesStore(initialState);
        sm.load();
        return sm
    }, [])
}
