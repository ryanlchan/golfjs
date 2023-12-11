export interface ModalProps { message: string; type?: string; timeout?: number; }
export const MODAL_TYPES = {
    ERROR: "error",
    WARN: "warning",
    SUCCESS: "success"
}