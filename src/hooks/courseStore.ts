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
    const load = async () => asyncMutate(s, async () => _load(roundCourseParams(roundStore.data.value)))
    effect(() => load())
    return { ...s, load }
}

export const useCourse = (roundStore: RoundStore): CourseStore => {
    return useMemo(() => courseStore(roundStore), []);
}