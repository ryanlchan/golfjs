import { batch } from '@preact/signals';
import { formatDistanceAsNumber } from 'common/projections';
import { useDisplayUnits } from 'hooks/useDisplayUnits';
import { ClubStore } from 'hooks/useClubs';
import { GolfClub } from 'services/clubs';


export const ClubEditor = ({ clubStore }: { clubStore: ClubStore }) => {
    const clubs = clubStore.clubs.value;
    const addClub = () => { if (clubs.length < 14) clubStore.add(new GolfClub()) }
    const deleteClub = (club: GolfClub) => { clubStore.remove(club) };
    const updateClub = (updatedClub) => {
        batch(() => {
            clubStore.remove(updatedClub); // removes old club based on ID
            clubStore.add(updatedClub);
        })
    };
    const resetClubs = () => clubStore.reset();

    return (
        <div>
            <ClubControls onAddClub={addClub} onReset={resetClubs} />
            <table>
                <thead>
                    <th>Index</th>
                    <th>Club name</th>
                    <th>Dispersion (std. dev.)</th>
                    <th></th>
                </thead>
                <tbody>
                    {clubs.map((club, index) => (
                        <ClubRow
                            key={club.name}
                            index={index}
                            club={club}
                            onUpdateClub={updateClub}
                            onDeleteClub={deleteClub}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const ClubRow = ({ club, index, onUpdateClub, onDeleteClub }) => {
    const units = useDisplayUnits();
    return (<tr>
        <td>{index + 1}</td>
        <td>
            <input type="text" value={club.name || ""} placeholder="Club type"
                onChange={(e) => onUpdateClub({ ...club, name: e.target.value })}
            />
        </td>
        <td>
            <input type="text" value={formatDistanceAsNumber(club.dispersion, { to_unit: units }) || ""}
                placeholder="Dispersion" onChange={(e) => onUpdateClub({ ...club, dispersion: e.target.value })}
            />
        </td>
        <td>
            <button className="linkCircleButton danger" onClick={() => onDeleteClub(club)}>
                &#215;
            </button>
        </td>
    </tr>
    );
};

const ClubControls = ({ onAddClub, onReset }) => {
    return (
        <div>
            <button onClick={onAddClub} id="add-row-btn">Add Club</button>
            <button onClick={onReset} id="reset-clubs-btn">Reset to Default</button>
        </div>
    );
};