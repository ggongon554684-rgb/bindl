import { createConfig, http, createStorage, cookieStorage } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const ganache = defineChain({
  id: 1337,
  name: "Ganache Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:7545"] },
  },
});

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

export const wagmiConfig = createConfig({
  chains: [ganache, baseSepolia],
  connectors: [
    injected(), // MetaMask first — persists automatically
    coinbaseWallet({ appName: "Bindl" }), // removed smartWalletOnly
    walletConnect({ projectId }),
  ],
  transports: {
    [ganache.id]: http("http://127.0.0.1:7545"),
    [baseSepolia.id]: http(),
  },
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
});

export { baseSepolia, ganache };
