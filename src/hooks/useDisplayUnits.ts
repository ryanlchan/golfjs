import { formatDistanceOptions } from 'common/projections';
import { AppContext } from 'contexts/appContext';
import { useContext } from 'preact/hooks';

export const useDisplayUnits = () => {
    const appState = useContext(AppContext);
    return appState?.settingsStore?.data.value?.displayUnits || "yards";
};

/**
 * Pre-generate a formatDistanceOptions obj from context
 * Default value: { to_unit: displayUnits, precision: 1, include_unit: true};
 * @param options overrides of the default options
 * @returns {formatDistanceOptions}
 */
export const useDistanceOptions = (options?: formatDistanceOptions) => {
    const displayUnits = useDisplayUnits();
    return { to_unit: displayUnits, precision: 1, include_unit: true, ...options };
}

export const DISPLAY_UNIT_KEY = 'dislayUnits';
