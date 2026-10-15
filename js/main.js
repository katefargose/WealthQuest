// Renders the WealthQuest dashboard, dialogs, and final report.
// Connects player actions to the game-state and summary modules.
import { assets } from "./market.js";
import {
	advanceMonth,
	buyAsset,
	endGameEarly,
	gameState,
	getPortfolioValue,
	loadGame,
	newGame,
	resetGame,
	resolvePendingChoice,
	saveGame,
	sellAsset,
} from "./state.js";
import { formatINR } from "./utils.js";
import { getFinancialHealthScore, getFinalReport, getJournalStats, getLessons } from "./stats.js";
import { goals } from "./goals.js";

const statsSection = document.querySelector("#stats");
const marketSection = document.querySelector("#market");
const portfolioSection = document.querySelector("#portfolio");
const journalSection = document.querySelector("#journal");
const valueChartSection = document.querySelector("#value-chart");
const eventsSection = document.querySelector("#events");
const goalsSection = document.querySelector("#goals");
const dashboard = document.querySelector(".dashboard");
const gameOverScreen = document.querySelector("#game-over-screen");
const newGameDialog = document.querySelector("#new-game-dialog");
const howToPlayDialog = document.querySelector("#how-to-play-dialog");
const allocationColors = ["#e6bd72", "#9bdbad", "#80b7a8", "#87a7c4", "#e08f78", "#c79fd0", "#bdc878"];
const tradeReasons = [
	"Good news or results",
	"Technical trend",
	"Diversification",
	"Looks undervalued",
	"Book profit",
	"Cut loss",
	"Rebalancing",
	"Other",
];
let activeTrade = null;
let tradeFeedback = null;
let showFinalReport = false;

function getMonthlyChange(assetId, startPrice) {
	const history = gameState.priceHistory;
	const previousPrices = history[history.length - 2]?.prices;
	const previousPrice = previousPrices?.[assetId] ?? startPrice;
	return ((gameState.prices[assetId] - previousPrice) / previousPrice) * 100;
}

function escapeHTML(value) {
	return String(value ?? "").replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	})[character]);
}

function formatSignedINR(amount) {
	return `${amount > 0 ? "+" : ""}${formatINR(amount)}`;
}

function renderStats() {
	const health = getFinancialHealthScore(gameState);
	const healthLabel = health.score < 40
		? "Weak"
		: health.score < 60
			? "Okay"
			: health.score < 80
				? "Good"
				: "Excellent";
	const healthClass = healthLabel.toLowerCase();
	const advice = health.reasons[0] ?? "Keep building healthy financial habits.";

	statsSection.innerHTML = `
		<div class="stats-heading">
			<h2>Game Status</h2>
			<div class="stats-actions">
				<button class="new-game-button" type="button">New Game</button>
				<button class="end-game-early-button" type="button" ${gameState.month < 6 ? "disabled" : ""}>End Game Early</button>
				<div class="next-month-control">
					<button class="next-month-button" type="button" aria-disabled="${gameState.pendingChoice ? "true" : "false"}">Next Month</button>
					${gameState.pendingChoice ? `<span class="next-month-hint">Decide on the event below first</span>` : ""}
				</div>
			</div>
		</div>
		<dl class="stats-list">
			<div><dt>Month</dt><dd>${gameState.month}</dd></div>
			<div><dt>Cash</dt><dd>${formatINR(gameState.cash)}</dd></div>
			<div><dt>Portfolio Value</dt><dd>${formatINR(getPortfolioValue())}</dd></div>
		</dl>
		<p class="monthly-cash-flow">Monthly income ${formatINR(gameState.monthlyIncome)} / expenses ${formatINR(gameState.monthlyExpenses)} / net ${formatSignedINR(gameState.monthlyIncome - gameState.monthlyExpenses)}</p>
		<div class="financial-health">
			<div class="financial-health-heading">
				<span>Financial health</span>
				<strong>${health.score}/100</strong>
				<span class="financial-health-label health-${healthClass}">${healthLabel}</span>
			</div>
			<progress class="financial-health-gauge health-${healthClass}" value="${health.score}" max="100" aria-label="Financial health ${health.score} out of 100"></progress>
			<p class="financial-health-advice">${escapeHTML(advice)}</p>
		</div>
	`;

	statsSection.querySelector(".new-game-button").addEventListener("click", () => {
		openNewGameDialog();
	});

	statsSection.querySelector(".end-game-early-button").addEventListener("click", () => {
		if (gameState.month < 6 || !window.confirm("End the game now and view your final report?")) {
			return;
		}

		endGameEarly();
		showFinalReport = false;
		render();
	});

	statsSection.querySelector(".next-month-button").addEventListener("click", () => {
		if (gameState.pendingChoice) {
			eventsSection.scrollIntoView({ behavior: "smooth", block: "center" });
			eventsSection.querySelector(".event-choice-button")?.focus({ preventScroll: true });
			return;
		}

		advanceMonth();
		saveGame();
		render();
	});
}

