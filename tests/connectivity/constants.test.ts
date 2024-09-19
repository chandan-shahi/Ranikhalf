import { web3 } from '@coral-xyz/anchor'
import { ASSOCIATED_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token'
import { Logger, ILogObj } from 'tslog'

export const Seeds = {
    main: Buffer.from('main'),
    pool: Buffer.from('pool')
}

export const FEE_PRE_DIV = 1000
export const PROGRAMS = {
    systemProgram: web3.SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
}

export const log: Logger<ILogObj> = new Logger();
// export const { info, debug, error } = log
export const debug = console.log
export const info = console.log
export const error = console.log