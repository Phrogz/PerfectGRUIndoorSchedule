// Evaluate all combinations of a particular set of options and find the best ones

const { options, painMultipliers } = require('./evaluate-config.js');
const {
	neatJSON,
	loadOptions,
	calculateStats,
	scoreCombo: scoreComboCommon,
	comboFromIndex,
	gamesForCombo,
	indicesFromCombo,
	lazyProduct,
} = require('./evaluate-common.js');

const { games, optionsByRound, teamCount, teamZeros, gameSlotCount } = loadOptions(options);

function findBestCombo() {
	let bestCombo,
	    bestScore = Infinity,
	    ct = 0
	const startTime = Date.now()

	// Precompute stats for all each week's options
	optionsByRound.forEach(roundOptions => roundOptions.forEach(option => calculateStatsLocal(option)))

	lazyProduct(optionsByRound, (...combo) => {
		const comboScore = scoreCombo(combo, false, bestScore)
		++ct
		if (comboScore <= bestScore) {
			bestScore = comboScore
			bestCombo = combo
			console.log(`Combo #${ct.toLocaleString("en-US")} (${indicesFromCombo(combo, optionsByRound).join("-")}) has a score of ${bestScore.toFixed(3)}`)
			console.log(neatJSON(gamesForCombo(combo, games), { wrap: 120, short: true }))
			scoreCombo(combo, true)
			console.log()
		}
	});
	const elapsed = (Date.now() - startTime) / 1000;
	console.log(
		`Evaluated ${ct.toLocaleString("en-US")} combinations in ${elapsed.toFixed(
			0
		)}s (${Math.round(ct / elapsed).toLocaleString("en-US")} per second)`
	)
	console.log("The best schedule is:")
	console.log(neatJSON(gamesForCombo(bestCombo, games), { wrap: 120, short: true }))
}

// Wrapper to call shared calculateStats with local context
function calculateStatsLocal(option) {
	return calculateStats(option, painMultipliers, teamZeros, gameSlotCount, games)
}

// Wrapper to call shared scoreCombo with local context
function scoreCombo(combo, showStats, stopIfAbove=Infinity) {
	return scoreComboCommon(combo, painMultipliers, teamCount, teamZeros, stopIfAbove, showStats, neatJSON)
}

findBestCombo();
