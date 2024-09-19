#![allow(unused)]

use anchor_lang::prelude::*;

pub mod main_state;
pub mod pool;

pub mod constants;
pub mod error;
pub mod utils;

use main_state::*;
use pool::*;

declare_id!("5BXzjtQpmqdXeDNmThjDYHsjFGviDCeW58SpumTW86Fa");

#[program]
pub mod pump_fun {
    use super::*;

    pub fn init_main_state(ctx: Context<AInitMainState>) -> Result<()> {
        main_state::init_main_state(ctx)
    }

    pub fn update_main_state(ctx: Context<AUpdateMainState>, input: UpdateMainStateInput) -> Result<()> {
        main_state::update_main_state(ctx, input)
    }

    
    pub fn create_pool(ctx: Context<ACreatePool>, input: CreatePoolInput) -> Result<()> {
        pool::create_pool(ctx, input)
    }

    pub fn buy(ctx: Context<ABuy>, amount: u64) -> Result<()> {
        pool::buy(ctx, amount)
    }

    pub fn sell(ctx: Context<ASell>, amount: u64) -> Result<()> {
        pool::sell(ctx, amount)
    }
    
    pub fn withdraw(ctx: Context<AWithdrawState>) -> Result<()> {
        pool::withdraw(ctx)
    }
}
