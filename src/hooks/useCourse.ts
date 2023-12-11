import { effect } from '@preact/signals';

import { type RoundStateManager } from 'hooks/roundStore';
import { type Store, asyncMutate, store } from 'hooks/core';
import { CourseFeatureCollection, courseLoad } from 'services/courses';
import { roundCourseParams } from 'services/rounds';

export interface CourseStateManager extends Store<CourseFeatureCollection> {
    load: () => void
}
export const useCourse = (roundStore: RoundStateManager): CourseStateManager => {
    const _load = (c: Course) => {
        if (!roundStore.isLoading.value && roundStore.data.value) {
            return courseLoad(c);
        } else {
            return Promise.reject("Waiting until round is ready");
        }
    }
    const s = store({} as CourseFeatureCollection);
    const load = async () => asyncMutate(s, async () => _load(roundCourseParams(roundStore.data.value)))
    effect(() => load())
    return { ...s, load }
}
