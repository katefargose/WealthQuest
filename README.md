# WealthQuest

WealthQuest is a vanilla HTML, CSS, and JavaScript financial planning simulation. Manage monthly cash flow, trade a small fictional market, respond to life events, and review your progress toward personal goals over a 24-month game.

## Features

- Seeded monthly market prices and a fictional six-asset market
- Buy and sell trades with reasons, notes, portfolio tracking, and a journal
- Monthly income and expenses, emergency forced sales, and life events
- Life goals, financial health scoring, and a final performance report
- Journal CSV export and print-friendly report output
- Indian Rupee formatting and responsive desktop/mobile layouts

## Run

Install the Live Server extension in VS Code, open `index.html`, then choose **Open with Live Server** from the editor context menu. The project has no framework, build step, or package installation requirement.

## File Structure

```text
fpti/
|-- index.html
|-- README.md
|-- css/
|   `-- style.css
`-- js/
    |-- events.js
    |-- goals.js
    |-- main.js
    |-- market.js
    |-- state.js
    |-- stats.js
    `-- utils.js
```

## Financial Planning Concepts

- **Risk and return:** Simulated prices fluctuate, and returns are compared with an index benchmark.
- **Diversification:** Holding different asset types can reduce dependence on any one investment.
- **Emergency fund:** Cash and fixed deposits provide a buffer for expenses and unexpected events.
- **Liquidity:** Cash is immediately available, while investments may need to be sold, possibly at a penalty.
- **Discipline:** Trade reasons, journal notes, goals, and the financial health score encourage deliberate decisions over frequent reactions.

All prices and outcomes are simulated for learning only and are not financial advice.