function renderMarket() {
	const rows = assets.map((asset) => {
		const monthlyChange = getMonthlyChange(asset.id, asset.startPrice);
		const changeClass = monthlyChange > 0 ? "is-up" : monthlyChange < 0 ? "is-down" : "is-flat";
		const changeSign = monthlyChange > 0 ? "+" : "";

		return `
			<tr>
				<th scope="row" data-label="Asset">${asset.name}</th>
				<td data-label="Type">${asset.type}</td>
				<td data-label="Price" class="numeric-cell">${formatINR(gameState.prices[asset.id])}</td>
				<td data-label="Monthly" class="numeric-cell ${changeClass}">${changeSign}${monthlyChange.toFixed(2)}%</td>
				<td data-label="Trade">
					<div class="trade-action-buttons">
						<button class="trade-action-button buy-action" type="button" data-action="Buy" data-asset-id="${asset.id}">Buy</button>
						<button class="trade-action-button sell-action" type="button" data-action="Sell" data-asset-id="${asset.id}">Sell</button>
					</div>
				</td>
			</tr>
		`;
	}).join("");

	marketSection.innerHTML = `
		<h2>Market</h2>
		<div class="market-table-wrap">
			<table class="market-table">
				<thead>
					<tr><th scope="col">Asset</th><th scope="col">Type</th><th scope="col">Price</th><th scope="col">Monthly</th><th scope="col">Trade</th></tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
		</div>
		${renderTradePanel()}
	`;

	marketSection.querySelectorAll(".trade-action-button").forEach((button) => {
		button.addEventListener("click", () => {
			activeTrade = {
				assetId: button.dataset.assetId,
				action: button.dataset.action,
				quantity: "1",
				reason: "",
				note: "",
			};
			tradeFeedback = null;
			renderMarket();
			marketSection.querySelector("#trade-quantity").focus();
		});
	});

	if (!activeTrade) {
		return;
	}

	marketSection.querySelector(".close-trade-button").addEventListener("click", () => {
		activeTrade = null;
		tradeFeedback = null;
		renderMarket();
	});

	const tradeForm = marketSection.querySelector(".trade-form");
	const quantityInput = tradeForm.querySelector("#trade-quantity");
	const reasonSelect = tradeForm.querySelector("#trade-reason");
	const noteInput = tradeForm.querySelector("#trade-note");
	const confirmButton = tradeForm.querySelector(".confirm-trade-button");
	const totalValue = tradeForm.querySelector(".trade-total-value");

	function updateTradeForm() {
		activeTrade.quantity = quantityInput.value;
		activeTrade.reason = reasonSelect.value;
		activeTrade.note = noteInput.value;
		const quantity = Number(quantityInput.value);
		const validQuantity = Number.isInteger(quantity) && quantity > 0;
		const asset = assets.find((item) => item.id === activeTrade.assetId);
		const price = gameState.prices[asset.id];
		totalValue.textContent = formatINR(validQuantity ? price * quantity : 0);
		confirmButton.disabled = !tradeForm.checkValidity();
	}

	tradeForm.addEventListener("input", () => {
		tradeFeedback = null;
		updateTradeForm();
		const feedback = tradeForm.querySelector(".trade-feedback");
		if (feedback) {
			feedback.hidden = true;
		}
	});
	tradeForm.addEventListener("change", () => {
		tradeFeedback = null;
		updateTradeForm();
		const feedback = tradeForm.querySelector(".trade-feedback");
		if (feedback) {
			feedback.hidden = true;
		}
	});
	tradeForm.addEventListener("submit", (event) => {
		event.preventDefault();
		if (!tradeForm.reportValidity()) {
			return;
		}

		const trade = activeTrade;
		const result = trade.action === "Buy"
			? buyAsset(trade.assetId, Number(trade.quantity), trade.reason, trade.note)
			: sellAsset(trade.assetId, Number(trade.quantity), trade.reason, trade.note);
		tradeFeedback = result;
		render();
	});

	updateTradeForm();
}

