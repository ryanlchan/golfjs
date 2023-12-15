import { AppContext } from "contexts/appContext";
import { useContext } from "preact/hooks";

export const useMapMutatorContext = () => useContext(AppContext).mapMutator