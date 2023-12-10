import { CourseFeatureCollection, courseLoad } from 'services/courses';
import { RoundStateManager } from './roundStore';
import { roundCourseParams } from 'services/rounds';
import useSWR from 'swr';

export interface CourseStore {
    course: CourseFeatureCollection,
    error: boolean,
    isLoading: boolean,
}
export const useCourse = (roundStore: RoundStateManager): CourseStore => {
    const { data, error, isLoading } = useSWR(roundCourseParams(roundStore.data?.value), _load);
    return { course: data, error, isLoading }
}

const _load = (c: Course) => courseLoad(c)