function renderTradePanel() {
	if (!activeTrade) {
		return "";
	}

	const asset = assets.find((item) => item.id === activeTrade.assetId);
	const price = gameState.prices[asset.id];
	const owned = gameState.holdings[asset.id]?.quantity ?? 0;
	const actionLabel = activeTrade.action === "Buy" ? "Buy" : "Sell";
	const totalLabel = activeTrade.action === "Buy" ? "Total cost" : "Total proceeds";
	const options = tradeReasons.map((reason) =>
		`<option value="${reason}"${activeTrade.reason === reason ? " selected" : ""}>${reason}</option>`,
	).join("");
	const feedback = tradeFeedback
		? `<p class="trade-feedback ${tradeFeedback.ok ? "trade-success" : "trade-error"}" role="status">${tradeFeedback.message}</p>`
		: "";

	return `
		<section class="trade-panel" aria-labelledby="trade-panel-title">
			<div class="trade-panel-heading">
				<h3 id="trade-panel-title">${actionLabel} ${asset.name}</h3>
				<button class="close-trade-button" type="button">Close</button>
			</div>
			<form class="trade-form">
				<div class="trade-form-grid">
					<p class="trade-detail"><span>Current price</span><strong>${formatINR(price)}</strong></p>
					<p class="trade-detail"><span>Units owned</span><strong>${owned}</strong></p>
					<label class="trade-field" for="trade-quantity">Quantity
						<input id="trade-quantity" name="quantity" type="number" min="1" step="1" required value="${activeTrade.quantity}" />
					</label>
					<label class="trade-field" for="trade-reason">Reason
						<select id="trade-reason" name="reason" required>
							<option value="" disabled${activeTrade.reason ? "" : " selected"}>Select a reason</option>
							${options}
						</select>
					</label>
					<label class="trade-field" for="trade-note">Note (optional)
						<input id="trade-note" name="note" type="text" maxlength="200" value="${escapeHTML(activeTrade.note)}" />
					</label>
					<p class="trade-total"><span>${totalLabel}</span><strong class="trade-total-value"></strong></p>
					<button class="confirm-trade-button" type="submit">Confirm ${actionLabel}</button>
				</div>
				${feedback}
			</form>
		</section>
	`;
}

function renderPortfolio() {
	const holdings = Object.entries(gameState.holdings)
		.map(([assetId, holding]) => {
			const asset = assets.find((item) => item.id === assetId);
			if (!asset || holding.quantity <= 0) {
				return null;
			}

			const currentPrice = gameState.prices[assetId] ?? asset.startPrice;
			const currentValue = currentPrice * holding.quantity;
			const costBasis = holding.avgBuyPrice * holding.quantity;
			const profitLoss = currentValue - costBasis;
			const profitLossPercent = costBasis > 0 ? (profitLoss / costBasis) * 100 : 0;

			return {
				asset,
				holding,
				currentPrice,
				currentValue,
				profitLoss,
				profitLossPercent,
			};
		})
		.filter(Boolean);

	const rows = holdings.map(({ asset, holding, currentPrice, currentValue, profitLoss, profitLossPercent }) => {
		const changeClass = profitLoss > 0 ? "is-up" : profitLoss < 0 ? "is-down" : "is-flat";
		const amountSign = profitLoss > 0 ? "+" : "";
		const percentSign = profitLossPercent > 0 ? "+" : "";

		return `
			<tr>
				<th scope="row" data-label="Asset">${asset.name}</th>
				<td data-label="Quantity" class="numeric-cell">${holding.quantity}</td>
				<td data-label="Avg Buy Price" class="numeric-cell">${formatINR(holding.avgBuyPrice)}</td>
				<td data-label="Current Price" class="numeric-cell">${formatINR(currentPrice)}</td>
				<td data-label="Current Value" class="numeric-cell">${formatINR(currentValue)}</td>
				<td data-label="Profit/Loss" class="numeric-cell ${changeClass}">${amountSign}${formatINR(profitLoss)} (${percentSign}${profitLossPercent.toFixed(2)}%)</td>
			</tr>
		`;
	}).join("");

	const totalValue = getPortfolioValue();
	const allocationParts = [
		{ id: "cash", name: "Cash", amount: gameState.cash },
		...holdings.map(({ asset, currentValue }) => ({
			id: asset.id,
			name: asset.name,
			amount: currentValue,
		})),
	].map((part, index) => ({
		...part,
		color: allocationColors[index % allocationColors.length],
		percentage: totalValue > 0 ? (part.amount / totalValue) * 100 : 0,
	}));

	const allocationSegments = allocationParts.map((part) => `
		<span class="allocation-segment" style="--allocation-color: ${part.color}; --allocation-width: ${part.percentage}%"></span>
	`).join("");
	const allocationLegend = allocationParts.map((part) => `
		<li>
			<span class="allocation-swatch" style="--allocation-color: ${part.color}"></span>
			<span>${part.name}</span>
			<strong>${part.percentage.toFixed(2)}%</strong>
		</li>
	`).join("");

	portfolioSection.innerHTML = `
		<h2>Portfolio</h2>
		${holdings.length
			? `<div class="portfolio-table-wrap">
				<table class="portfolio-table">
					<thead><tr><th scope="col">Asset</th><th scope="col">Quantity</th><th scope="col">Avg Buy Price</th><th scope="col">Current Price</th><th scope="col">Current Value</th><th scope="col">Profit/Loss</th></tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>`
			: `<p class="empty-portfolio">No investments yet. Buy something from the market.</p>`}
		<div class="allocation-panel">
			<h3>Portfolio Allocation</h3>
			<div class="allocation-bar" role="img" aria-label="Portfolio allocation">${allocationSegments}</div>
			<ul class="allocation-legend">${allocationLegend}</ul>
		</div>
	`;
}

