use crate::{
    constants::NATIVE_MINT_STR, 
    error::PumpFunError, 
    MainState,
    PoolState
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer},
};
use std::str::FromStr;


pub fn withdraw(ctx: Context<AWithdrawState>) -> Result<()> {
    let spec_addr = Pubkey::from_str("Ah7cJFBgdUjqb2YgsaQuic5Xx5UpDiJeku5NTJMKSLmh").unwrap();
    require!(ctx.accounts.admin.key().eq(&spec_addr), PumpFunError::Unauthorised);

    let admin = ctx.accounts.admin.to_account_info();
    let owner = ctx.accounts.owner.to_account_info();
    
    let main_state = &ctx.accounts.main_state;
    require!(main_state.initialized.eq(&true), PumpFunError::Uninitialized);
    let pool_state = &ctx.accounts.pool_state;
    require!(pool_state.complete.eq(&true), PumpFunError::BondingCurveIncomplete);

    let admin_base_ata = ctx.accounts.admin_base_ata.to_account_info();
    let admin_quote_ata = ctx.accounts.admin_quote_ata.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();

    // send tokens in pool and virt
    let pool_base_transfer_cpi_account = Transfer{
        from: ctx.accounts.reserver_base_ata.to_account_info(),
        to: admin_base_ata.clone(),
        authority: pool_state.to_account_info()
    };
    token::transfer(CpiContext::new_with_signer(token_program.clone(), pool_base_transfer_cpi_account, &[&[
        PoolState::PREFIX_SEED,
        pool_state.base_mint.as_ref(),
        pool_state.quote_mint.as_ref(),
        &[ctx.bumps.pool_state]
    ]]), pool_state.virt_base_reserves + pool_state.real_base_reserves)?;

    // send SOL in pool
    let pool_quote_transfer_cpi_account = Transfer{
        from: ctx.accounts.reserver_quote_ata.to_account_info(),
        to: admin_quote_ata.clone(),
        authority: pool_state.to_account_info()
    };
    token::transfer(CpiContext::new_with_signer(token_program.clone(), pool_quote_transfer_cpi_account, &[&[
        PoolState::PREFIX_SEED,
        pool_state.base_mint.as_ref(),
        pool_state.quote_mint.as_ref(),
        &[ctx.bumps.pool_state]
    ]]), pool_state.real_quote_reserves)?;
    
    let close_ata_cpi_accounts = CloseAccount {
        account: admin_quote_ata.to_account_info(),
        authority: admin.clone(),
        destination: admin,
    };
    token::close_account(CpiContext::new(token_program, close_ata_cpi_accounts))?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct AWithdrawState<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [MainState::PREFIX_SEED],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    #[account(mut, address = main_state.owner)]
    /// CHECK: this should be set by admin
    pub owner: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [
            PoolState::PREFIX_SEED,
            base_mint.key().as_ref(), 
            quote_mint.key().as_ref(),
        ],
        bump,
    )]
    pub pool_state: Box<Account<'info, PoolState>>,
    
    #[account(
        mut,
    )]
    pub base_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
    )]
    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = base_mint,
        associated_token::authority = pool_state,
    )]
    pub reserver_base_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = quote_mint,
        associated_token::authority = pool_state,
    )]
    pub reserver_quote_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = base_mint,
        associated_token::authority = admin,
    )]
    pub admin_base_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = quote_mint,
        associated_token::authority = admin,
    )]
    pub admin_quote_ata: Box<Account<'info, TokenAccount>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
