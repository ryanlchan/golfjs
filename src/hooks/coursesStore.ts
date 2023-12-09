import { Signal, signal } from '@preact/signals';
import { CourseFeatureCollection, courseCacheAll, courseCacheDelete } from 'services/courses';

export interface CoursesStore {
    courses: Signal<CourseFeatureCollection[]>,
    isLoading: boolean,
    load: () => Promise<CourseFeatureCollection[]>,
    del: (course: Course) => Promise<void>,
}
export const initCoursesStore = (): CoursesStore => {
    const courses = signal([] as CourseFeatureCollection[]);
    let isLoading = false;

    /**
     * Loads all rounds from the backend
     * @returns {Course[]} all loaded rounds
     */
    const load = async (): Promise<CourseFeatureCollection[]> => {
        isLoading = true;
        return courseCacheAll().then(loaded => {
            loaded.sort((a, b) => a.course.name.localeCompare(b.course.name));
            courses.value = loaded;
            isLoading = false;
            return loaded
        });
    }

    const del = async (course: Course) => {
        await courseCacheDelete(course);
        courses.value = courses.value.filter(c => (
            course.id == c.course?.id && course.name == c.course?.name
        ));
    }

    load();

    return { courses, load, del, isLoading }
}
