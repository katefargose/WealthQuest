// Owns persisted game state and applies trades, cash flow, events, and month advancement.
import { assets, nextMonthPrices } from "./market.js";
import { applyEventEffect, pickEvent } from "./events.js";

const SAVE_KEY = "wealthquest-save";
const INITIAL_CASH = 500000;
const INITIAL_SEED = 12345;
const INITIAL_MONTHLY_INCOME = 35000;
const INITIAL_MONTHLY_EXPENSES = 22000;
const FORCED_SALE_PENALTY = 0.02;
const FINAL_MONTH = 24;
const EARLIEST_EARLY_END_MONTH = 6;

function createInitialState() {
	const prices = Object.fromEntries(
		assets.map((asset) => [asset.id, asset.startPrice]),
	);

	return {
		playerName: "Player",
		month: 1,
		cash: INITIAL_CASH,
		monthlyIncome: INITIAL_MONTHLY_INCOME,
		monthlyExpenses: INITIAL_MONTHLY_EXPENSES,
		jobLossMonthsRemaining: 0,
		jobLossReturnIncome: INITIAL_MONTHLY_INCOME,
		holdings: {},
		prices,
		priceHistory: [{ month: 1, prices: { ...prices } }],
		valueHistory: [{ month: 1, value: INITIAL_CASH }],
		cashFlowLog: [],
		pendingPriceChanges: [],
		lastEventId: null,
		lastEventMonth: null,
		previousEventId: null,
		currentEvent: null,
		pendingChoice: null,
		eventLog: [],
		gameOver: false,
		gameOverReason: null,
		journal: [],
		seed: INITIAL_SEED,
	};
}

// Keep this object stable so other modules can retain its reference.
export const gameState = createInitialState();

export function newGame() {
	Object.assign(gameState, createInitialState());
	return gameState;
}

export function saveGame() {
	try {
		localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
		return true;
	} catch {
		return false;
	}
}

export function loadGame() {
	try {
		const savedState = JSON.parse(localStorage.getItem(SAVE_KEY));
		if (!savedState || typeof savedState !== "object" || Array.isArray(savedState)) {
			return false;
		}

		if (
			!Number.isInteger(savedState.month) ||
			!Number.isFinite(savedState.cash) ||
			!savedState.holdings ||
			typeof savedState.holdings !== "object" ||
			!savedState.prices ||
			typeof savedState.prices !== "object" ||
			!Array.isArray(savedState.priceHistory) ||
			!Array.isArray(savedState.journal) ||
			!Number.isInteger(savedState.seed)
		) {
			return false;
		}

		if (!Array.isArray(savedState.valueHistory) || savedState.valueHistory.length === 0) {
			const currentValue = Object.entries(savedState.holdings).reduce(
				(total, [assetId, holding]) => total + (savedState.prices[assetId] ?? 0) * holding.quantity,
				savedState.cash,
			);
			savedState.valueHistory = [{ month: 1, value: INITIAL_CASH }];
			if (savedState.month > 1) {
				savedState.valueHistory.push({ month: savedState.month, value: currentValue });
			}
		}
		savedState.monthlyIncome = Number.isFinite(savedState.monthlyIncome)
			? savedState.monthlyIncome
			: INITIAL_MONTHLY_INCOME;
		savedState.monthlyExpenses = Number.isFinite(savedState.monthlyExpenses)
			? savedState.monthlyExpenses
			: INITIAL_MONTHLY_EXPENSES;
		if (!Array.isArray(savedState.cashFlowLog)) {
			savedState.cashFlowLog = [];
		}
		if (!Number.isInteger(savedState.jobLossMonthsRemaining) || savedState.jobLossMonthsRemaining < 0) {
			savedState.jobLossMonthsRemaining = 0;
		}
		if (!Number.isFinite(savedState.jobLossReturnIncome)) {
			savedState.jobLossReturnIncome = savedState.monthlyIncome;
		}
		if (!Array.isArray(savedState.pendingPriceChanges)) {
			savedState.pendingPriceChanges = [];
		}
		if (typeof savedState.lastEventId !== "string") {
			savedState.lastEventId = null;
		}
		if (typeof savedState.previousEventId !== "string") {
			savedState.previousEventId = savedState.lastEventId;
		}
		if (!Number.isInteger(savedState.lastEventMonth)) {
			savedState.lastEventMonth = null;
		}
		if (!savedState.currentEvent || typeof savedState.currentEvent !== "object") {
			savedState.currentEvent = null;
		}
		if (!savedState.pendingChoice || typeof savedState.pendingChoice !== "object") {
			savedState.pendingChoice = null;
		}
		if (!Array.isArray(savedState.eventLog)) {
			savedState.eventLog = [];
		}
		savedState.gameOver = savedState.gameOver === true;
		savedState.playerName = typeof savedState.playerName === "string" && savedState.playerName.trim()
			? savedState.playerName.trim()
			: "Player";
		if (typeof savedState.gameOverReason !== "string") {
			savedState.gameOverReason = null;
		}

		Object.assign(gameState, savedState);
		return true;
	} catch {
		return false;
	}
}

