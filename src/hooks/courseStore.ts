import { effect } from '@preact/signals';

import { type RoundStore } from 'hooks/roundStore';
import { type Store, asyncMutate, store } from 'hooks/core';
import { CourseFeatureCollection, courseLoad } from 'services/courses';
import { roundCourseParams } from 'services/rounds';
import { useMemo } from 'preact/hooks';

const emptyFC = { type: "FeatureCollection", features: [] } as CourseFeatureCollection
export interface CourseStore extends Store<CourseFeatureCollection> {
    load: () => void
}
export const courseStore = (roundStore: RoundStore): CourseStore => {
    const _load = (c: Course) => {
        if (!roundStore.isLoading.value && roundStore.data.value) {
            return courseLoad(c);
        } else {
            return Promise.reject("Waiting until round is ready");
        }
    }
    const s = store(emptyFC);
    let loadedParams;
    const load = async () => asyncMutate(s, () => _load(roundCourseParams(roundStore.data.value)));
    effect(() => {
        const newParams = roundCourseParams(roundStore.data.value);
        const nameMatch = loadedParams?.name == newParams.name;
        const idMatch = loadedParams?.id == newParams.id
        if (!(nameMatch && idMatch)) {
            load();
            loadedParams = newParams;
        }
    })
    return { ...s, load }
}

export const useCourse = (roundStore: RoundStore): CourseStore => {
    return useMemo(() => courseStore(roundStore), []);
}