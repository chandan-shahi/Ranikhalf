import { AnchorProvider, Program, Wallet, web3 } from '@coral-xyz/anchor'
import { PumpFun, IDL as PumpFunIDL } from '../../target/types/pump_fun'
import { Result, TxPassResult } from './types'
import { PumpFunError } from './error';
import { FEE_PRE_DIV, PROGRAMS, debug } from './constants';
import { Pdas } from './pdas';
import BN from 'bn.js';
import { calculateOutputAmount, getMultipleAccountsInfo, getPubkeyFromStr, sleep } from './utils';
import { MintLayout, NATIVE_MINT, getAssociatedTokenAddressSync, getMint, mintTo } from '@solana/spl-token';
import { calcDecimalValue, calcNonDecimalValue } from './base/utils';
import { toBufferBE, toBigIntBE } from 'bigint-buffer'
import { PoolStateLayout } from './base/types';
import { utf8 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const { systemProgram, tokenProgram, associatedTokenProgram } = PROGRAMS
const todo = null as any;

export type MainStateInfo = {
    tradingFee: number,
    owner: string, 
    feeRecipient: string
}

export type PoolInfo = {
    owner: web3.PublicKey,
    baseMint: web3.PublicKey,
    quoteMint: web3.PublicKey,
    realBaseReserves: BN,
    virtBaseReserves: BN,
    realQuoteReserves: BN,
    virtQuoteReserves: BN,
}

export class Connectivity {
    private program: Program<PumpFun>
    private connection: web3.Connection
    private provider: AnchorProvider
    pdas: Pdas
    constructor(input: { walletInfo: Wallet | AnchorProvider, rpcEndPoint: string, programId: web3.PublicKey }) {
        const { programId, rpcEndPoint, walletInfo } = input
        this.connection = new web3.Connection(rpcEndPoint)
        if (walletInfo instanceof AnchorProvider) {
            this.provider = walletInfo
        } else {
            this.provider = new AnchorProvider(this.connection, walletInfo, { commitment: 'confirmed' })
        }
        this.program = new Program(PumpFunIDL, programId, this.provider)
        this.pdas = new Pdas(this.program.programId)
    }

    async initMainState(/* tradingFee: number */): Promise<Result<TxPassResult>> {
        const owner = this.provider.publicKey
        if (!owner) return { Err: PumpFunError.WALLET_NOT_FOUND }
        // const _tradingFee = Math.trunc(tradingFee * FEE_PRE_DIV)
        // if (!_tradingFee) return { Err: PumpFunError.INVALID_INPUT }
        const txSignature = await this.program.methods.initMainState(/* new BN(_tradingFee) */).accounts({
            mainState: this.pdas.mainState, owner, systemProgram,
        }).rpc().catch((initMainStateError) => {
            debug({ initMainStateError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async updateMainState(input: { newOwner?: string, newFeeRecipient?: string, newTotalTokenSupply?: number, newInitRealBaseReserves?: number, newInitVirtBaseReserves?: number, newInitVirtQuoteReserves?: number, tradingFee?: number }): Promise<Result<TxPassResult>> {
        const owner = this.provider.publicKey
        if (!owner) return { Err: PumpFunError.WALLET_NOT_FOUND }
        let newOwner: null | web3.PublicKey = null
        let newFeeRecipient: null | web3.PublicKey = null
        let newTotalTokenSupply: null | BN = null
        let newInitRealBaseReserves: null | BN = null
        let newInitVirtBaseReserves: null | BN = null
        let newInitVirtQuoteReserves: null | BN = null
        let tradingFee: null | BN = null

        if (input.newOwner) {
            const address = getPubkeyFromStr(input.newOwner)
            if (!address) return { Err: PumpFunError.INVALID_INPUT }
            newOwner = address
        }
        if (input.newFeeRecipient) {
            const address = getPubkeyFromStr(input.newFeeRecipient)
            if (!address) return { Err: PumpFunError.INVALID_INPUT }
            newFeeRecipient = address
        }
        if (input.newTotalTokenSupply) {
            const tmpTotalTokenSupply = input.newTotalTokenSupply
            newTotalTokenSupply = new BN(tmpTotalTokenSupply)
        }
        if (input.newInitRealBaseReserves) {
            const tmpRealTokenReserves = input.newInitRealBaseReserves
            newInitRealBaseReserves = new BN(tmpRealTokenReserves)
        }
        if (input.newInitVirtBaseReserves) {
            const tmpVirtTokenReserves = input.newInitVirtBaseReserves
            newInitVirtBaseReserves = new BN(tmpVirtTokenReserves)
        }
        if (input.newInitVirtQuoteReserves) {
            const tmpVirtSolReserves = input.newInitVirtQuoteReserves
            newInitVirtQuoteReserves = new BN(tmpVirtSolReserves)
        }
        if (input.tradingFee) {
            const tmpFee = Math.trunc(input.tradingFee * FEE_PRE_DIV)
            tradingFee = new BN(tmpFee)
        }
        
        const txSignature = await this.program.methods.updateMainState({ 
            owner: newOwner, 
            feeRecipient: newFeeRecipient, 
            tradingFee, 
            totalTokenSupply: newTotalTokenSupply, 
            initRealBaseReserves: newInitRealBaseReserves, 
            initVirtBaseReserves: newInitVirtBaseReserves, 
            initVirtQuoteReserves: newInitVirtQuoteReserves, 
			})
        .accounts({
            owner, 
            mainState: this.pdas.mainState,
        }).rpc().catch(updateMainStateError => {
            debug({ updateMainStateError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async createPool(input: { baseToken: string, quoteToken: string, baseAmount: number, quoteAmount: number }): Promise<Result<TxPassResult & { poolId: string }>> {
        const creator = this.provider.publicKey
        if (!creator) return { Err: PumpFunError.WALLET_NOT_FOUND }
        const baseMint = getPubkeyFromStr(input.baseToken)
        const quoteMint = getPubkeyFromStr(input.quoteToken)
        if (!baseMint || !quoteMint) return { Err: PumpFunError.INVALID_INPUT }
        // const infos = await getMultipleAccountsInfo(this.connection, [baseMint, quoteMint])
        // if (!infos) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        // const [baseMintAccountInfo, quoteMintAccountInfo] = infos
        // if (!baseMintAccountInfo) {
        //     debug("base token not found")
        //     return { Err: PumpFunError.TOKEN_NOT_FOUND }
        // }
        // if (!quoteMintAccountInfo) {
        //     debug("quote token not found")
        //     return { Err: PumpFunError.TOKEN_NOT_FOUND }
        // }
        const baseMintDecimals = /* MintLayout.decode(baseMintAccountInfo.data).decimals */ 6
        const quoteMintDecimals = /* MintLayout.decode(quoteMintAccountInfo.data).decimals */ 9
        const baseAmount = new BN(toBufferBE(BigInt(calcNonDecimalValue(input.baseAmount, baseMintDecimals).toString()), 8))
        const quoteAmount = new BN(toBufferBE(BigInt(calcNonDecimalValue(input.quoteAmount, quoteMintDecimals).toString()), 8))
        const creatorBaseAta = getAssociatedTokenAddressSync(baseMint, creator)
        const creatorQuoteAta = getAssociatedTokenAddressSync(quoteMint, creator)
        const poolState = this.pdas.getPoolStateAccount({ baseMint, quoteMint, owner: creator })
        const reserverBaseAta = getAssociatedTokenAddressSync(baseMint, poolState, true)
        const reserverQuoteAta = getAssociatedTokenAddressSync(quoteMint, poolState, true)
        const txSignature = await this.program.methods.createPool({ baseAmount, quoteAmount }).accounts({
            creator: creator, baseMint, quoteMint,
            mainState: this.pdas.mainState,
            creatorBaseAta, creatorQuoteAta,
            poolState,
            systemProgram,
            associatedTokenProgram,
            tokenProgram,
            reserverBaseAta,
            reserverQuoteAta,
        }).preInstructions([web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })]).rpc().catch(createPoolError => {
            debug({ createPoolError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature, poolId: poolState.toBase58() } }
    }

    async buy(input: { amount: number, poolId: string }) {
        const buyer = this.provider.publicKey
        if (!buyer) return { Err: PumpFunError.WALLET_NOT_FOUND }
        const poolState = getPubkeyFromStr(input.poolId)
        if (!poolState) return { Err: PumpFunError.INVALID_INPUT }
        const mainStateInfo = await this.program.account.mainState.fetch(this.pdas.mainState)
            .catch((fetchMainStateInfoError) => { debug({ fetchMainStateInfoError }); return null })
        if (!mainStateInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const poolInfo = await this.program.account.poolState.fetch(poolState)
            .catch((fetchPoolInfoError) => { debug({ fetchPoolInfoError }); return null })
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        const { baseMint, quoteMint } = poolInfo
        // const reserveBaseAmount = toBigIntBE(poolInfo.reserveBase.toBuffer())
        // const reserveQuoteAmount = toBigIntBE(poolInfo.reserveQuote.toBuffer())
        // const accountInfoes = await getMultipleAccountsInfo(this.connection, [baseMint, quoteMint])
        // if (!accountInfoes) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        // const [baseMintAccountInfo, quoteMintAccountInfo] = accountInfoes;
        // if (!baseMintAccountInfo) return { Err: PumpFunError.TOKEN_NOT_FOUND }
        // const baseMintDecimals = MintLayout.decode(baseMintAccountInfo.data).decimals
        const amount = new BN(toBufferBE(BigInt(calcNonDecimalValue(input.amount, 9).toString()), 8))
        const buyerBaseAta = getAssociatedTokenAddressSync(baseMint, buyer)
        const buyerQuoteAta = getAssociatedTokenAddressSync(quoteMint, buyer)
        const feeQuoteAta = getAssociatedTokenAddressSync(quoteMint, mainStateInfo.feeRecipient)
        const reserverBaseAta = getAssociatedTokenAddressSync(baseMint, poolState, true)
        const reserverQuoteAta = getAssociatedTokenAddressSync(quoteMint, poolState, true)

        const txSignature = await this.program.methods.buy(amount).accounts({
            baseMint, quoteMint,
            buyer, buyerBaseAta, buyerQuoteAta,
            poolState,
            mainState: this.pdas.mainState,
            feeRecipient: mainStateInfo.feeRecipient,
            feeQuoteAta,
            reserverBaseAta, reserverQuoteAta,
            tokenProgram, systemProgram,
            associatedTokenProgram,
        }).preInstructions([web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })]).rpc().catch(buyTxError => {
            debug({ buyTxError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async sell(input: { amount: number, poolId: string }) {
        const seller = this.provider.publicKey
        if (!seller) return { Err: PumpFunError.WALLET_NOT_FOUND }
        const poolState = getPubkeyFromStr(input.poolId)
        if (!poolState) return { Err: PumpFunError.INVALID_INPUT }
        const mainStateInfo = await this.program.account.mainState.fetch(this.pdas.mainState)
            .catch((fetchMainStateInfoError) => { debug({ fetchMainStateInfoError }); return null })
        if (!mainStateInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const poolInfo = await this.program.account.poolState.fetch(poolState)
            .catch((fetchPoolInfoError) => { debug({ fetchPoolInfoError }); return null })
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }

        const { baseMint, quoteMint } = poolInfo;
        // const accountInfoes = await getMultipleAccountsInfo(this.connection, [baseMint, quoteMint])
        // if (!accountInfoes) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        // const [baseMintAccountInfo, quoteMintAccountInfo] = accountInfoes;
        // if (!baseMintAccountInfo) return { Err: PumpFunError.TOKEN_NOT_FOUND }
        const baseMintDecimals = /* MintLayout.decode(baseMintAccountInfo.data).decimals */ 6
        const sellAmount = new BN(toBufferBE(BigInt(calcNonDecimalValue(input.amount, baseMintDecimals).toString()), 8))
        const sellerBaseAta = getAssociatedTokenAddressSync(baseMint, seller)
        const sellerQuoteAta = getAssociatedTokenAddressSync(quoteMint, seller)
        const reserverBaseAta = getAssociatedTokenAddressSync(baseMint, poolState, true)
        const reserverQuoteAta = getAssociatedTokenAddressSync(quoteMint, poolState, true)
        const feeQuoteAta = getAssociatedTokenAddressSync(quoteMint, mainStateInfo.feeRecipient)

        const txSignature = await this.program.methods.sell(sellAmount).accounts({
            seller, sellerBaseAta, sellerQuoteAta,
            mainState: this.pdas.mainState, baseMint, quoteMint,
            feeRecipient: mainStateInfo.feeRecipient,
            feeQuoteAta,
            poolState, reserverBaseAta, reserverQuoteAta,
            systemProgram, tokenProgram,
            associatedTokenProgram,
        }).preInstructions([web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })]).rpc().catch(sellTxError => {
            debug({ sellTxError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async withdraw(input: { poolId: string }): Promise<Result<TxPassResult>> {
        const admin = this.provider.publicKey
        if (!admin) return { Err: PumpFunError.WALLET_NOT_FOUND }

        const mainState = this.pdas.mainState
        const mainStateInfo = await this.program.account.mainState.fetch(mainState)
            .catch((fetchMainStateInfoError) => { debug({ fetchMainStateInfoError }); return null })
        if (!mainStateInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const owner = mainStateInfo.owner;

        const poolState = getPubkeyFromStr(input.poolId)
        if (!poolState) return { Err: PumpFunError.INVALID_INPUT }
        const poolInfo = await this.program.account.poolState.fetch(poolState)
            .catch((fetchPoolInfoError) => { debug({ fetchPoolInfoError }); return null })
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        const { baseMint, quoteMint } = poolInfo

        const reserverBaseAta = getAssociatedTokenAddressSync(baseMint, poolState, true)
        const reserverQuoteAta = getAssociatedTokenAddressSync(quoteMint, poolState, true)

        const adminBaseAta = getAssociatedTokenAddressSync(baseMint, admin)
        const adminQuoteAta = getAssociatedTokenAddressSync(quoteMint, admin)

        const txSignature = await this.program.methods.withdraw().accounts({
            admin, mainState, poolState, 
            owner, 
            baseMint, quoteMint, 
            reserverBaseAta, reserverQuoteAta, 
            adminBaseAta, adminQuoteAta, 
            systemProgram, tokenProgram,
            associatedTokenProgram,
        }).rpc().catch((collectTradingFeeError) => debug({ collectTradingFeeError }));
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async getMainStateInfo(): Promise<MainStateInfo | null> {
        const mainState = this.pdas.mainState
        const mainStateInfo = await this.program.account.mainState.fetch(mainState).catch(fetchMainStateError => {
            debug({ fetchMainStateError })
            return null
        })
        if (!mainStateInfo) return null
        const tradingFee = mainStateInfo.tradingFee.toNumber() / FEE_PRE_DIV
        return {
            owner: mainStateInfo.owner.toBase58(), 
            feeRecipient: mainStateInfo.feeRecipient.toBase58(), 
            tradingFee,
        }
    }

    async getPoolInfo(poolIdStr: string): Promise<PoolInfo | null> {
        const poolId = getPubkeyFromStr(poolIdStr)
        if (!poolId) {
            debug("Invalid pook key")
            return null
        }
        const poolInfo = await this.program.account.poolState.fetch(poolId).catch(fetchPoolInfoError => {
            debug({ fetchPoolInfoError })
            return null
        })
        if (!poolInfo) return null
        const { baseMint, quoteMint, realBaseReserves, virtBaseReserves, realQuoteReserves, virtQuoteReserves, owner } = poolInfo
        return {
            baseMint, quoteMint, realBaseReserves, virtBaseReserves, realQuoteReserves, virtQuoteReserves, owner
        }
    }

    async getOutputAmountOnBuy(input: { inputAmount: number, poolId: string }): Promise<Result<number>> {
        const mainState = await this.getMainStateInfo();
        if (!mainState) return { Err: PumpFunError.MAIN_STATE_INFO_NOT_FOUND }
        const poolInfo = await this.getPoolInfo(input.poolId)
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        const fee = input.inputAmount * mainState.tradingFee / 100
        const inputAmount = Math.trunc((input.inputAmount - fee) * LAMPORTS_PER_SOL)
        const quoteReserves = poolInfo.realQuoteReserves.add(poolInfo.virtQuoteReserves);
        const inputReserve = Number(quoteReserves.toString())
        const outputReserve = Number(poolInfo.realBaseReserves.toString())
        const outputAmount = calculateOutputAmount({ inputAmount, inputReserve, outputReserve })
        // const mintInfo = await getMint(this.connection, poolInfo.baseMint).catch(async () => {
        //     await sleep(2_000)
        //     return await getMint(this.connection, poolInfo.baseMint).catch((fetchMintInfoError) => {
        //         debug({ fetchMintInfoError })
        //         return null
        //     })
        // })
        // if (!mintInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const decimals = /* mintInfo.decimals */ 6
        return {
            Ok: calcDecimalValue(outputAmount, decimals)
        }
    }

    async getOutputAmountOnSell(input: { inputAmount: number, poolId: string }): Promise<Result<number>> {
        const mainState = await this.getMainStateInfo();
        if (!mainState) return { Err: PumpFunError.MAIN_STATE_INFO_NOT_FOUND }
        const poolInfo = await this.getPoolInfo(input.poolId)
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        // const mintInfo = await getMint(this.connection, poolInfo.baseMint).catch(async () => {
        //     await sleep(2_000)
        //     return await getMint(this.connection, poolInfo.baseMint).catch((fetchMintInfoError) => {
        //         debug({ fetchMintInfoError })
        //         return null
        //     })
        // })
        // if (!mintInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const decimals = /* mintInfo.decimals */ 6
        const inputAmount = calcNonDecimalValue(input.inputAmount, decimals)
        const inputReserve = Number(poolInfo.realBaseReserves.toString())
        const quoteReserves = poolInfo.realQuoteReserves.add(poolInfo.virtQuoteReserves);
        const outputReserve = Number(quoteReserves.toString())
        const _outputAmount = calculateOutputAmount({ inputAmount, inputReserve, outputReserve })
        const fee = _outputAmount * mainState.tradingFee / 100
        const outputAmount = _outputAmount - fee
        return {
            Ok: calcDecimalValue(outputAmount, 9)
        }
    }
}