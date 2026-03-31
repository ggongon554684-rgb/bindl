"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import Image from "next/image";

export function Navbar() {
  const { data: session } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-gray-950/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold text-white"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500 text-sm font-bold text-gray-950">
            Bi
          </span>
          <span className="text-sm tracking-tight">Bindl</span>
        </Link>

        {/* Nav links */}
        {session && (
          <div className="hidden items-center gap-6 sm:flex">
            <Link
              href="/dashboard"
              onClick={() => setDropdownOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
            >
              <i className="bi bi-speedometer2" />
              Dashboard
            </Link>
            <Link
              href="/create"
              onClick={() => setDropdownOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
            >
              <i className="bi bi-file-earmark-plus" />
              Create Contract
            </Link>
          </div>
        )}

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-3">
          {session ? (
            <>
              {/* Wallet — force inline so it doesn't break the flex row */}
              <div className="flex items-center [&>div]:flex [&>div]:items-center">
                <Wallet>
                  <ConnectWallet className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-gray-950 transition-colors hover:bg-green-400">
                    <Avatar className="h-5 w-5 shrink-0" />
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
              </div>

              {/* User avatar dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white transition hover:bg-white/10"
                >
                  {session.user?.image ? (
                    <Image
                      src={session.user.image}
                      alt="avatar"
                      width={22}
                      height={22}
                      className="rounded-full"
                    />
                  ) : (
                    <i className="bi bi-person-circle text-lg" />
                  )}
                  <span className="hidden text-xs sm:block">
                    {session.user?.name?.split(" ")[0]}
                  </span>
                  <i
                    className={`bi ${dropdownOpen ? "bi-chevron-up" : "bi-chevron-down"} text-xs text-gray-500`}
                  />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-gray-900 p-1 shadow-xl">
                    <div className="border-b border-white/5 px-3 py-2">
                      <p className="text-xs font-medium text-white">
                        {session.user?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {session.user?.email}
                      </p>
                    </div>
                    <Link
                      href="/dashboard"
                      onClick={() => setDropdownOpen(false)}
                      className="mt-1 inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-400 transition hover:bg-white/5 hover:text-white"
                    >
                      <i className="bi bi-speedometer2" />
                      Dashboard
                    </Link>
                    <Link
                      href="/create"
                      onClick={() => setDropdownOpen(false)}
                      className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-400 transition hover:bg-white/5 hover:text-white"
                    >
                      <i className="bi bi-file-earmark-plus" />
                      Create Contract
                    </Link>
                    <button
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="mt-1 inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-400 transition hover:bg-white/5 hover:text-red-300"
                    >
                      <i className="bi bi-box-arrow-right" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-gray-950 transition hover:bg-green-400"
            >
              <i className="bi bi-person-circle" />
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
