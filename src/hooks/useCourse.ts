import { CourseFeatureCollection, courseLoad } from 'services/courses';
import { RoundStore } from 'hooks/useRounds';
import { roundCourseParams } from 'services/rounds';
import useSWR from 'swr';

export interface CourseStore {
    course: CourseFeatureCollection,
    error: boolean,
    isLoading: boolean,
}
export const useCourse = (roundStore: RoundStore): CourseStore => {
    const { data, error, isLoading } = useSWR(roundCourseParams(roundStore.round.value), _load);
    return { course: data, error, isLoading }
}

const _load = (c: Course) => courseLoad(c)