export function resetGame() {
	return newGame();
}

export function getPortfolioValue() {
	return Object.entries(gameState.holdings).reduce(
		(total, [assetId, holding]) =>
			total + (gameState.prices[assetId] ?? 0) * holding.quantity,
		gameState.cash,
	);
}

function validateTrade(assetId, quantity, reason) {
	const asset = assets.find((item) => item.id === assetId);
	if (!asset) {
		return { error: "Unknown asset." };
	}
	if (!Number.isInteger(quantity) || quantity <= 0) {
		return { error: "Quantity must be a positive whole number." };
	}
	if (typeof reason !== "string" || reason.trim().length === 0) {
		return { error: "Reason must not be empty." };
	}

	return { asset };
}

export function buyAsset(assetId, quantity, reason, note = "") {
	const validation = validateTrade(assetId, quantity, reason);
	if (validation.error) {
		return { ok: false, message: validation.error };
	}

	const { asset } = validation;
	const price = gameState.prices[assetId] ?? asset.startPrice;
	const totalCost = price * quantity;
	if (totalCost > gameState.cash) {
		return { ok: false, message: "Not enough cash to complete this purchase." };
	}

	const holding = gameState.holdings[assetId];
	const previousQuantity = holding?.quantity ?? 0;
	const totalQuantity = previousQuantity + quantity;
	const avgBuyPrice = holding
		? (holding.avgBuyPrice * previousQuantity + totalCost) / totalQuantity
		: price;

	gameState.cash -= totalCost;
	gameState.holdings[assetId] = { quantity: totalQuantity, avgBuyPrice };
	gameState.journal.push({
		month: gameState.month,
		action: "Buy",
		assetId,
		assetName: asset.name,
		quantity,
		price,
		profitLoss: null,
		reason: reason.trim(),
		note: typeof note === "string" ? note.trim() : "",
	});
	saveGame();

	return { ok: true, message: `Bought ${quantity} unit${quantity === 1 ? "" : "s"} of ${asset.name}.` };
}

export function sellAsset(assetId, quantity, reason, note = "") {
	const validation = validateTrade(assetId, quantity, reason);
	if (validation.error) {
		return { ok: false, message: validation.error };
	}

	const { asset } = validation;
	const holding = gameState.holdings[assetId];
	if (!holding || holding.quantity < quantity) {
		return { ok: false, message: "Not enough units held to complete this sale." };
	}

	const price = gameState.prices[assetId] ?? asset.startPrice;
	const proceeds = price * quantity;
	const profitLoss = (price - holding.avgBuyPrice) * quantity;
	gameState.cash += proceeds;
	if (holding.quantity === quantity) {
		delete gameState.holdings[assetId];
	} else {
		holding.quantity -= quantity;
	}
	gameState.journal.push({
		month: gameState.month,
		action: "Sell",
		assetId,
		assetName: asset.name,
		quantity,
		price,
		profitLoss,
		reason: reason.trim(),
		note: typeof note === "string" ? note.trim() : "",
	});
	saveGame();

	return { ok: true, message: `Sold ${quantity} unit${quantity === 1 ? "" : "s"} of ${asset.name}.` };
}

function forceSellHoldingsToCoverShortfall() {
	const holdingsByValue = Object.entries(gameState.holdings)
		.map(([assetId, holding]) => {
			const asset = assets.find((item) => item.id === assetId);
			const price = gameState.prices[assetId] ?? asset?.startPrice ?? 0;
			return { assetId, holding, asset, price, value: price * holding.quantity };
		})
		.filter((position) => position.asset && position.holding.quantity > 0 && position.price > 0)
		.sort((first, second) => second.value - first.value);

	for (const position of holdingsByValue) {
		if (gameState.cash >= 0) {
			break;
		}

		const { assetId, holding, asset, price } = position;
		const netPrice = price * (1 - FORCED_SALE_PENALTY);
		const quantity = Math.min(holding.quantity, Math.ceil(-gameState.cash / netPrice));
		const grossProceeds = price * quantity;
		const penalty = grossProceeds * FORCED_SALE_PENALTY;
		const profitLoss = (price - holding.avgBuyPrice) * quantity - penalty;

		gameState.cash += grossProceeds - penalty;
		if (quantity === holding.quantity) {
			delete gameState.holdings[assetId];
		} else {
			holding.quantity -= quantity;
		}
		gameState.journal.push({
			month: gameState.month,
			action: "Sell",
			assetId,
			assetName: asset.name,
			quantity,
			price,
			profitLoss,
			reason: "Forced sale: ran out of cash",
			note: `2% forced-sale penalty: ${penalty.toFixed(2)}`,
		});
	}
}

