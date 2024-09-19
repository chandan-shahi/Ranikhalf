import { PumpFun } from "../../../target/types/pump_fun"
import { IdlAccounts } from '@coral-xyz/anchor'

export type BaseRayInput = {
    rpcEndpointUrl: string
}
export type Result<T, E = any> = {
    Ok?: T,
    Err?: E
}
export type TxPassResult = {
    txSignature: string
}

export type PoolStateLayout = IdlAccounts<PumpFun>['poolState']