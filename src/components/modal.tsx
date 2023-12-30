import type { Signal } from '@preact/signals';
import { ModalProps } from 'common/modals';
import { useState, useEffect } from 'preact/hooks';

export interface BaseModalProps extends ModalProps { dispose?: () => void }
export function BaseModal({ message, type, timeout, dispose }: BaseModalProps) {
    const [visible, setVisibility] = useState(true);
    const clear = () => {
        setVisibility(false);
        dispose && dispose();
    }
    if (timeout) {
        useEffect(() => {
            const timer = setTimeout(clear, timeout)
            return () => clearTimeout(timer);
        }, [visible])
    }
    return visible && <div className="modalContainer">
        <div className={`modal ${type}`}>
            {message}
            <a href="#" onClick={clear}>X</a>
        </div>
    </div>
}

export const SignaledModal = ({ sig }: { sig: Signal<ModalProps> }) => {
    const disposeSignal = () => sig.value = null
    return sig.value && <BaseModal {...sig.value} dispose={disposeSignal} />;
}