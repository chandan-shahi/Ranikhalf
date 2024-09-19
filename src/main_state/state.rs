use anchor_lang::prelude::*;

#[account]
pub struct MainState {
    pub initialized: bool,
    pub owner: Pubkey,
    pub fee_recipient: Pubkey,
    pub total_token_supply: u64,
    pub init_virt_base_reserves: u64,
    pub init_real_base_reserves: u64,
    pub init_virt_quote_reserves: u64,
    pub trading_fee: u64,
    pub max_buy_limit: u64
}

impl MainState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();
    pub const PREFIX_SEED: &'static [u8] = b"main";
}
