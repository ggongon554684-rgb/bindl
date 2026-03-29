"use client";

import { useSession } from "next-auth/react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Avatar, Name, Address, Identity, EthBalance } from "@coinbase/onchainkit/identity";

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const { isConnected, address }  = useAccount();
  const router = useRouter();

  // Redirect if not logged in
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Redirect to dashboard once wallet is connected
  useEffect(() => {
    if (isConnected) {
      setTimeout(() => router.push("/dashboard"), 1500);
    }
  }, [isConnected, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex min-h-[80vh] flex-col items-center justify-center">
      <div className="w-full max-w-sm">

        {/* Progress steps */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {/* Step 1 - done */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500">
              <i className="bi bi-check2 text-sm text-gray-950" />
            </div>
            <span className="text-xs text-green-400">Account</span>
          </div>

          <div className="h-px w-8 bg-white/10" />

          {/* Step 2 - active */}
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${
              isConnected
                ? "border-green-500 bg-green-500"
                : "border-green-500 bg-transparent"
            }`}>
              {isConnected
                ? <i className="bi bi-check2 text-sm text-gray-950" />
                : <span className="text-xs font-bold text-green-400">2</span>
              }
            </div>
            <span className={`text-xs ${isConnected ? "text-green-400" : "text-white"}`}>
              Wallet
            </span>
          </div>

          <div className="h-px w-8 bg-white/10" />

          {/* Step 3 - pending */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/10">
              <span className="text-xs font-bold text-gray-600">3</span>
            </div>
            <span className="text-xs text-gray-600">Dashboard</span>
          </div>
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          {isConnected ? (
            <>
              <div className="mb-4 flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-green-500/20">
                <i className="bi bi-check-circle-fill text-2xl text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Wallet connected!</h1>
              <p className="mt-2 text-sm text-gray-400">
                Redirecting you to your dashboard…
              </p>
            </>
          ) : (
            <>
              <div className="mb-4 flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-green-500/20">
                <i className="bi bi-wallet2 text-2xl text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Connect your wallet</h1>
              <p className="mt-2 text-sm text-gray-400">
                A wallet is required to create and manage escrow contracts on Base Sepolia.
              </p>
            </>
          )}
        </div>

        {/* Wallet connect card */}
        {!isConnected && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">

            {/* User info */}
            {session?.user && (
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                {session.user.image && (
                  <img
                    src={session.user.image}
                    alt="avatar"
                    className="h-8 w-8 rounded-full"
                  />
                )}
                <div>
                  <p className="text-sm font-medium text-white">{session.user.name}</p>
                  <p className="text-xs text-gray-500">{session.user.email}</p>
                </div>
                <i className="bi bi-check-circle-fill ml-auto text-green-400" />
              </div>
            )}

            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Connect wallet
            </p>

            <Wallet>
              <ConnectWallet className="w-full rounded-xl bg-green-500 px-4 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400">
                <Avatar className="h-5 w-5" />
                <Name />
              </ConnectWallet>
              <WalletDropdown>
                <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                  <Avatar />
                  <Name />
                  <Address />
                  <EthBalance />
                </Identity>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>

            <div className="mt-4 space-y-2">
              {[
                { icon: "bi-shield-check", text: "Supports Coinbase Wallet, MetaMask, WalletConnect" },
                { icon: "bi-coin",         text: "You'll need testnet USDC to lock funds"            },
                { icon: "bi-wifi",         text: "Make sure you're on Base Sepolia network"           },
              ].map((item) => (
                <div key={item.text} className="inline-flex items-center gap-2 text-xs text-gray-500">
                  <i className={`bi ${item.icon} text-green-500`} />
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected state */}
        {isConnected && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              <p className="text-sm text-green-400 font-medium">
                Taking you to your dashboard…
              </p>
              <p className="font-mono text-xs text-gray-500">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}