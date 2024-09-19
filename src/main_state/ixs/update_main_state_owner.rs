use crate::{error::PumpFunError, MainState};
use anchor_lang::prelude::*;

#[derive(AnchorDeserialize, AnchorSerialize, Debug, Clone, Copy)]
pub struct UpdateMainStateInput {
    owner: Pubkey,
    fee_recipient: Pubkey,
    trading_fee: u64,
    max_buy_limit: u64
    // total_token_supply: Option<u64>,
    // init_virt_base_reserves: Option<u64>,
    // init_real_base_reserves: Option<u64>,
    // init_virt_quote_reserves: Option<u64>,
}

pub fn update_main_state(
    ctx: Context<AUpdateMainState>,
    input: UpdateMainStateInput,
) -> Result<()> {
    let state = &mut ctx.accounts.main_state;
    require!(state.initialized.eq(&true), PumpFunError::Uninitialized);

    // msg!("owner: {}", input.owner);
    // msg!("fee_recipient: {}", input.fee_recipient);
    // msg!("trading_fee: {}", input.trading_fee);

    state.owner = input.owner;
    state.fee_recipient = input.fee_recipient;
    state.trading_fee = input.trading_fee;
    state.max_buy_limit = input.max_buy_limit;
    // state.total_token_supply = input.total_token_supply.unwrap_or(state.total_token_supply);
    // state.init_virt_base_reserves = input.init_virt_base_reserves.unwrap_or(state.init_virt_base_reserves);
    // state.init_real_base_reserves = input.init_real_base_reserves.unwrap_or(state.init_real_base_reserves);
    // state.init_virt_quote_reserves = input.init_virt_quote_reserves.unwrap_or(state.init_virt_quote_reserves);
    // msg!("Updated mainState");
    
    Ok(())
}

#[derive(Accounts)]
pub struct AUpdateMainState<'info> {
    #[account(mut, address = main_state.owner @ PumpFunError::Unauthorised)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [MainState::PREFIX_SEED],
        bump,
        has_one = owner,
    )]
    pub main_state: Account<'info, MainState>,
}