function renderJournal() {
	const stats = getJournalStats(gameState.journal);
	const rows = [...gameState.journal].reverse().map((entry) => {
		const asset = assets.find((item) => item.id === entry.assetId);
		const assetName = entry.assetName ?? asset?.name ?? entry.assetId;
		const actionClass = entry.action === "Buy" ? "is-up" : "is-down";
		const profitLossClass = entry.profitLoss > 0 ? "is-up" : entry.profitLoss < 0 ? "is-down" : "is-flat";
		const profitLoss = entry.action === "Sell" ? formatINR(entry.profitLoss) : "-";
		const note = entry.note?.trim()
			? `<small class="journal-note">${escapeHTML(entry.note)}</small>`
			: "";

		return `
			<tr>
				<td data-label="Month">${escapeHTML(entry.month)}</td>
				<td data-label="Action" class="${actionClass}">${escapeHTML(entry.action)}</td>
				<th scope="row" data-label="Asset">${escapeHTML(assetName)}</th>
				<td data-label="Quantity">${escapeHTML(entry.quantity)}</td>
				<td data-label="Price" class="numeric-cell">${formatINR(entry.price)}</td>
				<td data-label="Amount" class="numeric-cell">${formatINR(entry.quantity * entry.price)}</td>
				<td data-label="Profit/Loss" class="numeric-cell ${entry.action === "Sell" ? profitLossClass : ""}">${profitLoss}</td>
				<td data-label="Reason"><span>${escapeHTML(entry.reason)}</span>${note}</td>
			</tr>
		`;
	}).join("");
	const netClass = stats.netRealisedPL > 0 ? "is-up" : stats.netRealisedPL < 0 ? "is-down" : "is-flat";
	const tradeSummary = (trade) => trade
		? `<span>${escapeHTML(trade.assetName)}<small>${formatSignedINR(trade.amount)}</small></span>`
		: "-";

	journalSection.innerHTML = `
		<div class="journal-heading">
			<h2>Journal</h2>
			<button class="export-journal-button" type="button">Export journal (CSV)</button>
		</div>
		<dl class="journal-stats-grid">
			<div class="journal-stat-card"><dt>Total trades</dt><dd>${stats.totalTrades}</dd></div>
			<div class="journal-stat-card"><dt>Number of sells</dt><dd>${stats.numberOfSells}</dd></div>
			<div class="journal-stat-card"><dt>Total realised profit</dt><dd class="is-up">${formatINR(stats.totalRealisedProfit)}</dd></div>
			<div class="journal-stat-card"><dt>Total realised loss</dt><dd class="is-down">${formatINR(stats.totalRealisedLoss ? -stats.totalRealisedLoss : 0)}</dd></div>
			<div class="journal-stat-card"><dt>Net realised P/L</dt><dd class="${netClass}">${formatSignedINR(stats.netRealisedPL)}</dd></div>
			<div class="journal-stat-card"><dt>Win rate</dt><dd>${stats.winRate.toFixed(1)}%</dd></div>
			<div class="journal-stat-card journal-trade-stat"><dt>Best trade</dt><dd>${tradeSummary(stats.bestTrade)}</dd></div>
			<div class="journal-stat-card journal-trade-stat"><dt>Worst trade</dt><dd>${tradeSummary(stats.worstTrade)}</dd></div>
		</dl>
		${rows
			? `<div class="journal-table-wrap">
				<table class="journal-table">
					<thead><tr><th scope="col">Month</th><th scope="col">Action</th><th scope="col">Asset</th><th scope="col">Quantity</th><th scope="col">Price</th><th scope="col">Amount</th><th scope="col">Profit/Loss</th><th scope="col">Reason</th></tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>`
			: `<p class="empty-journal">No trades yet. Your trading diary will appear here.</p>`}
	`;

	journalSection.querySelector(".export-journal-button").addEventListener("click", exportJournalCSV);
}

