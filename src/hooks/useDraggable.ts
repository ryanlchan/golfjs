import { useRef, useState } from "preact/hooks";

// When dragging, render a cached copy to allow for smooth dragging while other items rerender
export const useDraggable = () => {
    const [dragging, setDrag] = useState(false);
    const eventHandlers = {
        dragstart: () => setDrag(true),
        dragend: () => setDrag(false)
    }
    const renderDrag = (components) => {
        const cachedRender = useRef(null);
        if (!dragging) cachedRender.current = components
        return cachedRender.current;
    }
    return { dragging, eventHandlers, renderDrag }
}