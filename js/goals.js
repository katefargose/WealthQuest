// Defines measurable life goals and calculates their progress from game state.
import { assets } from "./market.js";

const clampProgress = (value) => Math.max(0, Math.min(1, value));

function portfolioValue(state) {
	return Object.entries(state.holdings).reduce(
		(total, [assetId, holding]) => total + (state.prices[assetId] ?? 0) * holding.quantity,
		state.cash,
	);
}

export const goals = [
	{
		id: "emergency-fund",
		title: "Emergency fund",
		description: "Keep cash and fixed deposits equal to six months of expenses by month 12.",
		targetMonth: 12,
		check(state) {
			const fixedDepositValue = Object.entries(state.holdings)
				.filter(([assetId, holding]) => assets.find((asset) => asset.id === assetId)?.type === "fixed-deposit" && holding.quantity > 0)
				.reduce((total, [assetId, holding]) => total + (state.prices[assetId] ?? 0) * holding.quantity, 0);
			const target = Math.max(0, state.monthlyExpenses * 6);
			const progress = target === 0 ? 1 : clampProgress((state.cash + fixedDepositValue) / target);
			return { done: state.cash + fixedDepositValue >= target, progress };
		},
	},
	{
		id: "portfolio-target",
		title: "Grow your portfolio",
		description: "Reach a total portfolio value of ₹7,00,000 by month 24.",
		targetMonth: 24,
		check(state) {
			const value = portfolioValue(state);
			return { done: value >= 700000, progress: clampProgress(value / 700000) };
		},
	},
	{
		id: "diversify",
		title: "Diversify",
		description: "Hold assets from at least three different types at the same time by month 6.",
		targetMonth: 6,
		check(state) {
			const types = new Set(
				Object.entries(state.holdings)
					.filter(([, holding]) => holding.quantity > 0)
					.map(([assetId]) => assets.find((asset) => asset.id === assetId)?.type)
					.filter(Boolean),
			);
			return { done: types.size >= 3, progress: clampProgress(types.size / 3) };
		},
	},
	{
		id: "bike-fund",
		title: "Save for a bike",
		description: "Keep ₹80,000 in cash for your dream bike by month 18.",
		targetMonth: 18,
		check(state) {
			return { done: state.cash >= 80000, progress: clampProgress(state.cash / 80000) };
		},
	},
];