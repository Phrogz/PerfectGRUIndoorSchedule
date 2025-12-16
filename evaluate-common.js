// Shared functions for evaluate.js and evaluate-parallel.js

const { neatJSON } = require("neatjson");

function loadOptions(options) {
	const { games, optionsByRound } = require(`./options/${options}`);
	const teamCount =
		Math.max.apply(
			Math,
			games.flatMap((x) => x)
		) + 1;
	const teamZeros = new Array(teamCount).fill(0);
	const gameSlotCount = optionsByRound[0][0].games.length;
	return { games, optionsByRound, teamCount, teamZeros, gameSlotCount };
}

function sum(array) {
	let sum = 0;
	for (let i = array.length; i--; ) sum += array[i];
	return sum;
}

function average(array) {
	let sum = 0;
	for (let i = array.length; i--; ) sum += array[i];
	return sum / array.length;
}

function stdev(a) {
	const avg = average(a);
	return Math.sqrt(average(a.map((n) => (n - avg) ** 2)));
}

// Pre-compute stats for a particular option, so when it's re-used in a combo we can just look them up
function calculateStats(option, painMultipliers, teamZeros, gameSlotCount, games) {
	const stats = option.stats = {}

	// Count double headers
	if (painMultipliers.doubleHeaderCount || painMultipliers.doubleHeaderDeviation) {
		stats.doubleHeadersByTeam = [...teamZeros]
		option.slotByTeam.forEach((slots, t) => {
			for (let i=slots.length-1; i--;) if (slots[i+1] - slots[i] == 1) stats.doubleHeadersByTeam[t]++
		})
	}

	// Count triple headers
	if (painMultipliers.tripleHeaderCount || painMultipliers.tripleHeaderDeviation) {
		stats.tripleHeadersByTeam = [...teamZeros]
		option.slotByTeam.forEach((slots, t) => {
			for (let i=0; i<slots.length-2; i++) if ((slots[i+1]-slots[i]) === 1 && (slots[i+2]-slots[i+1]) === 1) stats.tripleHeadersByTeam[t]++
		})
	}

	// Count total number of game slots teams need to stay
	if (painMultipliers.totalSlotCount || painMultipliers.totalSlotsDeviation) {
		stats.totalSlotsByTeam = [...teamZeros]
		option.slotByTeam.forEach((slots, t) => {
			stats.totalSlotsByTeam[t] = slots[slots.length-1] - slots[0] + 1
		})
	}

	// Count double byes
	if (painMultipliers.doubleByeCount || painMultipliers.doubleByeDeviation) {
		stats.doubleByesByTeam = [...teamZeros]
		option.slotByTeam.forEach((slots, t) => {
			for (let i=slots.length-1; i--;) if (slots[i+1] - slots[i] > 2) stats.doubleByesByTeam[t]++
		})
	}

	// Count triple byes
	if (painMultipliers.tripleByeCount || painMultipliers.tripleByeDeviation) {
		stats.tripleByesByTeam = [...teamZeros]
		option.slotByTeam.forEach((slots, t) => {
			for (let i=slots.length-1; i--;) if (slots[i+1] - slots[i] > 2) stats.tripleByesByTeam[t]++
		})
	}

	// Count early and late games by team
	if (painMultipliers.earlyLateDeviation) {
		const slotsToIncludeInEarlyOrLate = 2
		stats.earlyWeeksByTeam = [...teamZeros]
		stats.lateWeeksByTeam = [...teamZeros]
		option.slotByTeam.forEach((slots, t) => {
			if (slots.some((s) => s < slotsToIncludeInEarlyOrLate)) stats.earlyWeeksByTeam[t]++
			if (slots.some((s) => s >= gameSlotCount - slotsToIncludeInEarlyOrLate)) stats.lateWeeksByTeam[t]++
		})
	}

	// Count how many times each team plays each other team
	stats.teamMatchups = [...teamZeros].map(() => [...teamZeros])
	option.games.forEach((gameIndex) => {
		const game = games[gameIndex]
		stats.teamMatchups[game[0]][game[1]]++
		stats.teamMatchups[game[1]][game[0]]++
	})
}