function exportJournalCSV() {
	const headers = ["Month", "Action", "Asset", "Quantity", "Price", "Profit/Loss", "Reason", "Note"];
	const rows = gameState.journal.map((entry) => {
		const asset = assets.find((item) => item.id === entry.assetId);
		return [
			entry.month,
			entry.action,
			entry.assetName ?? asset?.name ?? entry.assetId,
			entry.quantity,
			entry.price,
			entry.profitLoss,
			entry.reason,
			entry.note,
		];
	});
	const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
	const csv = [headers, ...rows]
		.map((row) => row.map(csvEscape).join(","))
		.join("\r\n");
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const blobUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = blobUrl;
	anchor.download = "wealthquest-journal.csv";
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function renderValueChart() {
	const history = gameState.valueHistory
		.filter((entry) => Number.isInteger(entry.month) && Number.isFinite(entry.value))
		.sort((first, second) => first.month - second.month);
	const entries = history.length ? history : [{ month: gameState.month, value: getPortfolioValue() }];
	const startingValue = history.find((entry) => entry.month === 1)?.value ?? entries[0].value;
	const values = [...entries.map((entry) => entry.value), startingValue];
	const minimum = Math.min(...values);
	const maximum = Math.max(...values);
	const padding = (maximum - minimum) * 0.12 || Math.max(Math.abs(startingValue) * 0.01, 1);
	const lowerBound = minimum - padding;
	const upperBound = maximum + padding;
	const chart = { left: 100, right: 740, top: 24, bottom: 250 };
	const xForIndex = (index) => entries.length === 1
		? (chart.left + chart.right) / 2
		: chart.left + (index / (entries.length - 1)) * (chart.right - chart.left);
	const yForValue = (value) => chart.bottom - ((value - lowerBound) / (upperBound - lowerBound)) * (chart.bottom - chart.top);
	const points = entries.map((entry, index) => `${xForIndex(index)},${yForValue(entry.value)}`).join(" ");
	const lineColor = entries[entries.length - 1].value >= startingValue ? "#9bdbad" : "#f08c85";
	const yTicks = Array.from({ length: 5 }, (_, index) => upperBound - ((upperBound - lowerBound) * index) / 4);
	const tickCount = Math.min(entries.length, 6);
	const xTickIndices = tickCount === 1
		? [0]
		: Array.from({ length: tickCount }, (_, index) => Math.round((index * (entries.length - 1)) / (tickCount - 1)));
	const gridLines = yTicks.map((value) => `
		<g class="chart-y-tick">
			<line x1="${chart.left}" y1="${yForValue(value)}" x2="${chart.right}" y2="${yForValue(value)}" />
			<text x="${chart.left - 10}" y="${yForValue(value) + 4}" text-anchor="end">${formatINR(value)}</text>
		</g>
	`).join("");
	const monthTicks = xTickIndices.map((index) => `
		<g class="chart-x-tick">
			<line x1="${xForIndex(index)}" y1="${chart.bottom}" x2="${xForIndex(index)}" y2="${chart.bottom + 5}" />
			<text x="${xForIndex(index)}" y="${chart.bottom + 22}" text-anchor="middle">${entries[index].month}</text>
		</g>
	`).join("");
	const baselineY = yForValue(startingValue);

	valueChartSection.innerHTML = `
		<h2>Portfolio Value Over Time</h2>
		<svg class="value-chart-svg" viewBox="0 0 760 310" role="img" aria-labelledby="value-chart-title value-chart-description">
			<title id="value-chart-title">Portfolio value over time</title>
			<desc id="value-chart-description">Portfolio value by month. The dotted line marks starting cash of ${formatINR(startingValue)}.</desc>
			${gridLines}
			<line class="chart-baseline" x1="${chart.left}" y1="${baselineY}" x2="${chart.right}" y2="${baselineY}" />
			<text class="chart-baseline-label" x="${chart.right}" y="${Math.max(chart.top + 12, baselineY - 7)}" text-anchor="end">Starting cash ${formatINR(startingValue)}</text>
			<polyline class="value-chart-line" points="${points}" stroke="${lineColor}" />
			<circle cx="${xForIndex(entries.length - 1)}" cy="${yForValue(entries[entries.length - 1].value)}" r="4" fill="${lineColor}" />
			${monthTicks}
			<text class="chart-axis-label" x="${(chart.left + chart.right) / 2}" y="302" text-anchor="middle">Month</text>
			<text class="chart-axis-label" x="20" y="${(chart.top + chart.bottom) / 2}" text-anchor="middle" transform="rotate(-90 20 ${(chart.top + chart.bottom) / 2})">Portfolio value</text>
		</svg>
	`;
}

function renderEvents() {
	const currentEvent = gameState.currentEvent;
	const choices = gameState.pendingChoice && currentEvent?.choices
		? currentEvent.choices.map((choice) => `
			<button class="event-choice-button" type="button" data-choice-id="${escapeHTML(choice.id)}">${escapeHTML(choice.label)}</button>
		`).join("")
		: "";
	const currentCard = currentEvent
		? `<article class="event-card event-${escapeHTML(currentEvent.tone ?? "decision")}">
			<h3>${escapeHTML(currentEvent.title)}</h3>
			<p>${escapeHTML(currentEvent.description)}</p>
			${currentEvent.outcome ? `<p class="event-outcome">${escapeHTML(currentEvent.outcome)}</p>` : ""}
			${choices ? `<div class="event-choice-actions">${choices}</div>` : ""}
		</article>`
		: `<p class="empty-events">No event this month.</p>`;
	const recentEvents = gameState.eventLog.slice(-5).reverse();
	const recentMarkup = recentEvents.length
		? `<ol class="event-log-list">${recentEvents.map((entry) => `
			<li>
				<span class="event-log-month">Month ${escapeHTML(entry.month)}</span>
				<strong>${escapeHTML(entry.title)}</strong>
				<span>${escapeHTML(entry.outcome)}</span>
			</li>
		`).join("")}</ol>`
		: `<p class="empty-events">No recent events.</p>`;

	eventsSection.innerHTML = `
		<h2>Events</h2>
		${currentCard}
		<div class="event-history">
			<h3>Recent events</h3>
			${recentMarkup}
		</div>
	`;

	eventsSection.querySelectorAll(".event-choice-button").forEach((button) => {
		button.addEventListener("click", () => {
			resolvePendingChoice(button.dataset.choiceId);
			render();
		});
	});
}

function renderGoals() {
	const goalCards = goals.map((goal) => {
		const result = goal.check(gameState);
		const status = result.done
			? "Achieved"
			: gameState.month > goal.targetMonth
				? "Missed"
				: "In progress";
		const statusClass = status.toLowerCase().replaceAll(" ", "-");
		const percentage = Math.round(result.progress * 100);

		return `
			<article class="goal-item">
				<div class="goal-item-heading">
					<h3>${escapeHTML(goal.title)}</h3>
					<span class="goal-status goal-status-${statusClass}">${status}</span>
				</div>
				<p>${escapeHTML(goal.description)}</p>
				<div class="goal-progress-label"><span>Progress</span><strong>${percentage}%</strong></div>
				<progress class="goal-progress" value="${result.progress}" max="1" aria-label="${escapeHTML(goal.title)} progress"></progress>
				<p class="goal-deadline">Deadline: Month ${goal.targetMonth}</p>
			</article>
		`;
	}).join("");

	goalsSection.innerHTML = `<h2>Goals</h2><div class="goals-grid">${goalCards}</div>`;
}

function restartGameFromEnd() {
	openNewGameDialog();
}

function openNewGameDialog() {
	newGameDialog.hidden = false;
	const playerNameInput = newGameDialog.querySelector("#player-name");
	playerNameInput.value = "";
	playerNameInput.focus();
}

function setupNewGameDialog() {
	const form = newGameDialog.querySelector(".new-game-form");
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		if (!form.reportValidity()) {
			return;
		}

		const playerName = newGameDialog.querySelector("#player-name").value.trim();
		if (!playerName) {
			return;
		}

		resetGame();
		gameState.playerName = playerName;
		saveGame();
		showFinalReport = false;
		newGameDialog.hidden = true;
		render();
	});
	newGameDialog.querySelector(".cancel-new-game").addEventListener("click", () => {
		newGameDialog.hidden = true;
	});
}

