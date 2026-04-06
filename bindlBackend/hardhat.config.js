import "@nomicfoundation/hardhat-toolbox";

const config = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    baseSepolia: {
      url: "https://base-sepolia.g.alchemy.com/v2/sKfZqk-KCLfeKO0mWoZfO",
      chainId: 84532,
      accounts: [
        "0x75bce5373f451863d9350014028c5771b4e40869fbc1f2a2f4aea1fdb8825566",
      ],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
