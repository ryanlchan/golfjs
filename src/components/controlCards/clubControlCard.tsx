import { ControlCard, ControlCardFooter, ControlCardHeader, ControlCardValue } from "components/controlCards/controlCard";
import { useState } from 'preact/hooks';
import { ClubMenu } from "components/clubMenu";

export function ClubControl(props: { stroke: Stroke }) {
    const [menuVisible, setMenuVisible] = useState(false);
    const toggleMenu = () => setMenuVisible(!menuVisible);
    const onClick = () => toggleMenu();
    const clubClick = (club: Club, e) => {
        const loadStroke = round.holes[props.stroke.holeIndex].strokes[props.stroke.index];
        if (!loadStroke) return;
        loadStroke.club = club.name;
        touch(loadStroke);
        saveData();
    }
    return <ControlCard className="clubControlCard clickable" onClick={onClick}>
        <ControlCardHeader>Club</ControlCardHeader>
        <ControlCardValue>{props.stroke?.club}</ControlCardValue>
        <ControlCardFooter></ControlCardFooter>
        {menuVisible && <ClubMenu callback={clubClick} />}
    </ControlCard>
}