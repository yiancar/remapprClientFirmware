export class FirmwareError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message)
        this.name = 'FirmwareError'
    }
}

export class LockedError extends FirmwareError {
    constructor(message = 'Device is locked') {
        super('LOCKED', message)
        this.name = 'LockedError'
    }
}

export class UnsupportedError extends FirmwareError {
    constructor(operation: string) {
        super('UNSUPPORTED', `Operation not supported: ${operation}`)
        this.name = 'UnsupportedError'
    }
}

export class TransportError extends FirmwareError {
    constructor(message: string) {
        super('TRANSPORT', message)
        this.name = 'TransportError'
    }
}

export class ProtocolError extends FirmwareError {
    constructor(message: string) {
        super('PROTOCOL', message)
        this.name = 'ProtocolError'
    }
}
