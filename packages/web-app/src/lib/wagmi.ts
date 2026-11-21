import { createConfig, http } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const TARGET_CHAIN_ID = Number(import.meta.env.VITE_BSC_CHAIN_ID || 56);

export const wagmiConfig = createConfig({
  chains: [bsc, bscTestnet],
  connectors: [
    // Supports MetaMask, Binance Web3 Wallet in-app browser, OKX Wallet, Trust Wallet
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [bsc.id]: http('https://bsc-dataseed.binance.org/'),
    [bscTestnet.id]: http('https://data-seed-prebsc-1-s1.bnbchain.org:8545'),
  },
});
