// Errors
export class PositionError extends Error {
    code: number;
    PERMISSION_DENIED: 1;
    POSITION_UNAVAILABLE: 2;
    TIMEOUT: 3;
    UNKNOWN_ERROR: 4;

    constructor(msg: string, code: number) {
        super(msg);
        this.code = code;
    }
}