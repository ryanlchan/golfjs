export interface ModalProps { message: string; type?: string; timeout?: number; }
export const MODAL_TYPES = {
    ERROR: "danger",
    WARN: "secondary",
    SUCCESS: "success"
}