// Calculates journal, financial-health, final-report, and lesson summaries.
import { assets } from "./market.js";
import { goals } from "./goals.js";

export function getJournalStats(journal) {
	const entries = Array.isArray(journal) ? journal : [];
	const sells = entries.filter((entry) => entry?.action === "Sell");
	const realisedSells = sells.filter((entry) => Number.isFinite(entry.profitLoss));
	const wins = realisedSells.filter((entry) => entry.profitLoss > 0);
	const losses = realisedSells.filter((entry) => entry.profitLoss < 0);
	const totalRealisedProfit = wins.reduce((total, entry) => total + entry.profitLoss, 0);
	const totalRealisedLoss = losses.reduce((total, entry) => total + Math.abs(entry.profitLoss), 0);
	const bestTrade = realisedSells.reduce(
		(best, entry) => !best || entry.profitLoss > best.profitLoss ? entry : best,
		null,
	);
	const worstTrade = realisedSells.reduce(
		(worst, entry) => !worst || entry.profitLoss < worst.profitLoss ? entry : worst,
		null,
	);
	const toTradeSummary = (entry) => entry
		? { assetName: entry.assetName ?? entry.assetId ?? "Unknown asset", amount: entry.profitLoss }
		: null;

	return {
		totalTrades: entries.length,
		numberOfSells: sells.length,
		totalRealisedProfit,
		totalRealisedLoss,
		netRealisedPL: totalRealisedProfit - totalRealisedLoss,
		winRate: sells.length ? (wins.length / sells.length) * 100 : 0,
		bestTrade: toTradeSummary(bestTrade),
		worstTrade: toTradeSummary(worstTrade),
	};
}

const clamp = (value, maximum) => Math.max(0, Math.min(maximum, value));
const roundToTwo = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

export function getFinancialHealthScore(state) {
	const holdings = Object.entries(state.holdings ?? {});
	const monthlyExpenses = Number.isFinite(state.monthlyExpenses) ? state.monthlyExpenses : 0;
	const fixedDepositValue = holdings
		.filter(([assetId, holding]) => assets.find((asset) => asset.id === assetId)?.type === "fixed-deposit" && holding.quantity > 0)
		.reduce((total, [assetId, holding]) => total + (state.prices?.[assetId] ?? 0) * holding.quantity, 0);
	const reserves = (Number.isFinite(state.cash) ? state.cash : 0) + fixedDepositValue;
	const monthsCovered = monthlyExpenses > 0 ? Math.max(0, reserves / monthlyExpenses) : 6;
	const emergencyFundPoints = 30 * clamp(monthsCovered / 6, 1);

	const assetTypes = new Set(
		holdings
			.filter(([, holding]) => holding.quantity > 0)
			.map(([assetId]) => assets.find((asset) => asset.id === assetId)?.type)
			.filter(Boolean),
	);
	const diversificationPoints = 25 * clamp(assetTypes.size / 3, 1);

	const goalResults = goals.map((goal) => goal.check(state));
	const achievedGoals = goalResults.filter((result) => result.done).length;
	const goalPoints = goals.length ? 25 * (achievedGoals / goals.length) : 25;

	const journal = Array.isArray(state.journal) ? state.journal : [];
	const forcedSales = journal.filter((entry) => entry?.reason?.startsWith("Forced sale:")).length;
	const tradesPerMonth = new Map();
	for (const entry of journal) {
		if (!entry || !["Buy", "Sell"].includes(entry.action) || entry.reason?.startsWith("Forced sale:") || !Number.isInteger(entry.month)) {
			continue;
		}
		tradesPerMonth.set(entry.month, (tradesPerMonth.get(entry.month) ?? 0) + 1);
	}
	const excessTrades = [...tradesPerMonth.values()].reduce(
		(total, count) => total + Math.max(0, count - 4),
		0,
	);
	const forcedSalePoints = Math.max(0, 10 - forcedSales * 5);
	const tradingDisciplinePoints = 10 - Math.min(10, excessTrades * 2);
	const score = Math.round(clamp(
		emergencyFundPoints + diversificationPoints + goalPoints + forcedSalePoints + tradingDisciplinePoints,
		100,
	));

	const suggestions = [];
	if (monthsCovered < 6) {
		suggestions.push({
			points: 30 - emergencyFundPoints,
			text: `Cash and fixed deposits cover ${monthsCovered.toFixed(1)} months; aim for 6.`,
		});
	}
	if (assetTypes.size < 3) {
		suggestions.push({
			points: 25 - diversificationPoints,
			text: `You hold ${assetTypes.size} asset types; aim for 3.`,
		});
	}
	if (achievedGoals < goals.length) {
		suggestions.push({
			points: 25 - goalPoints,
			text: `You have achieved ${achievedGoals} of ${goals.length} goals.`,
		});
	}
	if (forcedSales > 0) {
		suggestions.push({
			points: 10 - forcedSalePoints,
			text: `Avoid forced sales; ${forcedSales} so far.`,
		});
	}
	if (excessTrades > 0) {
		suggestions.push({
			points: 10 - tradingDisciplinePoints,
			text: "Try to keep trades to four or fewer per month.",
		});
	}
	const reasons = suggestions
		.sort((first, second) => second.points - first.points)
		.slice(0, 3)
		.map((suggestion) => suggestion.text);

	return {
		score,
		reasons: reasons.length ? reasons : ["Your finances are balanced. Keep up the steady progress."],
	};
}

