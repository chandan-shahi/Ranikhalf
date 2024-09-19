import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { BaseSpl } from "./connectivity/base/baseSpl";

export async function createToken({ decimals, supply }: { decimals: number, supply: number }, provider: AnchorProvider) {
    const connection = provider.connection
    const baseSpl = new BaseSpl(connection)
    const owner = provider.publicKey
    const txInfo = await baseSpl.createToken({ mintAuthority: owner, decimals, mintingInfo: { tokenAmount: supply } })
    const { ixs, mintKeypair } = txInfo
    const tx = new web3.Transaction().add(...ixs)
    const txSignature = await provider.sendAndConfirm(tx, [mintKeypair])
    return {
        txSignature,
        mint: mintKeypair.publicKey
    }
}