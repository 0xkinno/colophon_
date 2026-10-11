"use client";
import React from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

export const DEVNET_RPC = process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";

// Wallets (Phantom, Solflare, Backpack and others) are discovered through the Wallet Standard.
const NO_EXPLICIT_WALLETS: never[] = [];

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <WalletProvider wallets={NO_EXPLICIT_WALLETS} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
