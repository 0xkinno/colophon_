use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

// Discriminator for Colophon statement commitment account: "COLOPHON" in ASCII
pub const STATEMENT_DISCRIMINATOR: [u8; 8] = [0x43, 0x4f, 0x4c, 0x4f, 0x50, 0x48, 0x4f, 0x4e];
pub const STATEMENT_SEED: &[u8] = b"colophon_statement";
pub const STATEMENT_RECORD_SIZE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1; // 154 bytes

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Instruction discriminator:
    // 0x00 or [0x00, 0x01, ...] -> AnchorStatement
    // Required minimum instruction data:
    // tag (1 byte) + statement_hash (32 bytes) + instrument_mint (32 bytes) + evidence_root (32 bytes) + effective_timestamp (8 bytes) + schema_version (1 byte) = 106 bytes
    if instruction_data.len() < 106 {
        msg!("Colophon: Instruction data too short. Expected at least 106 bytes.");
        return Err(ProgramError::InvalidInstructionData);
    }

    let tag = instruction_data[0];
    if tag != 0 {
        msg!("Colophon: Unknown instruction tag {}", tag);
        return Err(ProgramError::InvalidInstructionData);
    }

    let mut offset = 1;
    let mut statement_hash = [0u8; 32];
    statement_hash.copy_from_slice(&instruction_data[offset..offset + 32]);
    offset += 32;

    let mut instrument_mint = [0u8; 32];
    instrument_mint.copy_from_slice(&instruction_data[offset..offset + 32]);
    offset += 32;

    let mut evidence_root = [0u8; 32];
    evidence_root.copy_from_slice(&instruction_data[offset..offset + 32]);
    offset += 32;

    let mut ts_bytes = [0u8; 8];
    ts_bytes.copy_from_slice(&instruction_data[offset..offset + 8]);
    let effective_timestamp = i64::from_le_bytes(ts_bytes);
    offset += 8;

    let schema_version = instruction_data[offset];

    let account_info_iter = &mut accounts.iter();
    let payer_info = next_account_info(account_info_iter)?;
    let statement_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;

    // 1. Verify payer is a signer
    if !payer_info.is_signer {
        msg!("Colophon: Payer must be a signer.");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // 2. Verify deterministic PDA derivation
    let (expected_pda, bump) =
        Pubkey::find_program_address(&[STATEMENT_SEED, &statement_hash], program_id);

    if expected_pda != *statement_info.key {
        msg!("Colophon: Provided statement PDA does not match derived PDA.");
        return Err(ProgramError::InvalidSeeds);
    }

    // 3. Create account if uninitialized
    if statement_info.data_len() == 0 {
        let rent = Rent::get()?;
        let required_lamports = rent.minimum_balance(STATEMENT_RECORD_SIZE);

        let signer_seeds: &[&[u8]] = &[STATEMENT_SEED, &statement_hash, &[bump]];

        invoke_signed(
            &system_instruction::create_account(
                payer_info.key,
                statement_info.key,
                required_lamports,
                STATEMENT_RECORD_SIZE as u64,
                program_id,
            ),
            &[payer_info.clone(), statement_info.clone(), system_program_info.clone()],
            &[signer_seeds],
        )?;
    } else {
        // Prevent overwriting an already anchored statement
        let existing_data = statement_info.data.borrow();
        if existing_data.len() >= 8 && existing_data[0..8] == STATEMENT_DISCRIMINATOR {
            msg!("Colophon: Statement has already been anchored. Immutability preserved.");
            return Err(ProgramError::AccountAlreadyInitialized);
        }
    }

    // 4. Record commitment
    let clock = Clock::get()?;
    let slot = clock.slot;

    let mut data = statement_info.data.borrow_mut();
    if data.len() < STATEMENT_RECORD_SIZE {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut write_pos = 0;
    // Discriminator
    data[write_pos..write_pos + 8].copy_from_slice(&STATEMENT_DISCRIMINATOR);
    write_pos += 8;

    // Wallet (payer)
    data[write_pos..write_pos + 32].copy_from_slice(payer_info.key.as_ref());
    write_pos += 32;

    // Instrument Mint
    data[write_pos..write_pos + 32].copy_from_slice(&instrument_mint);
    write_pos += 32;

    // Statement Hash
    data[write_pos..write_pos + 32].copy_from_slice(&statement_hash);
    write_pos += 32;

    // Evidence Root
    data[write_pos..write_pos + 32].copy_from_slice(&evidence_root);
    write_pos += 32;

    // Effective Timestamp
    data[write_pos..write_pos + 8].copy_from_slice(&effective_timestamp.to_le_bytes());
    write_pos += 8;

    // Slot
    data[write_pos..write_pos + 8].copy_from_slice(&slot.to_le_bytes());
    write_pos += 8;

    // Schema Version
    data[write_pos] = schema_version;
    write_pos += 1;

    // Bump
    data[write_pos] = bump;

    msg!(
        "Colophon: Statement anchored successfully. PDA: {}, Slot: {}, EffectiveTs: {}",
        statement_info.key,
        slot,
        effective_timestamp
    );

    Ok(())
}
