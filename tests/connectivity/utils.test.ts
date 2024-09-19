import { web3 } from "@coral-xyz/anchor";
import { debug } from "./constants";

export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getPubkeyFromStr(key: string) {
    try {
        return new web3.PublicKey(key)
    } catch (pubkeyParseError) {
        debug({ pubkeyParseError })
        return null
    }
}

export async function getMultipleAccountsInfo(connection: web3.Connection, pubkeys: web3.PublicKey[], opt?: { retry?: boolean, duration?: number }) {
    opt = opt ?? {}
    opt.retry = opt.retry ?? true
    opt.duration = opt.duration ?? 2000
    const { duration, retry } = opt
    const res = await connection.getMultipleAccountsInfo(pubkeys).catch(async () => {
        if (retry) {
            await sleep(duration)
            return await connection.getMultipleAccountsInfo(pubkeys).catch(getMultipleAccountsInfoError => {
                debug({ getMultipleAccountsInfoError })
                return null
            })
        }
        return null
    })
    return res
}

export function calculateOutputAmount({ inputAmount, inputReserve, outputReserve }: { inputAmount: number, inputReserve: number, outputReserve: number }) {
    const amount = outputReserve * inputAmount
    const divider = inputReserve + inputAmount
    return Math.trunc(amount / divider)
}