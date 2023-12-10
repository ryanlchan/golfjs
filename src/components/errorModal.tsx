import { useState, useEffect } from 'preact/hooks';

export function ErrorModal(props?: { message: string | Error, timeout?: number }) {
    const [visible, setVisibility] = useState(true)
    const message = (props.message instanceof Error) ? props.message.message : props.message
    if (props.timeout) {
        useEffect(() => {
            const timer = setTimeout(() => setVisibility(false), props.timeout)
            return () => clearTimeout(timer);
        }, [visible])
    }
    return visible && <div id="errorContainer">
        <div id="error" className="danger">
            {message}
            <a href="#" onClick={() => setVisibility(false)}>X</a>
        </div>
    </div>
}