function applyPendingPriceChanges() {
	const pending = [];
	for (const change of gameState.pendingPriceChanges) {
		if (change.dueMonth > gameState.month) {
			pending.push(change);
			continue;
		}

		const asset = assets.find((item) => item.id === change.assetId);
		if (asset && Number.isFinite(change.change)) {
			const currentPrice = gameState.prices[asset.id] ?? asset.startPrice;
			gameState.prices[asset.id] = currentPrice * (1 + change.change);
		}
	}
	gameState.pendingPriceChanges = pending;
}

function updateCurrentHistory() {
	const latestPrices = gameState.priceHistory.at(-1);
	if (latestPrices?.month === gameState.month) {
		latestPrices.prices = { ...gameState.prices };
	}

	const latestValue = gameState.valueHistory.at(-1);
	if (latestValue?.month === gameState.month) {
		latestValue.value = getPortfolioValue();
	}
}

function recordEvent(event, outcome, choiceId = null) {
	gameState.eventLog.push({
		month: gameState.month,
		eventId: event.id,
		title: event.title,
		outcome,
		choiceId,
	});
}

export function resolvePendingChoice(choiceId) {
	const pendingChoice = gameState.pendingChoice;
	const event = gameState.currentEvent;
	const choice = event?.choices?.find((item) => item.id === choiceId);
	if (!pendingChoice || !event || pendingChoice.eventId !== event.id || !choice) {
		return { ok: false, message: "That event choice is not available." };
	}

	const result = applyEventEffect(gameState, event.id, choiceId);
	if (gameState.cash < 0) {
		forceSellHoldingsToCoverShortfall();
	}
	gameState.pendingChoice = null;
	gameState.currentEvent = { ...event, outcome: result.message, selectedChoice: choiceId };
	recordEvent(event, result.message, choiceId);
	updateCurrentHistory();
	saveGame();
	return { ok: true, ...result };
}

export function endGameEarly() {
	if (gameState.gameOver || gameState.month < EARLIEST_EARLY_END_MONTH) {
		return false;
	}

	gameState.gameOver = true;
	gameState.gameOverReason = "The game was ended early.";
	gameState.pendingChoice = null;
	saveGame();
	return true;
}

export function advanceMonth() {
	if (gameState.gameOver || gameState.pendingChoice) {
		return gameState;
	}
	if (gameState.month >= FINAL_MONTH) {
		gameState.gameOver = true;
		gameState.gameOverReason = `You completed all ${FINAL_MONTH} months.`;
		gameState.pendingChoice = null;
		saveGame();
		return gameState;
	}

	gameState.prices = nextMonthPrices(gameState.prices, gameState.seed);
	gameState.month += 1;
	gameState.seed = (gameState.seed + 1) >>> 0;
	applyPendingPriceChanges();
	gameState.cash += gameState.monthlyIncome;
	gameState.cash -= gameState.monthlyExpenses;
	gameState.cashFlowLog.push({
		month: gameState.month,
		income: gameState.monthlyIncome,
		expenses: gameState.monthlyExpenses,
	});
	if (gameState.cash < 0) {
		forceSellHoldingsToCoverShortfall();
	}
	if (gameState.jobLossMonthsRemaining > 0) {
		gameState.jobLossMonthsRemaining -= 1;
		if (gameState.jobLossMonthsRemaining === 0) {
			gameState.monthlyIncome = gameState.jobLossReturnIncome;
		}
	}

	gameState.currentEvent = null;
	gameState.pendingChoice = null;
	const event = pickEvent(gameState.month, gameState.seed, gameState);
	if (event) {
		gameState.currentEvent = { ...event };
		if (event.choices?.length) {
			gameState.pendingChoice = { eventId: event.id, month: gameState.month };
		} else {
			const result = applyEventEffect(gameState, event.id);
			if (gameState.cash < 0) {
				forceSellHoldingsToCoverShortfall();
			}
			gameState.currentEvent = { ...event, outcome: result.message };
			recordEvent(event, result.message);
		}
	}

	gameState.priceHistory.push({
		month: gameState.month,
		prices: { ...gameState.prices },
	});
	gameState.valueHistory.push({ month: gameState.month, value: getPortfolioValue() });
	saveGame();
	return gameState;
}
