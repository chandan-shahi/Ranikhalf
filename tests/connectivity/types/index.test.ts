export type Result<T, E = string> = {
    Ok?: T,
    Err?: E
}

export type TxPassResult = {
    txSignature: string
}