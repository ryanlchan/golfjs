import { BaseModal } from './modal';
import { MODAL_TYPES } from 'common/modals';

export function ErrorModal({ message, timeout }: { message: string | Error, timeout?: number }) {
    const msg = (message instanceof Error) ? message.message : message
    return <BaseModal message={msg} timeout={timeout} type={MODAL_TYPES.ERROR} />
}