function setupHowToPlay() {
	const openButton = document.querySelector("#how-to-play-button");
	openButton.addEventListener("click", () => howToPlayDialog.showModal());
	howToPlayDialog.querySelector(".how-to-play-close").addEventListener("click", () => howToPlayDialog.close());
	howToPlayDialog.addEventListener("click", (event) => {
		if (event.target === howToPlayDialog) {
			howToPlayDialog.close();
		}
	});

	try {
		if (!localStorage.getItem("wealthquest-how-to-play-seen")) {
			howToPlayDialog.showModal();
			localStorage.setItem("wealthquest-how-to-play-seen", "true");
		}
	} catch {
		howToPlayDialog.showModal();
	}
}

function renderFinalValueChart(report) {
	const history = (Array.isArray(gameState.valueHistory) ? gameState.valueHistory : [])
		.filter((entry) => Number.isInteger(entry.month) && Number.isFinite(entry.value))
		.sort((first, second) => first.month - second.month);
	const entries = history.length ? history : [{ month: gameState.month, value: report.finalValue }];
	const indexAsset = assets.find((asset) => asset.id === "horizon-index");
	const indexPrices = new Map((gameState.priceHistory ?? []).map((entry) => [entry.month, entry.prices?.[indexAsset.id]]));
	const startIndexPrice = indexPrices.get(1) ?? indexAsset.startPrice;
	const finalIndexPrice = gameState.prices[indexAsset.id] ?? indexPrices.get(entries.at(-1).month) ?? startIndexPrice;
	const benchmarkEntries = entries.map((entry) => {
		const indexPrice = indexPrices.get(entry.month)
			?? (entry.month === entries.at(-1).month ? finalIndexPrice : startIndexPrice);
		return {
			month: entry.month,
			value: startIndexPrice > 0 ? report.startingValue * (indexPrice / startIndexPrice) : report.startingValue,
		};
	});
	const values = [...entries.map((entry) => entry.value), ...benchmarkEntries.map((entry) => entry.value)];
	const minimum = Math.min(...values);
	const maximum = Math.max(...values);
	const padding = (maximum - minimum) * 0.12 || Math.max(Math.abs(report.startingValue) * 0.01, 1);
	const lower = minimum - padding;
	const upper = maximum + padding;
	const chart = { left: 100, right: 740, top: 24, bottom: 250 };
	const xForIndex = (index) => entries.length === 1
		? (chart.left + chart.right) / 2
		: chart.left + (index / (entries.length - 1)) * (chart.right - chart.left);
	const yForValue = (value) => chart.bottom - ((value - lower) / (upper - lower)) * (chart.bottom - chart.top);
	const portfolioPoints = entries.map((entry, index) => `${xForIndex(index)},${yForValue(entry.value)}`).join(" ");
	const benchmarkPoints = benchmarkEntries.map((entry, index) => `${xForIndex(index)},${yForValue(entry.value)}`).join(" ");
	const ticks = Array.from({ length: 5 }, (_, index) => upper - ((upper - lower) * index) / 4);
	const tickCount = Math.min(entries.length, 6);
	const tickIndices = tickCount === 1
		? [0]
		: Array.from({ length: tickCount }, (_, index) => Math.round((index * (entries.length - 1)) / (tickCount - 1)));
	const yTicks = ticks.map((value) => `
		<g class="chart-y-tick"><line x1="${chart.left}" y1="${yForValue(value)}" x2="${chart.right}" y2="${yForValue(value)}" /><text x="${chart.left - 10}" y="${yForValue(value) + 4}" text-anchor="end">${formatINR(value)}</text></g>
	`).join("");
	const xTicks = tickIndices.map((index) => `
		<g class="chart-x-tick"><line x1="${xForIndex(index)}" y1="${chart.bottom}" x2="${xForIndex(index)}" y2="${chart.bottom + 5}" /><text x="${xForIndex(index)}" y="${chart.bottom + 22}" text-anchor="middle">${entries[index].month}</text></g>
	`).join("");
	const portfolioColor = report.finalValue >= report.startingValue ? "#39834c" : "#bd4c45";

	return `
		<svg class="report-value-chart" viewBox="0 0 760 310" role="img" aria-label="Portfolio value and Horizon 500 Index benchmark by month">
			${yTicks}
			<polyline class="report-portfolio-line" points="${portfolioPoints}" stroke="${portfolioColor}" />
			<polyline class="report-benchmark-line" points="${benchmarkPoints}" />
			${xTicks}
			<text class="chart-axis-label" x="420" y="302" text-anchor="middle">Month</text>
			<text class="chart-axis-label" x="20" y="137" text-anchor="middle" transform="rotate(-90 20 137)">Portfolio value</text>
		</svg>
		<div class="report-chart-legend"><span><i class="report-legend-portfolio"></i>Portfolio</span><span><i class="report-legend-benchmark"></i>Horizon 500 Index</span></div>
	`;
}

