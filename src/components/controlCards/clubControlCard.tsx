import { ControlCard, ControlCardFooter, ControlCardHeader, ControlCardValue } from "components/controlCards/controlCard";
import { useState } from 'preact/hooks';
import { ClubMenu } from "components/clubMenu";
import { StrokesStore } from "hooks/strokesStore";

export function ClubControl({ stroke, strokesStore }:
    { stroke: Stroke, strokesStore: StrokesStore }
) {
    const [menuVisible, setMenuVisible] = useState(false);
    const toggleMenu = () => setMenuVisible(!menuVisible);
    const onClick = () => toggleMenu();
    const clubClick = (club: Club, e) => {
        strokesStore.update(stroke, (draft) => {
            draft.club = club.name;
        })
    }

    return <ControlCard className="clubControlCard clickable" onClick={onClick}>
        <ControlCardHeader>Club</ControlCardHeader>
        <ControlCardValue>{stroke?.club}</ControlCardValue>
        <ControlCardFooter></ControlCardFooter>
        {menuVisible && <ClubMenu callback={clubClick} />}
    </ControlCard>
}