export function getFinalReport(state) {
	const holdings = state.holdings && typeof state.holdings === "object" ? state.holdings : {};
	const prices = state.prices && typeof state.prices === "object" ? state.prices : {};
	const cash = Number.isFinite(state.cash) ? state.cash : 0;
	const monthlyExpenses = Number.isFinite(state.monthlyExpenses) ? state.monthlyExpenses : 0;
	const assetValues = Object.entries(holdings)
		.map(([assetId, holding]) => {
			const asset = assets.find((item) => item.id === assetId);
			const value = (prices[assetId] ?? 0) * (holding.quantity ?? 0);
			return { assetId, assetName: asset?.name ?? assetId, value };
		})
		.filter((holding) => holding.value > 0);
	const investedMoney = assetValues.reduce((total, holding) => total + holding.value, 0);
	const largestAsset = assetValues.reduce(
		(largest, holding) => !largest || holding.value > largest.value ? holding : largest,
		null,
	);
	const largestAssetPercent = investedMoney > 0 && largestAsset
		? (largestAsset.value / investedMoney) * 100
		: 0;
	const fixedDepositValue = Object.entries(holdings)
		.filter(([assetId, holding]) => assets.find((asset) => asset.id === assetId)?.type === "fixed-deposit" && holding.quantity > 0)
		.reduce((total, [assetId, holding]) => total + (prices[assetId] ?? 0) * holding.quantity, 0);
	const emergencyFundMonths = monthlyExpenses > 0
		? (cash + fixedDepositValue) / monthlyExpenses
		: 6;
	const finalValue = Object.entries(holdings).reduce(
		(total, [assetId, holding]) => total + (prices[assetId] ?? 0) * (holding.quantity ?? 0),
		cash,
	);
	const valueHistory = (Array.isArray(state.valueHistory) ? state.valueHistory : [])
		.filter((entry) => Number.isInteger(entry?.month) && Number.isFinite(entry.value))
		.sort((first, second) => first.month - second.month);
	const startingEntry = valueHistory.find((entry) => entry.month === 1) ?? valueHistory[0];
	const startingValue = Number.isFinite(startingEntry?.value) ? startingEntry.value : finalValue;
	const totalReturnPercent = startingValue > 0
		? ((finalValue - startingValue) / startingValue) * 100
		: 0;
	const elapsedMonths = Math.max(0, (Number.isInteger(state.month) ? state.month : 1) - (startingEntry?.month ?? 1));
	const annualisedReturnPercent = startingValue > 0 && elapsedMonths > 0
		? (Math.pow(Math.max(0, finalValue / startingValue), 12 / elapsedMonths) - 1) * 100
		: totalReturnPercent;
	const monthlyChanges = [];
	for (let index = 1; index < valueHistory.length; index += 1) {
		const previous = valueHistory[index - 1];
		const current = valueHistory[index];
		const percentChange = previous.value !== 0
			? ((current.value - previous.value) / Math.abs(previous.value)) * 100
			: 0;
		monthlyChanges.push({ month: current.month, percentChange });
	}

	let peak = null;
	let maxDrawdownPercent = 0;
	for (const entry of valueHistory) {
		peak = peak === null ? entry.value : Math.max(peak, entry.value);
		if (peak > 0) {
			maxDrawdownPercent = Math.max(maxDrawdownPercent, ((peak - entry.value) / peak) * 100);
		}
	}

	const bestMonth = monthlyChanges.length
		? monthlyChanges.reduce((best, entry) => entry.percentChange > best.percentChange ? entry : best)
		: null;
	const worstMonth = monthlyChanges.length
		? monthlyChanges.reduce((worst, entry) => entry.percentChange < worst.percentChange ? entry : worst)
		: null;
	const bestMonthSummary = bestMonth
		? { ...bestMonth, percentChange: roundToTwo(bestMonth.percentChange) }
		: null;
	const worstMonthSummary = worstMonth
		? { ...worstMonth, percentChange: roundToTwo(worstMonth.percentChange) }
		: null;
	const journal = Array.isArray(state.journal) ? state.journal : [];
	const tradeReasons = new Map();
	for (const entry of journal) {
		if (!entry || !["Buy", "Sell"].includes(entry.action)) {
			continue;
		}

		const reason = typeof entry.reason === "string" && entry.reason.trim()
			? entry.reason.trim()
			: "Unspecified";
		const summary = tradeReasons.get(reason) ?? { tradesCount: 0, totalRealisedProfitLoss: 0 };
		summary.tradesCount += 1;
		if (Number.isFinite(entry.profitLoss)) {
			summary.totalRealisedProfitLoss += entry.profitLoss;
		}
		tradeReasons.set(reason, summary);
	}

	const goalState = {
		...state,
		cash,
		holdings,
		prices,
		monthlyExpenses: Number.isFinite(state.monthlyExpenses) ? state.monthlyExpenses : 0,
	};
	const goalResults = goals.map((goal) => ({ goal, result: goal.check(goalState) }));
	const goalsAchieved = goalResults.filter(({ result }) => result.done).length;
	const missedGoalTitles = goalResults
		.filter(({ goal, result }) => !result.done && goalState.month > goal.targetMonth)
		.map(({ goal }) => goal.title);
	const goalsMissed = missedGoalTitles.length;
	const horizonIndex = assets.find((asset) => asset.id === "horizon-index");
	const priceHistory = Array.isArray(state.priceHistory) ? state.priceHistory : [];
	const startingIndexPrice = priceHistory.find((entry) => entry?.month === 1)?.prices?.[horizonIndex.id]
		?? horizonIndex.startPrice;
	const finalIndexPrice = prices[horizonIndex.id]
		?? priceHistory.at(-1)?.prices?.[horizonIndex.id]
		?? startingIndexPrice;
	const benchmarkFinalValue = startingIndexPrice > 0
		? startingValue * (finalIndexPrice / startingIndexPrice)
		: startingValue;
	const benchmarkReturnPercent = startingValue > 0
		? ((benchmarkFinalValue - startingValue) / startingValue) * 100
		: 0;
	const eventLog = Array.isArray(state.eventLog) ? state.eventLog : [];
	const pendingEventCount = state.pendingChoice ? 1 : 0;
	const forcedSales = journal.filter((entry) => entry?.reason?.startsWith("Forced sale:")).length;
	const nonForcedTrades = journal.filter((entry) =>
		["Buy", "Sell"].includes(entry?.action) && !entry.reason?.startsWith("Forced sale:"),
	);
	const tradeDurationMonths = Math.max(
		1,
		Array.isArray(state.cashFlowLog)
			? state.cashFlowLog.length
			: (Number.isInteger(state.month) ? state.month - 1 : 0),
	);
	const averageTradesPerMonth = nonForcedTrades.length / tradeDurationMonths;
	const safeState = { ...goalState, journal };
	const finalFinancialHealthScore = getFinancialHealthScore(safeState).score;

	return {
		startingValue,
		finalValue,
		totalReturnPercent: roundToTwo(totalReturnPercent),
		annualisedReturnPercent: roundToTwo(annualisedReturnPercent),
		bestMonth: bestMonthSummary,
		worstMonth: worstMonthSummary,
		maxDrawdownPercent: roundToTwo(maxDrawdownPercent),
		lifeEventsFaced: eventLog.length + pendingEventCount,
		forcedSales,
		goalsAchieved,
		goalsMissed,
		missedGoalTitles,
		finalFinancialHealthScore,
		emergencyFundMonths: Number.isFinite(emergencyFundMonths) ? emergencyFundMonths : 0,
		investedMoney,
		largestAsset: largestAsset
			? { assetId: largestAsset.assetId, assetName: largestAsset.assetName, value: largestAsset.value, percent: roundToTwo(largestAssetPercent) }
			: null,
		largestAssetPercent: roundToTwo(largestAssetPercent),
		averageTradesPerMonth: roundToTwo(averageTradesPerMonth),
		tradeReasonBreakdown: Object.fromEntries(tradeReasons),
		benchmark: {
			name: horizonIndex.name,
			startingValue,
			finalValue: roundToTwo(benchmarkFinalValue),
			totalReturnPercent: roundToTwo(benchmarkReturnPercent),
		},
	};
}