function renderGameOverScreen() {
	const report = getFinalReport(gameState);
	const lessons = getLessons(report);
	const reportDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date());
	const journalStats = getJournalStats(gameState.journal);
	const achievedGoals = goals.filter((goal) => goal.check(gameState).done);
	const missedGoalTitles = new Set(report.missedGoalTitles);
	const otherGoals = goals.filter((goal) => !achievedGoals.includes(goal) && !missedGoalTitles.has(goal.title));
	const goalLists = (items) => items.length
		? `<ul>${items.map((goal) => `<li>${escapeHTML(typeof goal === "string" ? goal : goal.title)}</li>`).join("")}</ul>`
		: `<p class="report-empty">None</p>`;
	const tradeReasonRows = Object.entries(report.tradeReasonBreakdown)
		.sort((first, second) => second[1].totalRealisedProfitLoss - first[1].totalRealisedProfitLoss)
		.map(([reason, summary]) => `
			<tr><th scope="row">${escapeHTML(reason)}</th><td>${summary.tradesCount}</td><td class="${summary.totalRealisedProfitLoss > 0 ? "is-up" : summary.totalRealisedProfitLoss < 0 ? "is-down" : "is-flat"}">${formatSignedINR(summary.totalRealisedProfitLoss)}</td></tr>
		`).join("");
	const eventRows = [...gameState.eventLog].reverse().map((event) => `
		<li class="report-event"><span>Month ${escapeHTML(event.month)}</span><strong>${escapeHTML(event.title)}</strong><p>${escapeHTML(event.outcome)}</p></li>
	`).join("");
	const journalRows = [...gameState.journal].reverse().map((entry) => {
		const asset = assets.find((item) => item.id === entry.assetId);
		const assetName = entry.assetName ?? asset?.name ?? entry.assetId;
		const note = entry.note?.trim() ? `<small class="journal-note">${escapeHTML(entry.note)}</small>` : "";
		const profitLoss = entry.action === "Sell" ? formatINR(entry.profitLoss) : "-";
		return `<tr>
			<td>${escapeHTML(entry.month)}</td><td class="${entry.action === "Buy" ? "is-up" : "is-down"}">${escapeHTML(entry.action)}</td>
			<th scope="row">${escapeHTML(assetName)}</th><td>${escapeHTML(entry.quantity)}</td><td>${formatINR(entry.price)}</td>
			<td>${formatINR(entry.quantity * entry.price)}</td><td>${profitLoss}</td><td><span>${escapeHTML(entry.reason)}</span>${note}</td>
		</tr>`;
	}).join("");
	const reportContent = showFinalReport
		? `<article class="final-report-document">
			<header class="report-header report-section">
				<div><p class="report-kicker">WealthQuest · Final Report</p><h1>${escapeHTML(gameState.playerName ?? "Player")}</h1></div>
				<div class="report-header-meta"><time>${reportDate}</time><strong>${gameState.month} of 24 months</strong></div>
			</header>
			<section class="report-section">
				<h2>Performance Analysis</h2>
				<dl class="report-stat-grid">
					<div><dt>Final value</dt><dd>${formatINR(report.finalValue)}</dd></div>
					<div><dt>Total return</dt><dd>${report.totalReturnPercent.toFixed(2)}%</dd></div>
					<div><dt>Benchmark return</dt><dd>${report.benchmark.totalReturnPercent.toFixed(2)}%</dd></div>
					<div><dt>Max drawdown</dt><dd>${report.maxDrawdownPercent.toFixed(2)}%</dd></div>
					<div><dt>Health score</dt><dd>${report.finalFinancialHealthScore}/100</dd></div>
				</dl>
				${renderFinalValueChart(report)}
			</section>
			<section class="report-section">
				<h2>Trade Analysis</h2>
				<div class="report-table-wrap"><table class="report-table">
					<thead><tr><th>Reason</th><th>Trades</th><th>Realised P/L</th></tr></thead>
					<tbody>${tradeReasonRows || `<tr><td colspan="3">No trades recorded.</td></tr>`}</tbody>
				</table></div>
			</section>
			<section class="report-section">
				<h2>Life Events</h2>
				<p>${report.lifeEventsFaced} event${report.lifeEventsFaced === 1 ? "" : "s"} faced · ${report.forcedSales} forced sale${report.forcedSales === 1 ? "" : "s"}</p>
				${eventRows ? `<ol class="report-event-list">${eventRows}</ol>` : `<p class="report-empty">No life events were recorded.</p>`}
			</section>
			<section class="report-section">
				<h2>Goals Achieved and Missed</h2>
				<div class="report-goal-columns">
					<div><h3>Achieved (${report.goalsAchieved})</h3>${goalLists(achievedGoals)}</div>
					<div><h3>Missed (${report.goalsMissed})</h3>${goalLists(report.missedGoalTitles)}</div>
				</div>
				${otherGoals.length ? `<div class="report-other-goals"><h3>Not yet due</h3>${goalLists(otherGoals)}</div>` : ""}
			</section>
			<section class="report-section">
				<h2>Lessons Learned</h2>
				<div class="report-lessons">${lessons.map((lesson) => `
					<article class="lesson-card lesson-${lesson.tone}"><h3>${escapeHTML(lesson.title)}</h3><p>${escapeHTML(lesson.explanation)}</p></article>
				`).join("")}</div>
			</section>
			<section class="report-section report-journal-section">
				<div class="report-journal-heading"><h2>Full Journal</h2><p>${journalStats.totalTrades} trades</p></div>
				<div class="report-table-wrap"><table class="report-table report-journal-table">
					<thead><tr><th>Month</th><th>Action</th><th>Asset</th><th>Quantity</th><th>Price</th><th>Amount</th><th>Profit/Loss</th><th>Reason / Note</th></tr></thead>
					<tbody>${journalRows || `<tr><td colspan="8">No trades recorded.</td></tr>`}</tbody>
				</table></div>
			</section>
		</article>`
		: `<div class="game-over-content">
			<p class="game-over-kicker">WealthQuest</p>
			<h1>Game Over</h1>
			<p>${escapeHTML(gameState.gameOverReason ?? "Your journey has ended.")}</p>
			<div class="game-over-actions">
				<button class="view-final-report-button" type="button">View Final Report</button>
				<button class="game-over-secondary-button restart-game-button" type="button">New Game</button>
			</div>
		</div>`;

	gameOverScreen.hidden = false;
	gameOverScreen.innerHTML = `<div class="game-over-panel ${showFinalReport ? "final-report-panel" : ""}" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
		${showFinalReport ? `<div class="report-toolbar"><button class="print-report-button" type="button">Print / Save as PDF</button><button class="game-over-secondary-button back-to-game-over" type="button">Back to Game Over</button><button class="game-over-secondary-button restart-game-button" type="button">New Game</button></div>` : ""}
		${reportContent}
	</div>`;
	if (showFinalReport) {
		gameOverScreen.querySelector(".report-header h1").id = "game-over-title";
		gameOverScreen.querySelector(".print-report-button").addEventListener("click", () => window.print());
		gameOverScreen.querySelector(".back-to-game-over").addEventListener("click", () => {
			showFinalReport = false;
			renderGameOverScreen();
		});
		gameOverScreen.querySelector(".restart-game-button").addEventListener("click", restartGameFromEnd);
	} else {
		gameOverScreen.querySelector("h1").id = "game-over-title";
		gameOverScreen.querySelector(".view-final-report-button").addEventListener("click", () => {
			showFinalReport = true;
			renderGameOverScreen();
		});
		gameOverScreen.querySelector(".restart-game-button").addEventListener("click", restartGameFromEnd);
	}
}

function render() {
	if (gameState.gameOver) {
		dashboard.hidden = true;
		renderGameOverScreen();
		return;
	}

	dashboard.hidden = false;
	gameOverScreen.hidden = true;
	renderStats();
	renderMarket();
	renderPortfolio();
	renderJournal();
	renderValueChart();
	renderEvents();
	renderGoals();
}

setupNewGameDialog();
setupHowToPlay();

// Restore the saved game, or initialize and save a fresh one.
if (!loadGame()) {
	newGame();
	saveGame();
}

render();
