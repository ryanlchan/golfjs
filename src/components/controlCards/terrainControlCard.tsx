import { PositionError } from "src/common/errors";
import { touch, showError } from "src/common/utils";
import { SG_SPLINES } from "src/services/coeffs20231205";
import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "./controlCard";


const terrainIcons = {
    'green': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="28" viewBox="0 0 448 512"><path d="M48 24C48 10.7 37.3 0 24 0S0 10.7 0 24V64 350.5 400v88c0 13.3 10.7 24 24 24s24-10.7 24-24V388l80.3-20.1c41.1-10.3 84.6-5.5 122.5 13.4c44.2 22.1 95.5 24.8 141.7 7.4l34.7-13c12.5-4.7 20.8-16.6 20.8-30V66.1c0-23-24.2-38-44.8-27.7l-9.6 4.8c-46.3 23.2-100.8 23.2-147.1 0c-35.1-17.6-75.4-22-113.5-12.5L48 52V24zm0 77.5l96.6-24.2c27-6.7 55.5-3.6 80.4 8.8c54.9 27.4 118.7 29.7 175 6.8V334.7l-24.4 9.1c-33.7 12.6-71.2 10.7-103.4-5.4c-48.2-24.1-103.3-30.1-155.6-17.1L48 338.5v-237z" /></svg>,
    'fairway': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="36" viewBox="0 0 576 512"><path d="m 306.5 357.9 c 22.5 15.5 50 26.1 77.5 26.1 c 26.9 0 55.4 -10.8 77.4 -26.1 l 0 0 c 11.9 -8.5 28.1 -7.8 39.2 1.7 c 14.4 11.9 32.5 21 50.6 25.2 c 17.2 4 27.9 21.2 23.9 38.4 s -21.2 27.9 -38.4 23.9 c -24.5 -5.7 -44.9 -16.5 -58.2 -25 c -29 15.6 -61.5 25.9 -94.5 25.9 c -31.9 0 -60.6 -9.9 -80.4 -18.9 c -5.8 -2.7 -11.1 -5.3 -15.6 -7.7 c -4.5 2.4 -9.7 5.1 -15.6 7.7 c -19.8 9 -48.5 18.9 -80.4 18.9 c -33 0 -65.5 -10.3 -94.5 -25.8 c -13.4 8.4 -33.7 19.3 -58.2 25 c -17.2 4 -34.4 -6.7 -38.4 -23.9 s 6.7 -34.4 23.9 -38.4 c 18.1 -4.2 36.2 -13.3 50.6 -25.2 c 11.1 -9.4 27.3 -10.1 39.2 -1.7 l 0 0 c 22.1 15.2 50.5 26 77.4 26 c 27.5 0 55 -10.6 77.5 -26.1 c 11.1 -7.9 25.9 -7.9 37 0 z" /></svg>,
    'rough': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="32" viewBox="0 0 512 512"><path d="m 44.73 208.17 c 15.93 0 28.8 -12.87 28.8 -28.8 l 0 -28.8 c 0 -15.93 12.87 -28.8 28.8 -28.8 s 28.8 12.87 28.8 28.8 l -0 288 c 0 15.93 12.87 28.8 28.8 28.8 s 28.8 -12.87 28.8 -28.8 l 0 -288 c 0 -47.7 -38.7 -86.4 -86.4 -86.4 s -86.4 38.7 -86.4 86.4 l 0 28.8 c 0 15.93 12.87 28.8 28.8 28.8 z m 316.8 -57.6 c 15.93 0 28.8 -12.87 28.8 -28.8 l 0 -28.8 c 0 -47.7 -38.7 -86.4 -86.4 -86.4 s -86.4 38.7 -86.4 86.4 l -0 345.6 c 0 15.93 12.87 28.8 28.8 28.8 s 28.8 -12.87 28.8 -28.8 l 0 -345.6 c 0 -15.93 12.87 -28.8 28.8 -28.8 s 28.8 12.87 28.8 28.8 l 0 28.8 c 0 15.93 12.87 28.8 28.8 28.8 z m 115.2 201.6 l 0 -28.8 c 0 -47.7 -38.7 -86.4 -86.4 -86.4 s -86.4 38.7 -86.4 86.4 l -0 115.2 c 0 15.93 12.87 28.8 28.8 28.8 s 28.8 -12.87 28.8 -28.8 l 0 -115.2 c 0 -15.93 12.87 -28.8 28.8 -28.8 s 28.8 12.87 28.8 28.8 l 0 28.8 c 0 15.93 12.87 28.8 28.8 28.8 s 28.8 -12.87 28.8 -28.8 z" /></svg>,
    'bunker': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="36" viewBox="0 0 576 512"><path d="M346.3 271.8l-60.1-21.9L214 448H32c-17.7 0-32 14.3-32 32s14.3 32 32 32H544c17.7 0 32-14.3 32-32s-14.3-32-32-32H282.1l64.1-176.2zm121.1-.2l-3.3 9.1 67.7 24.6c18.1 6.6 38-4.2 39.6-23.4c6.5-78.5-23.9-155.5-80.8-208.5c2 8 3.2 16.3 3.4 24.8l.2 6c1.8 57-7.3 113.8-26.8 167.4zM462 99.1c-1.1-34.4-22.5-64.8-54.4-77.4c-.9-.4-1.9-.7-2.8-1.1c-33-11.7-69.8-2.4-93.1 23.8l-4 4.5C272.4 88.3 245 134.2 226.8 184l-3.3 9.1L434 269.7l3.3-9.1c18.1-49.8 26.6-102.5 24.9-155.5l-.2-6zM107.2 112.9c-11.1 15.7-2.8 36.8 15.3 43.4l71 25.8 3.3-9.1c19.5-53.6 49.1-103 87.1-145.5l4-4.5c6.2-6.9 13.1-13 20.5-18.2c-79.6 2.5-154.7 42.2-201.2 108z" /></svg>,
    'recovery': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="32" viewBox="0 0 512 512"><path d="M254.4 6.6c3.5-4.3 9-6.5 14.5-5.7C315.8 7.2 352 47.4 352 96c0 11.2-1.9 22-5.5 32H352c35.3 0 64 28.7 64 64c0 19.1-8.4 36.3-21.7 48H408c39.8 0 72 32.2 72 72c0 23.2-11 43.8-28 57c34.1 5.7 60 35.3 60 71c0 39.8-32.2 72-72 72H72c-39.8 0-72-32.2-72-72c0-35.7 25.9-65.3 60-71c-17-13.2-28-33.8-28-57c0-39.8 32.2-72 72-72h13.7C104.4 228.3 96 211.1 96 192c0-35.3 28.7-64 64-64h16.2c44.1-.1 79.8-35.9 79.8-80c0-9.2-1.5-17.9-4.3-26.1c-1.8-5.2-.8-11.1 2.8-15.4z" /></svg>,
    'tee': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="24" viewBox="0 0 384 512"><path d="M384 192c0 66.8-34.1 125.6-85.8 160H85.8C34.1 317.6 0 258.8 0 192C0 86 86 0 192 0S384 86 384 192zM242.1 256.6c0 18.5-15 33.5-33.5 33.5c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4zm-52.3-49.3c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4c0 18.5-15 33.5-33.5 33.5zm113.5-17.5c0 18.5-15 33.5-33.5 33.5c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4zM96 416c0-17.7 14.3-32 32-32h64 64c17.7 0 32 14.3 32 32s-14.3 32-32 32H240c-8.8 0-16 7.2-16 16v16c0 17.7-14.3 32-32 32s-32-14.3-32-32V464c0-8.8-7.2-16-16-16H128c-17.7 0-32-14.3-32-32z" /></svg>,
    'penalty': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="32" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c-9.4 9.4-9.4 24.6 0 33.9l47 47-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l47-47 47 47c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-47-47 47-47c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-47 47-47-47c-9.4-9.4-24.6-9.4-33.9 0z" /></svg>,
    'out_of_bounds': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="28" viewBox="0 0 448 512"><path d="M368 128c0 44.4-25.4 83.5-64 106.4V256c0 17.7-14.3 32-32 32H176c-17.7 0-32-14.3-32-32V234.4c-38.6-23-64-62.1-64-106.4C80 57.3 144.5 0 224 0s144 57.3 144 128zM168 176a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm144-32a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM3.4 273.7c7.9-15.8 27.1-22.2 42.9-14.3L224 348.2l177.7-88.8c15.8-7.9 35-1.5 42.9 14.3s1.5 35-14.3 42.9L295.6 384l134.8 67.4c15.8 7.9 22.2 27.1 14.3 42.9s-27.1 22.2-42.9 14.3L224 419.8 46.3 508.6c-15.8 7.9-35 1.5-42.9-14.3s-1.5-35 14.3-42.9L152.4 384 17.7 316.6C1.9 308.7-4.5 289.5 3.4 273.7z" /></svg>,
}
function TerrainOption(props: { stroke: Stroke, type: string }) {
    const onClick = (e) => {
        if (props.type == "" || props.type in SG_SPLINES) {
            const stroke = round.holes[props.stroke.holeIndex].strokes[props.stroke.index];
            stroke.terrain = props.type;
            touch(stroke);
            saveData();
        } else {
            showError(new PositionError("Terrain type not recognized", 4));
            console.error(`Terrain type not recognized, got ${props.type}`);
        }
        rerender("dragend");
    }
    const icon = terrainIcons[props.type];
    const formattedType = props.type.replaceAll("_", " ");
    return <ControlCard className={`terrainOption clickable ${props.type}`} onClick={onClick}>
        <input type="hidden" value={props.type}></input>
        <ControlCardHeader></ControlCardHeader>
        <ControlCardValue>{icon}</ControlCardValue>
        <ControlCardFooter>{formattedType}</ControlCardFooter>
    </ControlCard>
}

function TerrainMenu(props: { stroke: Stroke, types?: string[] }) {
    const types = props.types || Object.keys(SG_SPLINES).map((key) => key);
    return <div className="takeover">
        <div className="terrainMenu takeoverMenu cardContainer">
            {types.map((type) => <TerrainOption type={type} stroke={props.stroke} />)}
        </div>
    </div>
}

export function TerrainControl(props: { stroke: Stroke }) {
    const [menuVisible, setMenuVisible] = useState(false);
    const toggleMenu = () => setMenuVisible(!menuVisible);
    const onClick = () => toggleMenu();
    const currentTerrain = props.stroke?.terrain
    const formattedTerrain = currentTerrain.replaceAll("_", " ");
    const icon = terrainIcons[currentTerrain];
    return <ControlCard className="dispersionControlCard clickable" onClick={onClick}>
        <ControlCardHeader>Terrain</ControlCardHeader>
        <ControlCardValue>{icon}</ControlCardValue>
        <ControlCardFooter>{formattedTerrain}</ControlCardFooter>
        {menuVisible && <TerrainMenu stroke={props.stroke} />}
    </ControlCard>
}