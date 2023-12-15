import { DataContext } from "contexts/dataContext";
import { useContext } from "preact/hooks";

export const useRoundContext = () => useContext(DataContext).roundStore;