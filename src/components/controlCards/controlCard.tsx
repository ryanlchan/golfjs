import { Signal } from "@preact/signals";

function longestWord(text: string) {
    const matches: string[] = text.match(/\S+/g) || [];
    let longest: string = "";
    if (matches.length > 0) {
        longest = matches.reduce((a, b) => a.length > b.length ? a : b);
    }
    return longest.length;
}

function valueLengthClass(words: string | any) {
    if (words instanceof Signal) words = words.value;
    if (typeof words !== "string") return ""
    const length = words.length;
    const wordLength = longestWord(words);
    if (length < 4) {
        return "";
    } else if (wordLength < 8 && length < 12) {
        return "cardValueMed";
    } else {
        return "cardValueLong"
    }
}

function addClass(newClass: string, props: { className?: string, }) {
    const className = [props.className, newClass].join(' ');
    return { ...props, className };
}

export function ControlCard(props) {
    const newProps = addClass('card', props);
    return <div {...newProps} />
}

export function ControlCardHeader(props) {
    const newProps = addClass('cardTitle', props);
    return <div {...newProps} />
}
export function ControlCardValue(props) {
    const newClass = `cardValue ${valueLengthClass(props.children)}`
    const newProps = addClass(newClass, props)
    return <div className="cardValueOuter"><div {...newProps} /></div>;
}

export function ControlCardFooter(props) {
    const newProps = addClass('cardFooter', props);
    return <div {...newProps} />
}