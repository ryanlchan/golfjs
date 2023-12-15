import { DataContext } from "contexts/dataContext";
import { useContext } from "preact/hooks";

export const useCourseContext = () => useContext(DataContext).courseStore