// Aggregate stats across a combo's week options and compute a score
function scoreCombo(combo, painMultipliers, teamCount, teamZeros, stopIfAbove=Infinity, showStats=false, neatJSON=null) {
	combo.forEach(option => {
		if (option.slotByTeam.length !== teamCount) throw new Error(`Option is missing a team`)
	})

	// higher scores are worse
	let score = 0
	const scoreBreakdown = {}
	let doubleHeadersByTeam, tripleHeadersByTeam, totalSlotsByTeam, earlyWeeksByTeam, lateWeeksByTeam, doubleByesByTeam, tripleByesByTeam

	// Score double headers
	if (painMultipliers.doubleHeaderCount || painMultipliers.doubleHeaderDeviation) {
		doubleHeadersByTeam = [...teamZeros]
		combo.forEach((option) => {
			for (let t=0; t<teamCount; t++) doubleHeadersByTeam[t] += option.stats.doubleHeadersByTeam[t]
		});
		let componentScore = 0
		if (painMultipliers.doubleHeaderCount)     componentScore += sum(doubleHeadersByTeam) * painMultipliers.doubleHeaderCount
		if (painMultipliers.doubleHeaderDeviation) componentScore += stdev(doubleHeadersByTeam) * painMultipliers.doubleHeaderDeviation
		score += componentScore
		if (showStats) scoreBreakdown.doubleHeaders = componentScore
		if (score > stopIfAbove) return score
	}

	// Count triple headers; more is worse
	if (painMultipliers.tripleHeaderCount || painMultipliers.tripleHeaderDeviation) {
		tripleHeadersByTeam = [...teamZeros]
		combo.forEach(option => {
			for (let t=0; t<teamCount; t++) tripleHeadersByTeam[t] += option.stats.tripleHeadersByTeam[t]
		})
		let componentScore = 0
		if (painMultipliers.tripleHeaderCount)     componentScore += sum(tripleHeadersByTeam) * painMultipliers.tripleHeaderCount
		if (painMultipliers.tripleHeaderDeviation) componentScore += stdev(tripleHeadersByTeam) * painMultipliers.tripleHeaderDeviation
		score += componentScore
		if (showStats) scoreBreakdown.tripleHeaders = componentScore
		if (score > stopIfAbove) return score
	}

	// Count total number of game slots teams need to stay
	if (painMultipliers.totalSlotCount || painMultipliers.totalSlotsDeviation) {
		totalSlotsByTeam = [...teamZeros]
		combo.forEach((option) => {
			for (let t=0; t<teamCount; t++) totalSlotsByTeam[t] += option.stats.totalSlotsByTeam[t]
		})
		let componentScore = 0
		if (painMultipliers.totalSlotCount)      componentScore += sum(totalSlotsByTeam) * painMultipliers.totalSlotCount
		if (painMultipliers.totalSlotsDeviation) componentScore += stdev(totalSlotsByTeam) * painMultipliers.totalSlotsDeviation
		score += componentScore
		if (showStats) scoreBreakdown.totalSlots = componentScore
		if (score > stopIfAbove) return score
	}

	// Count double byes; more is worse
	if (painMultipliers.doubleByeCount || painMultipliers.doubleByeDeviation) {
		doubleByesByTeam = [...teamZeros]
		combo.forEach((option) => {
			for (let t=0; t<teamCount; t++) doubleByesByTeam[t] += option.stats.doubleByesByTeam[t]
		})
		let componentScore = 0
		if (painMultipliers.doubleByeCount)     componentScore += sum(doubleByesByTeam) * painMultipliers.doubleByeCount
		if (painMultipliers.doubleByeDeviation) componentScore += stdev(doubleByesByTeam) * painMultipliers.doubleByeDeviation
		score += componentScore
		if (showStats) scoreBreakdown.doubleByes = componentScore
		if (score > stopIfAbove) return score
	}

	// Count triple byes; more is worse
	if (painMultipliers.tripleByeCount || painMultipliers.tripleByeDeviation) {
		tripleByesByTeam = [...teamZeros]
		combo.forEach((option) => {
			for (let t=0; t<teamCount; t++) tripleByesByTeam[t] += option.stats.tripleByesByTeam[t]
		})
		let componentScore = 0
		if (painMultipliers.tripleByeCount)     componentScore += sum(tripleByesByTeam) * painMultipliers.tripleByeCount
		if (painMultipliers.tripleByeDeviation) componentScore += stdev(tripleByesByTeam) * painMultipliers.tripleByeDeviation
		score += componentScore
		if (showStats) scoreBreakdown.tripleByes = componentScore
		if (score > stopIfAbove) return score
	}

	// Count early and late games by team; only care about unfairness, not counts
	if (painMultipliers.earlyLateDeviation) {
		const slotsToIncludeInEarlyOrLate = 2
		earlyWeeksByTeam = [...teamZeros]
		lateWeeksByTeam = [...teamZeros]
		combo.forEach((option) => {
			for (let t=0; t<teamCount; t++) {
				earlyWeeksByTeam[t] += option.stats.earlyWeeksByTeam[t]
				lateWeeksByTeam[t] += option.stats.lateWeeksByTeam[t]
			}
		})
		const componentScore = stdev(earlyWeeksByTeam) * painMultipliers.earlyLateDeviation / 2 + stdev(lateWeeksByTeam) * painMultipliers.earlyLateDeviation / 2
		score += componentScore
		if (showStats) scoreBreakdown.earlyLateDeviation = componentScore
		if (score > stopIfAbove) return score
	}

	// Calculate per-team pain score and minimize deviation
	if (painMultipliers.unevenTeamUnhappiness) {
		// Ensure all stats are initialized (they may be null if their multipliers are null)
		if (!doubleHeadersByTeam && (painMultipliers.doubleHeaderCount || painMultipliers.doubleHeaderDeviation)) {
			doubleHeadersByTeam = [...teamZeros]
			combo.forEach((option) => {
				for (let t=0; t<teamCount; t++) doubleHeadersByTeam[t] += option.stats.doubleHeadersByTeam[t]
			})
		}
		if (!tripleHeadersByTeam && (painMultipliers.tripleHeaderCount || painMultipliers.tripleHeaderDeviation)) {
			tripleHeadersByTeam = [...teamZeros]
			combo.forEach((option) => {
				for (let t=0; t<teamCount; t++) tripleHeadersByTeam[t] += option.stats.tripleHeadersByTeam[t]
			})
		}
		if (!totalSlotsByTeam && (painMultipliers.totalSlotCount || painMultipliers.totalSlotsDeviation)) {
			totalSlotsByTeam = [...teamZeros]
			combo.forEach((option) => {
				for (let t=0; t<teamCount; t++) totalSlotsByTeam[t] += option.stats.totalSlotsByTeam[t]
			})
		}
		if (!doubleByesByTeam && (painMultipliers.doubleByeCount || painMultipliers.doubleByeDeviation)) {
			doubleByesByTeam = [...teamZeros]
			combo.forEach((option) => {
				for (let t=0; t<teamCount; t++) doubleByesByTeam[t] += option.stats.doubleByesByTeam[t]
			})
		}
		if (!tripleByesByTeam && (painMultipliers.tripleByeCount || painMultipliers.tripleByeDeviation)) {
			tripleByesByTeam = [...teamZeros]
			combo.forEach((option) => {
				for (let t=0; t<teamCount; t++) tripleByesByTeam[t] += option.stats.tripleByesByTeam[t]
			})
		}
		if (!earlyWeeksByTeam && painMultipliers.earlyLateDeviation) {
			const slotsToIncludeInEarlyOrLate = 2
			earlyWeeksByTeam = [...teamZeros]
			lateWeeksByTeam = [...teamZeros]
			combo.forEach((option) => {
				for (let t=0; t<teamCount; t++) {
					earlyWeeksByTeam[t] += option.stats.earlyWeeksByTeam[t]
					lateWeeksByTeam[t] += option.stats.lateWeeksByTeam[t]
				}
			})
		}

		// Calculate per-team pain score
		const painByTeam = [...teamZeros]
		for (let t=0; t<teamCount; t++) {
			if (painMultipliers.doubleHeaderCount) painByTeam[t] += doubleHeadersByTeam[t] * painMultipliers.doubleHeaderCount
			if (painMultipliers.tripleHeaderCount) painByTeam[t] += tripleHeadersByTeam[t] * painMultipliers.tripleHeaderCount
			if (painMultipliers.doubleByeCount) painByTeam[t] += doubleByesByTeam[t] * painMultipliers.doubleByeCount
			if (painMultipliers.tripleByeCount) painByTeam[t] += tripleByesByTeam[t] * painMultipliers.tripleByeCount
			if (painMultipliers.totalSlotCount) painByTeam[t] += totalSlotsByTeam[t] * painMultipliers.totalSlotCount
			if (painMultipliers.earlyLateDeviation) {
				painByTeam[t] += earlyWeeksByTeam[t] * painMultipliers.earlyLateDeviation / 2
				painByTeam[t] += lateWeeksByTeam[t] * painMultipliers.earlyLateDeviation / 2
			}
		}
		const componentScore = stdev(painByTeam) * painMultipliers.unevenTeamUnhappiness
		score += componentScore
		if (showStats) scoreBreakdown.unevenTeamUnhappiness = componentScore
		if (score > stopIfAbove) return score
	}

	// Count how many times each team plays each other team
	const teamMatchups = [...teamZeros].map(() => [...teamZeros])
	combo.forEach((option) => {
		for (let t0=0; t0<teamCount; t0++) {
			for (let t1=0; t1<teamCount; t1++) {
				teamMatchups[t0][t1] += option.stats.teamMatchups[t0][t1]
			}
		}
	})

	if (showStats && neatJSON) {
		const stats = {}
		if (earlyWeeksByTeam) stats.earlyWeeksByTeam = earlyWeeksByTeam
		if (lateWeeksByTeam)  stats.lateWeeksByTeam  = lateWeeksByTeam
		if (doubleHeadersByTeam) stats.doubleHeadersByTeam = doubleHeadersByTeam
		if (tripleHeadersByTeam) stats.tripleHeadersByTeam = tripleHeadersByTeam
		if (doubleByesByTeam) stats.doubleByesByTeam = doubleByesByTeam
		if (tripleByesByTeam) stats.tripleByesByTeam = tripleByesByTeam
		if (totalSlotsByTeam) stats.totalSlotsByTeam = totalSlotsByTeam
		stats.teamMatchups = teamMatchups
		console.log(neatJSON(stats, { wrap: 60, aligned: true, aroundColon: 1, short: true }))
		
		// Show score breakdown with formatted numbers
		const formattedBreakdown = {}
		for (const [key, value] of Object.entries(scoreBreakdown)) {
			if (value === Math.round(value)) {
				formattedBreakdown[key] = value
			} else {
				formattedBreakdown[key] = parseFloat(value.toFixed(3))
			}
		}
		formattedBreakdown.total = score === Math.round(score) ? score : parseFloat(score.toFixed(3))
		console.log(neatJSON(formattedBreakdown, { wrap: 60, aligned: true, aroundColon: 1, short: true }))
	}

	return score
}

