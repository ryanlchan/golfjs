import { courseStore } from "hooks/courseStore";
import { roundStore } from "hooks/roundStore";
import { createContext } from "preact";
import { useContext } from "preact/hooks";

const rs = roundStore();
const defaultValue = {
    roundStore: rs,
    courseStore: courseStore(rs)
}
export const DataContext = createContext(defaultValue);

export const useDataContext = () => useContext(DataContext);