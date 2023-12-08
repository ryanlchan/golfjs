import { ControlCard, ControlCardFooter, ControlCardHeader, ControlCardValue } from "src/components/controlCards/controlCard";
import { getUsableClubs } from "src/services/clubs";

export function ClubMenuOption(props: { club: Club, callback?: (club: Club, e: Event) => void }) {
    if (!props.club) return;
    const onClick = (e) => (props.callback && props.callback(props.club, e));
    return <ControlCard className={`clubOption clickable club-${props.club?.name.toLocaleLowerCase()}`} onClick={onClick} >
        <input type="hidden" value={props.club?.dispersion}></input>
        <ControlCardHeader></ControlCardHeader>
        <ControlCardValue>{props.club?.name}</ControlCardValue>
        <ControlCardFooter></ControlCardFooter>
    </ControlCard>
}

export function ClubMenu(props: { clubs?: Club[], callback?: (club: Club, e: Event) => void }) {
    const clubs = props.clubs || getUsableClubs();
    return <div className="takeover">
        <div className="clubMenu takeoverMenu cardContainer">
            {clubs.map((club) => <ClubMenuOption club={club} callback={props.callback} key={club.name} />)}
        </div>
    </div>
}