// Defines seeded life events and applies their effects to game state.
import { assets } from "./market.js";

const HOT_TIP_INVESTMENT = 20000;

export const lifeEvents = [
	{
		id: "medical-bill",
		tone: "bad",
		title: "Medical Bill",
		description: "An unexpected medical bill arrives.",
		effect: { type: "cash", amount: -25000 },
	},
	{
		id: "diwali-bonus",
		tone: "good",
		title: "Diwali Bonus",
		description: "Your employer sends a festive bonus.",
		effect: { type: "cash", amount: 30000 },
	},
	{
		id: "phone-repair",
		tone: "bad",
		title: "Phone Repair",
		description: "Your phone needs an urgent repair.",
		effect: { type: "cash", amount: -8000 },
	},
	{
		id: "job-loss",
		tone: "bad",
		title: "Job Loss",
		description: "Your position is eliminated. Monthly income pauses for three months.",
		effect: { type: "job-loss", months: 3 },
	},
	{
		id: "market-crash",
		tone: "bad",
		title: "Market Crash",
		description: "A sudden sell-off pushes stock prices down by 10% to 15%.",
		effect: { type: "market-crash" },
	},
	{
		id: "tax-refund",
		tone: "good",
		title: "Tax Refund",
		description: "A corrected tax filing brings a refund.",
		effect: { type: "cash", amount: 12000 },
	},
	{
		id: "friends-wedding",
		tone: "decision",
		title: "Friend's Wedding",
		description: "A close friend invites you to their wedding.",
		choices: [
			{ id: "attend", label: "Attend and spend ₹15,000", effect: { type: "cash", amount: -15000 } },
			{ id: "skip", label: "Skip the wedding and feel guilty", effect: { type: "cash", amount: 0 } },
		],
	},
	{
		id: "dream-bike",
		tone: "decision",
		title: "Dream Bike",
		description: "The bike you've wanted for years is available for ₹80,000.",
		choices: [
			{ id: "buy", label: "Buy the bike for ₹80,000", effect: { type: "cash", amount: -80000 } },
			{ id: "skip", label: "Skip it", effect: { type: "cash", amount: 0 } },
		],
	},
	{
		id: "hot-stock-tip",
		tone: "decision",
		title: "Hot Stock Tip",
		description: "A stranger tips you off about a stock. Invest up to ₹20,000 in one random stock, but the tip is a trap and that stock will fall 20% next month.",
		choices: [
			{ id: "invest", label: "Invest up to ₹20,000", effect: { type: "hot-stock-tip" } },
			{ id: "ignore", label: "Ignore the tip", effect: { type: "cash", amount: 0 } },
		],
	},
	{
		id: "appliance-breakdown",
		tone: "bad",
		title: "Appliance Breakdown",
		description: "A household appliance breaks down and needs replacement.",
		effect: { type: "cash", amount: -18000 },
	},
	{
		id: "freelance-gig",
		tone: "good",
		title: "Freelance Gig",
		description: "A short freelance project pays better than expected.",
		effect: { type: "cash", amount: 20000 },
	},
	{
		id: "rent-increase",
		tone: "bad",
		title: "Rent Increase",
		description: "Your landlord raises the rent by ₹5,000 per month.",
		effect: { type: "monthly-expenses", amount: 5000 },
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

function updateCurrentHistory(state) {
	const latestPrices = state.priceHistory?.at(-1);
	if (latestPrices?.month === state.month) {
		latestPrices.prices = { ...state.prices };
	}

	const latestValue = state.valueHistory?.at(-1);
	if (latestValue?.month === state.month) {
		latestValue.value = Object.entries(state.holdings).reduce(
			(total, [assetId, holding]) => total + (state.prices[assetId] ?? 0) * holding.quantity,
			state.cash,
		);
	}
}

function applyCashChange(state, amount, message) {
	state.cash += amount;
	updateCurrentHistory(state);
	return { message, cashChange: amount };
}

function applyJobLoss(state, months) {
	const remainingMonths = Number.isInteger(state.jobLossMonthsRemaining)
		? state.jobLossMonthsRemaining
		: 0;
	if (!remainingMonths) {
		state.jobLossReturnIncome = Number.isFinite(state.monthlyIncome) ? state.monthlyIncome : 35000;
	}
	state.jobLossMonthsRemaining = Math.max(remainingMonths, months);
	state.monthlyIncome = 0;
	return { message: `Monthly income has paused for ${months} months.`, cashChange: 0 };
}

function applyMarketCrash(state) {
	const random = createSeededRandom(((state.seed ?? 0) ^ Math.imul(state.month ?? 0, 0x85ebca6b)) >>> 0);
	const decline = 0.1 + random() * 0.05;
	const stocks = assets.filter((asset) => asset.type === "stock");
	for (const asset of stocks) {
		state.prices[asset.id] = (state.prices[asset.id] ?? asset.startPrice) * (1 - decline);
	}
	updateCurrentHistory(state);
	return { message: `Stock prices fell ${(decline * 100).toFixed(1)}%.`, cashChange: 0 };
}

function applyHotStockTip(state) {
	const random = createSeededRandom(((state.seed ?? 0) ^ Math.imul(state.month ?? 0, 0xc2b2ae35)) >>> 0);
	const stocks = assets.filter((asset) => asset.type === "stock");
	const asset = stocks[Math.floor(random() * stocks.length)];
	const price = state.prices[asset.id] ?? asset.startPrice;
	const quantity = Math.floor(HOT_TIP_INVESTMENT / price);
	const cost = quantity * price;
	if (quantity < 1 || state.cash < cost) {
		return { message: "You don't have enough cash to follow the stock tip.", cashChange: 0 };
	}

	const holding = state.holdings[asset.id];
	const oldQuantity = holding?.quantity ?? 0;
	const newQuantity = oldQuantity + quantity;
	state.cash -= cost;
	state.holdings[asset.id] = {
		quantity: newQuantity,
		avgBuyPrice: holding
			? (holding.avgBuyPrice * oldQuantity + cost) / newQuantity
			: price,
	};
	state.pendingPriceChanges ??= [];
	state.pendingPriceChanges.push({
		dueMonth: state.month + 1,
		assetId: asset.id,
		change: -0.2,
	});
	state.journal ??= [];
	state.journal.push({
		month: state.month,
		action: "Buy",
		assetId: asset.id,
		assetName: asset.name,
		quantity,
		price,
		profitLoss: null,
		reason: "Hot stock tip",
		note: "Event investment; 20% price drop scheduled next month.",
	});
	updateCurrentHistory(state);
	return { message: `Bought ${quantity} shares of ${asset.name}; the tip is a trap.`, cashChange: -cost };
}

export function pickEvent(month, seed, state) {
	const eventState = state && typeof state === "object" ? state : {};
	if (eventState.lastEventMonth === month) {
		return lifeEvents.find((event) => event.id === eventState.lastEventId) ?? null;
	}

	const monthSeed = ((seed >>> 0) ^ Math.imul(month >>> 0, 0x9e3779b9)) >>> 0;
	const random = createSeededRandom(monthSeed);
	if (random() >= 0.4) {
		eventState.lastEventMonth = month;
		eventState.lastEventId = null;
		return null;
	}

	const candidates = lifeEvents.filter((event) => event.id !== eventState.previousEventId);
	const event = candidates[Math.floor(random() * candidates.length)];
	eventState.lastEventMonth = month;
	eventState.lastEventId = event.id;
	eventState.previousEventId = event.id;
	return event;
}

export function applyEventEffect(state, eventId, choiceId) {
	const event = lifeEvents.find((item) => item.id === eventId);
	if (!event) {
		return { message: "Event not found.", cashChange: 0 };
	}

	const choice = event.choices?.find((item) => item.id === choiceId);
	const effect = event.choices ? choice?.effect : event.effect;
	if (!effect) {
		return { message: "Choose an option for this event.", cashChange: 0 };
	}

	switch (effect.type) {
		case "cash":
			return applyCashChange(
				state,
				effect.amount,
				choice ? `${choice.label}.` : effect.amount < 0 ? `${event.title} cost money.` : `${event.title} applied.`,
			);
		case "job-loss":
			return applyJobLoss(state, effect.months);
		case "market-crash":
			return applyMarketCrash(state);
		case "monthly-expenses":
			state.monthlyExpenses += effect.amount;
			return { message: `Monthly expenses increased by ${effect.amount}.`, cashChange: 0 };
		case "hot-stock-tip":
			return applyHotStockTip(state);
		default:
			return { message: "This event has no effect.", cashChange: 0 };
	}
}