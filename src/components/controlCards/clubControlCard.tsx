import { ControlCard, ControlCardFooter, ControlCardHeader, ControlCardValue } from "components/controlCards/controlCard";
import { useState } from 'preact/hooks';
import { ClubMenu } from "components/clubMenu";
import { StrokesStateManager } from "hooks/strokesStore";

export function ClubControl({ stroke, strokesStateManager }:
    { stroke: Stroke, strokesStateManager: StrokesStateManager }
) {
    const [menuVisible, setMenuVisible] = useState(false);
    const toggleMenu = () => setMenuVisible(!menuVisible);
    const onClick = () => toggleMenu();
    const clubClick = (club: Club, e) => {
        strokesStateManager.update(stroke, (draft) => {
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