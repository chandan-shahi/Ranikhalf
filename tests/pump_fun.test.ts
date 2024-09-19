import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PumpFun } from "../target/types/pump_fun";
import { Connectivity } from "./connectivity";
import { createToken } from "./helper";
import { NATIVE_MINT } from "@solana/spl-token";
import { sleep } from "./connectivity/utils";
import { assert } from "chai";
const log = console.log   
const quoteToken = NATIVE_MINT.toBase58()

describe("pump_fun", () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider);
  const program = anchor.workspace.PumpFun as Program<PumpFun>;
  const connectivity = new Connectivity({ programId: program.programId, rpcEndPoint: provider.connection.rpcEndpoint, walletInfo: provider })
  
  const creatorAuthority = web3.Keypair.generate()
  const creatorProvider = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(creatorAuthority), {})
  const creatorConnectivity = new Connectivity({ programId: program.programId, rpcEndPoint: provider.connection.rpcEndpoint, walletInfo: creatorProvider })
  const creator = creatorAuthority.publicKey
  
  const userAuthority = web3.Keypair.generate()
  const userProvider = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(userAuthority), {})
  const userConnectivity = new Connectivity({ programId: program.programId, rpcEndPoint: provider.connection.rpcEndpoint, walletInfo: userProvider })
  const user = userAuthority.publicKey

  const adminAuthority = web3.Keypair.generate()
  const adminProvider = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(adminAuthority), {})
  const adminConnectivity = new Connectivity({ programId: program.programId, rpcEndPoint: provider.connection.rpcEndpoint, walletInfo: adminProvider })
  const admin = adminAuthority.publicKey
  
  const connection = provider.connection;
  const commonState: { mint?: string, poolId?: string } = {}
  let boughtAmount = 0

  before(async () => {
    await connection.requestAirdrop(creator, 1_000_000_000)
    await connection.requestAirdrop(admin, 1_000_000_000)
    await connection.requestAirdrop(user, 100_000_000_000)
    
    const mainState = connectivity.pdas.mainState
    const mainStateInfo = await connection.getAccountInfo(mainState)
    if (!mainStateInfo) {
      await connectivity.initMainState()
    }
    
    const createTokenTxInfo = await createToken({ decimals: 6, supply: 1_000_000_000 }, creatorProvider)
    commonState.mint = createTokenTxInfo.mint.toBase58()

    // const listenerCreateEvent = program.addEventListener('CreateEvent', (event, slot) => {
    //   console.log('slot: ', slot,  'event: ', event)
    // })
  })

  it("Create pool", async () => {
    const baseToken = commonState.mint
    if (!baseToken) throw "token not found"
    await sleep(3_000)
    const res = await creatorConnectivity.createPool({ baseToken, baseAmount: 1_000_000_000, quoteToken, quoteAmount: 0 })
    if (res.Err) {
      log(`Error: ${res.Err}`)
      throw "tx failed"
    }
    if (!res.Ok) throw "tx failed"
    const poolId = res.Ok.poolId
    log(`poolId: ${poolId}`)
    commonState.poolId = poolId
  });

  it("buy", async () => {
    const poolId = commonState.poolId
    if (!poolId) throw "pool id not found"
    await sleep(3_000)
    const amount = 0.2
    const outputAmount = (await userConnectivity.getOutputAmountOnBuy({ inputAmount: amount, poolId })).Ok
    boughtAmount = outputAmount as number
    log(`Buy Output Amount: ${outputAmount}`)
    const res = await userConnectivity.buy({ poolId, amount })
    if (res.Err) {
      log(`Error: ${res.Err}`)
      throw "buy fail"
    }
    if (!res.Ok) throw "sell failed"
    log(`Buy Tx Sign: ${res.Ok.txSignature}`)
  })

  it("sell", async () => {
    const poolId = commonState.poolId
    if (!poolId) throw "pool id not found"
    await sleep(3_000)
    const amount = boughtAmount // sell out bought tokens
    const outputAmount = (await userConnectivity.getOutputAmountOnSell({ inputAmount: amount, poolId })).Ok
    log(`Sell Output Amount: ${outputAmount}`)
    const res = await userConnectivity.sell({ poolId, amount })
    if (res.Err) {
      log(`Error: ${res.Err}`)
      throw "sell fail"
    }
    if (!res.Ok) throw "sell failed"
    log(`Sell Tx Sign: ${res.Ok.txSignature}`)
  })

  it("update trading fee", async () => {
    const res = await connectivity.updateMainState({ tradingFee: 0.5 })
    if (res.Err) {
      log(`Error: ${res.Err}`)
      throw "sell fail"
    }
    if (!res.Ok) throw "Update MainState failed"
    log(`Update MainState Tx Sign: ${res.Ok.txSignature}`)
  })

  it("buy2", async () => {
    const poolId = commonState.poolId
    if (!poolId) throw "pool id not found"
    await sleep(3_000)
    const amount = 0.2
    const outputAmount = (await userConnectivity.getOutputAmountOnBuy({ inputAmount: amount, poolId })).Ok
    boughtAmount = outputAmount as number
    log(`Buy Output Amount: ${outputAmount}`)
    const res = await userConnectivity.buy({ poolId, amount })
    if (res.Err) {
      log(`Error: ${res.Err}`)
      throw "buy fail"
    }
    if (!res.Ok) throw "sell failed"
    log(`Buy Tx Sign: ${res.Ok.txSignature}`)
  })

  it("sell2", async () => {
    const poolId = commonState.poolId
    if (!poolId) throw "pool id not found"
    await sleep(3_000)
    const amount = boughtAmount
    const outputAmount = (await userConnectivity.getOutputAmountOnSell({ inputAmount: amount, poolId })).Ok
    log(`Output Amount: ${outputAmount}`)
    const res = await userConnectivity.sell({ poolId, amount })
    if (res.Err) {
      log(`Error: ${res.Err}`)
      throw "sell fail"
    }
    if (!res.Ok) throw "sell failed"
    log(`Sell Tx Sign: ${res.Ok.txSignature}`)
  })
  
  it("Withdraw (BondingCurveIncomplete: Fail)", async () => {
    await sleep(3_000)
    const poolId = commonState.poolId
    if (!poolId) throw "pool id not found"
    const res = await adminConnectivity.withdraw({ poolId })
    if (res.Ok) assert.fail("Withdraw should be failed (BondingCurveIncomplete")
  })
  
  it("buy3", async () => {
    const poolId = commonState.poolId
    if (!poolId) throw "pool id not found"
    await sleep(3_000)
    const amount = 90
    const outputAmount = (await userConnectivity.getOutputAmountOnBuy({ inputAmount: amount, poolId })).Ok
    boughtAmount = outputAmount as number
    log(`Output Amount: ${outputAmount}`)
    const res = await userConnectivity.buy({ poolId, amount })
    if (res.Err) {
      log(`Error: ${res.Err}`)
      throw "buy fail"
    }
    if (!res.Ok) throw "sell failed"
    log(`Buy Tx Sign: ${res.Ok.txSignature}`)

    // const poolStateInfo = await userConnectivity.getPoolInfo(poolId)
    // log(`poolStateInfo.virtQuoteReserves: ${poolStateInfo?.virtQuoteReserves}`);
    // log(`poolStateInfo.realQuoteReserves: ${poolStateInfo?.realQuoteReserves}`);
  })

  it("Withdraw", async () => {
    await sleep(3_000)
    const poolId = commonState.poolId
    if (!poolId) throw "pool id not found"
    const res = await adminConnectivity.withdraw({ poolId })
    if (res.Err) {
      log(`Error: ${res.Err}`)
      throw "Withdraw tx Error"
    }
    if (!res.Ok) throw "withdraw failed"
    log(`Withdraw Tx Sign: ${res.Ok.txSignature}`)
  })

  // it("Withdraw (Unauthorised: Fail)", async () => {
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   const res = await userConnectivity.withdraw({ poolId })
  //   if (res.Ok) assert.fail("Tx should be failed (Unauthorised access)")
  // })
});
