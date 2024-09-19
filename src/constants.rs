use std::str::FromStr;

use anchor_lang::solana_program::pubkey::Pubkey;

pub const NATIVE_MINT_STR: &'static str = "So11111111111111111111111111111111111111112"; //TODO:

pub const FEE_PER_DIV: u128 = 1000;

pub const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000;    // 1 billion
pub const VIRT_SOL_RESERVE: u64 = 20_000_000_000;       // 69 SOL
pub const REAL_SOL_THRESHOLD: u64 = 60_000_000_000;     // +60 SOL
