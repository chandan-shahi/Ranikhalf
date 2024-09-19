use crate::{
    constants::NATIVE_MINT_STR,
    MainState, PoolState,
    CreateEvent,
    error::PumpFunError,
    utils::{check_balance_on_pool_creator, sync_native_amount},
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, SyncNative, Token, TokenAccount, Transfer},
};

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Copy, Debug)]
pub struct CreatePoolInput {
    pub base_amount: u64,
    pub quote_amount: u64,
}

pub fn create_pool(ctx: Context<ACreatePool>, input: CreatePoolInput) -> Result<()> {
    let main_state = &mut ctx.accounts.main_state;
    require!(main_state.initialized.eq(&true), PumpFunError::Uninitialized);

    let pool_state = &mut ctx.accounts.pool_state;
    let creator = ctx.accounts.creator.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();
    let creator_base_ata = &ctx.accounts.creator_base_ata;
    let creator_quote_ata = &ctx.accounts.creator_quote_ata;

    // require!(
    //     input.base_amount.gte(&main_state.init_real_base_reserves),
    //     PumpFunError::InsufficientFund
    // );

    pool_state.owner = creator.key();
    pool_state.base_mint = creator_base_ata.mint;
    pool_state.quote_mint = creator_quote_ata.mint;
    pool_state.real_base_reserves = main_state.init_real_base_reserves;
    pool_state.virt_base_reserves = input.base_amount - main_state.init_real_base_reserves;
    pool_state.real_quote_reserves = input.quote_amount;
    pool_state.virt_quote_reserves = main_state.init_virt_quote_reserves;
    pool_state.konst = (pool_state.real_base_reserves as u128)
        .checked_mul((pool_state.virt_quote_reserves + pool_state.real_quote_reserves) as u128)
        .unwrap();

    //handler wrap sol
    if (creator_base_ata.mint.to_string() == NATIVE_MINT_STR) {
        sync_native_amount(
            creator.clone(),
            creator_base_ata,
            input.base_amount,
            system_program.clone(),
            token_program.clone(),
        )?;
    }
    //handler wrap sol
    if (creator_quote_ata.mint.to_string() == NATIVE_MINT_STR) {
        sync_native_amount(
            creator.clone(),
            creator_quote_ata,
            input.quote_amount,
            system_program.clone(),
            token_program.clone(),
        )?;
    }

    // //transfer
    let base_transfer_cpi_accounts = Transfer {
        from: ctx.accounts.creator_base_ata.to_account_info(),
        to: ctx.accounts.reserver_base_ata.to_account_info(),
        authority: creator.clone(),
    };
    token::transfer(
        CpiContext::new(token_program.to_account_info(), base_transfer_cpi_accounts),
        input.base_amount,
    )?;
    if(input.quote_amount > 0) {
        let quote_transfer_cpi_accounts = Transfer {
            from: ctx.accounts.creator_quote_ata.to_account_info(),
            to: ctx.accounts.reserver_quote_ata.to_account_info(),
            authority: creator.clone(),
        };
        token::transfer(
            CpiContext::new(token_program.to_account_info(), quote_transfer_cpi_accounts),
            input.quote_amount,
        )?;
    }

    emit!(CreateEvent {
        creator: pool_state.owner, 
        base_mint: pool_state.base_mint, 
        // quote_mint: pool_state.quote_mint, 
        base_reserves: pool_state.real_base_reserves + pool_state.virt_base_reserves, 
        quote_reserves: pool_state.virt_quote_reserves + pool_state.real_quote_reserves, 
        timestamp: Clock::get()?.unix_timestamp
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(input: CreatePoolInput)]
pub struct ACreatePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [MainState::PREFIX_SEED],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,
    #[account(
        init_if_needed,
        payer = creator,
        seeds =[
            PoolState::PREFIX_SEED,
            base_mint.key().as_ref(),
            quote_mint.key().as_ref(),
        ],
        bump,
        space = 8 + PoolState::MAX_SIZE
    )]
    pub pool_state: Box<Account<'info, PoolState>>,

    pub base_mint: Box<Account<'info, Mint>>,
    #[account(constraint = quote_mint.key().to_string() == NATIVE_MINT_STR @ PumpFunError::UnknownToken)]
    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer=creator,
        associated_token::mint =base_mint,
        associated_token::authority = creator,
        constraint = check_balance_on_pool_creator(creator_base_ata.as_ref(), input.base_amount) @ PumpFunError::InsufficientFund
    )]
    pub creator_base_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer=creator,
        associated_token::mint =quote_mint,
        associated_token::authority = creator,
        constraint = check_balance_on_pool_creator(creator_quote_ata.as_ref(), input.quote_amount) @ PumpFunError::InsufficientFund
    )]
    pub creator_quote_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer=creator,
        associated_token::mint = base_mint,
        associated_token::authority = pool_state,
        // constraint = reserver_base_ata.amount == 0
    )]
    pub reserver_base_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = quote_mint,
        associated_token::authority = pool_state,
        // constraint = reserver_quote_ata.amount == 0
    )]
    pub reserver_quote_ata: Box<Account<'info, TokenAccount>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