export function getLessons(report) {
	const safeReport = report && typeof report === "object" ? report : {};
	const lessons = [];
	const portfolioValue = Number.isFinite(safeReport.finalValue) ? safeReport.finalValue : 0;
	const benchmarkValue = Number.isFinite(safeReport.benchmark?.finalValue) ? safeReport.benchmark.finalValue : 0;

	if (portfolioValue < benchmarkValue) {
		lessons.push({
			title: "Compare with the benchmark",
			explanation: "Your portfolio finished below the Horizon 500 Index; consider a simple index-focused strategy.",
			tone: "warning",
		});
	} else {
		lessons.push({
			title: "You beat the benchmark",
			explanation: "Your portfolio kept pace with or exceeded the Horizon 500 Index.",
			tone: "good",
		});
	}

	if (Number(safeReport.forcedSales) > 0) {
		lessons.push({
			title: "Build an emergency buffer",
			explanation: `${safeReport.forcedSales} forced sale${safeReport.forcedSales === 1 ? "" : "s"} happened; keep cash reserves to avoid selling investments under pressure.`,
			tone: "warning",
		});
	} else {
		const months = Number.isFinite(safeReport.emergencyFundMonths) ? safeReport.emergencyFundMonths : 0;
		lessons.push({
			title: "Protect your emergency fund",
			explanation: months < 6
				? `Your cash and fixed deposits cover ${months.toFixed(1)} months; aim for at least 6.`
				: "Your cash and fixed deposits cover at least six months of expenses.",
			tone: months < 6 ? "warning" : "good",
		});
	}

	const largestAssetPercent = Number.isFinite(safeReport.largestAssetPercent) ? safeReport.largestAssetPercent : 0;
	if (largestAssetPercent > 40) {
		const assetName = safeReport.largestAsset?.assetName ?? "One asset";
		lessons.push({
			title: "Watch concentration risk",
			explanation: `${assetName} made up ${largestAssetPercent.toFixed(1)}% of invested money; spread risk across more assets.`,
			tone: "warning",
		});
	} else {
		lessons.push({
			title: "Keep your portfolio balanced",
			explanation: "No single asset exceeded 40% of invested money.",
			tone: "good",
		});
	}

	const averageTrades = Number.isFinite(safeReport.averageTradesPerMonth) ? safeReport.averageTradesPerMonth : 0;
	if (averageTrades > 3) {
		lessons.push({
			title: "Trade less frequently",
			explanation: `You averaged ${averageTrades.toFixed(1)} trades per month; frequent trading can add costs and undermine returns.`,
			tone: "warning",
		});
	} else {
		lessons.push({
			title: "Stay disciplined",
			explanation: `You averaged ${averageTrades.toFixed(1)} trades per month; a measured pace can help limit trading costs.`,
			tone: "good",
		});
	}

	const bestReason = Object.entries(safeReport.tradeReasonBreakdown ?? {})
		.filter(([reason, result]) => !reason.toLowerCase().startsWith("forced sale:") && Number.isFinite(result.totalRealisedProfitLoss) && result.totalRealisedProfitLoss > 0)
		.sort((first, second) => second[1].totalRealisedProfitLoss - first[1].totalRealisedProfitLoss)[0];
	if (bestReason && /diversification|good news/i.test(bestReason[0])) {
		lessons.push({
			title: "Repeat what worked",
			explanation: `${bestReason[0]} produced your strongest realised profit; keep applying that reasoning thoughtfully.`,
			tone: "good",
		});
	}

	const missedGoals = Array.isArray(safeReport.missedGoalTitles) ? safeReport.missedGoalTitles : [];
	if (missedGoals.length) {
		lessons.push({
			title: "Revisit missed goals",
			explanation: `You missed ${missedGoals.join(", ")}; set smaller milestones to make them more achievable.`,
			tone: "info",
		});
	}

	return lessons.slice(0, 6);
}