// Defines fictional assets and deterministic monthly price updates.
// Monthly drift and volatility are fractional returns (0.01 means 1%).
export const assets = [
	{
		id: "solstice-energy",
		name: "Solstice Energy",
		type: "stock",
		sector: "Energy",
		startPrice: 84,
		monthlyDrift: 0.008,
		volatility: 0.045,
	},
	{
		id: "harbor-health",
		name: "Harbor Health",
		type: "stock",
		sector: "Healthcare",
		startPrice: 126,
		monthlyDrift: 0.006,
		volatility: 0.022,
	},
	{
		id: "circuitforge",
		name: "CircuitForge Systems",
		type: "stock",
		sector: "Technology",
		startPrice: 58,
		monthlyDrift: 0.012,
		volatility: 0.075,
	},
	{
		id: "horizon-index",
		name: "Horizon 500 Index",
		type: "index-fund",
		startPrice: 250,
		monthlyDrift: 0.007,
		volatility: 0.018,
	},
	{
		id: "auric-gold",
		name: "Auric Gold",
		type: "gold",
		startPrice: 190,
		monthlyDrift: 0.004,
		volatility: 0.025,
	},
	{
		id: "steady-deposit",
		name: "Steady Deposit",
		type: "fixed-deposit",
		startPrice: 1000,
		monthlyDrift: 0.003,
		volatility: 0,
	},
];

function createSeededRandom(seed) {
	let state = seed >>> 0;

	return function random() {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

// Prices are keyed by asset ID; missing prices start at each asset's startPrice.
export function nextMonthPrices(prices, seed) {
	const random = createSeededRandom(seed);

	return Object.fromEntries(
		assets.map((asset) => {
			const currentPrice = prices[asset.id] ?? asset.startPrice;
			const noise = (random() * 2 - 1) * asset.volatility;
			const nextPrice = currentPrice * (1 + asset.monthlyDrift + noise);

			return [
				asset.id,
				asset.type === "fixed-deposit"
					? Math.max(currentPrice, nextPrice)
					: nextPrice,
			];
		}),
	);
}

// Returns percentage changes from each asset's starting price.
export function getPercentChanges(prices) {
	return Object.fromEntries(
		assets.map((asset) => {
			const currentPrice = prices[asset.id] ?? asset.startPrice;
			const percentChange = ((currentPrice - asset.startPrice) / asset.startPrice) * 100;
			return [asset.id, percentChange];
		}),
	);
}