// Convert combination index to actual combination
function comboFromIndex(index, optionsByRound) {
	const combo = []
	let remaining = index
	for (let r = optionsByRound.length - 1; r >= 0; r--) {
		const roundLength = optionsByRound[r].length
		const optionIndex = remaining % roundLength
		combo.unshift(optionsByRound[r][optionIndex])
		remaining = Math.floor(remaining / roundLength)
	}
	return combo
}

function gamesForCombo(combo, games) {
	return combo.map((option) =>
		option.games.map((gameIndex) => games[gameIndex])
	);
}

function indicesFromCombo(combo, optionsByRound) {
	return combo.map((option, roundIndex) =>
		optionsByRound[roundIndex].indexOf(option)
	);
}

function comboFromIndices(optionIndices, optionsByRound) {
	return optionIndices.map(
		(optionIndex, roundIndex) => optionsByRound[roundIndex][optionIndex]
	);
}

// http://phrogz.net/lazy-cartesian-product
function lazyProduct(sets, ƒ, context) {
	context ||= this;
	const p = [],
		max = sets.length - 1,
		lens = [];
	for (let i = sets.length; i--; ) lens[i] = sets[i].length;
	function dive(d) {
		const a = sets[d],
			len = lens[d];
		if (d == max)
			for (let i = 0; i < len; ++i) (p[d] = a[i]), ƒ.apply(context, p);
		else for (let i = 0; i < len; ++i) (p[d] = a[i]), dive(d + 1);
		p.pop();
	}
	dive(0);
}

module.exports = {
	neatJSON,
	loadOptions,
	sum,
	average,
	stdev,
	calculateStats,
	scoreCombo,
	comboFromIndex,
	gamesForCombo,
	indicesFromCombo,
	comboFromIndices,
	lazyProduct,
}

