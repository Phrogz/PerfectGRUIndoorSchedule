// Evaluate all combinations of a particular set of options and find the best ones

// const options = "6teams_3gamespernight_4weeks"
// const options = "6teams_3gamespernight_4weeks_6max"
// const options = "6teams_3gamespernight_4weeks-HACKED"
// const options = "6teams_4gamespernight_4weeks"
// const options = "8teams_3gamespernight_4weeks_6max"
// const options = "6teams_3gamespernight_5weeks_5max"
// const options = "6teams_3gamespernight_5weeks_6max"
// const options = "8teams_3gamespernight_5weeks_6max"
// const options = "6teams_4gamespernight_4weeks-8slotsmax-notriple"
// const options = "8teams_3gamespernight_4weeks"
const options = "8teams_3gamespernight_6weeks"
// const options = "10teams_1gamepernight_8weeks"
// const options = "10teams_2gamespernight_6weeks"

// Use null to omit a factor (and speed up the evaluation)
const painMultipliers = {
	doubleHeaderCount:      0.1,  // don't mind double headers
	doubleHeaderDeviation:  0.5,  // but balance them across teams
	tripleHeaderCount:      null, // these are prevented in the options
	tripleHeaderDeviation:  null,
	doubleByeCount:         1.5,  // need to see the stats
	doubleByeDeviation:     15.0,  // but balance them across teams
	tripleByeCount:         null, // these are prevented in the options
	tripleByeDeviation:     null,
	earlyLateDeviation:     1.0,
	totalSlotCount:         1.0,
	totalSlotsDeviation:    0.2,
}

const { games, optionsByRound } = require(`./options/${options}`);
const { neatJSON } = require("neatjson");

const teamCount =
	Math.max.apply(
		Math,
		games.flatMap((x) => x)
	) + 1;
const teamZeros = new Array(teamCount).fill(0);
const gameSlotCount = optionsByRound[0][0].games.length;

function findBestCombo() {
	let bestCombo,
	    bestScore = Infinity,
	    ct = 0
	const startTime = Date.now()

	// Precompute stats for all each week's options
	optionsByRound.forEach(roundOptions => roundOptions.forEach(option => calculateStats(option)))

	lazyProduct(optionsByRound, (...combo) => {
		const comboScore = scoreCombo(combo, false, bestScore)
		++ct
		if (comboScore <= bestScore) {
			bestScore = comboScore
			bestCombo = combo
			console.log(`Combo #${ct.toLocaleString("en-US")} (${indicesFromCombo(combo).join("-")}) has a score of ${bestScore.toFixed(3)}`)
			console.log(neatJSON(gamesForCombo(combo), { wrap: 120, short: true }))
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
	console.log(neatJSON(gamesForCombo(bestCombo), { wrap: 120, short: true }))
}

// Pre-compute stats for a particular option, so when it's re-used in a combo we can just look them up
function calculateStats(option) {
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
function scoreCombo(combo, showStats, stopIfAbove=Infinity) {
	combo.forEach(option => {
		if (option.slotByTeam.length !== teamCount) throw new Error(`Option in round ${roundIndex} is missing a team`)
	})

	// higher scores are worse
	let score = 0
	let doubleHeadersByTeam, tripleHeadersByTeam, totalSlotsByTeam, earlyWeeksByTeam, lateWeeksByTeam, doubleByesByTeam, tripleByesByTeam

	// Score double headers
	if (painMultipliers.doubleHeaderCount || painMultipliers.doubleHeaderDeviation) {
		doubleHeadersByTeam = [...teamZeros]
		combo.forEach((option) => {
			for (let t=0; t<teamCount; t++) doubleHeadersByTeam[t] += option.stats.doubleHeadersByTeam[t]
		});
		if (painMultipliers.doubleHeaderCount)     score += sum(doubleHeadersByTeam) * painMultipliers.doubleHeaderCount
		if (painMultipliers.doubleHeaderDeviation) score += stdev(doubleHeadersByTeam) * painMultipliers.doubleHeaderDeviation
		if (score > stopIfAbove) return score
	}

	// Count triple headers; more is worse
	if (painMultipliers.tripleHeaderCount || painMultipliers.tripleHeaderDeviation) {
		tripleHeadersByTeam = [...teamZeros]
		combo.forEach(option => {
			for (let t=0; t<teamCount; t++) tripleHeadersByTeam[t] += option.stats.tripleHeadersByTeam[t]
		})
		if (painMultipliers.tripleHeaderCount)     score += sum(tripleHeadersByTeam) * painMultipliers.tripleHeaderCount
		if (painMultipliers.tripleHeaderDeviation) score += stdev(tripleHeadersByTeam) * painMultipliers.tripleHeaderDeviation
		if (score > stopIfAbove) return score
	}

	// Count total number of game slots teams need to stay
	if (painMultipliers.totalSlotCount || painMultipliers.totalSlotsDeviation) {
		totalSlotsByTeam = [...teamZeros]
		combo.forEach((option) => {
			for (let t=0; t<teamCount; t++) totalSlotsByTeam[t] += option.stats.totalSlotsByTeam[t]
		})
		if (painMultipliers.totalSlotCount)      score += sum(totalSlotsByTeam) * painMultipliers.totalSlotCount
		if (painMultipliers.totalSlotsDeviation) score += stdev(totalSlotsByTeam) * painMultipliers.totalSlotsDeviation
		if (score > stopIfAbove) return score
	}

	// Count double byes; more is worse
	if (painMultipliers.doubleByeCount || painMultipliers.doubleByeDeviation) {
		doubleByesByTeam = [...teamZeros]
		combo.forEach((option) => {
			for (let t=0; t<teamCount; t++) doubleByesByTeam[t] += option.stats.doubleByesByTeam[t]
		})
		if (painMultipliers.doubleByeCount)     score += sum(doubleByesByTeam) * painMultipliers.doubleByeCount
		if (painMultipliers.doubleByeDeviation) score += stdev(doubleByesByTeam) * painMultipliers.doubleByeDeviation
		if (score > stopIfAbove) return score
	}


	// Count triple byes; more is worse
	if (painMultipliers.tripleByeCount || painMultipliers.tripleByeDeviation) {
		tripleByesByTeam = [...teamZeros]
		combo.forEach((option) => {
			for (let t=0; t<teamCount; t++) tripleByesByTeam[t] += option.stats.tripleByesByTeam[t]
		})
		if (painMultipliers.tripleByeCount)     score += sum(tripleByesByTeam) * painMultipliers.tripleByeCount
		if (painMultipliers.tripleByeDeviation) score += stdev(tripleByesByTeam) * painMultipliers.tripleByeDeviation
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
		score += stdev(earlyWeeksByTeam) * painMultipliers.earlyLateDeviation / 2
		score += stdev(lateWeeksByTeam)  * painMultipliers.earlyLateDeviation / 2
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

	if (showStats) {
		stats = {}
		if (earlyWeeksByTeam) stats.earlyWeeksByTeam = earlyWeeksByTeam
		if (lateWeeksByTeam)  stats.lateWeeksByTeam  = lateWeeksByTeam
		if (doubleHeadersByTeam) stats.doubleHeadersByTeam = doubleHeadersByTeam
		if (tripleHeadersByTeam) stats.tripleHeadersByTeam = tripleHeadersByTeam
		if (doubleByesByTeam) stats.doubleByesByTeam = doubleByesByTeam
		if (tripleByesByTeam) stats.tripleByesByTeam = tripleByesByTeam
		if (totalSlotsByTeam) stats.totalSlotsByTeam = totalSlotsByTeam
		stats.teamMatchups = teamMatchups
		console.log(neatJSON(stats, { wrap: 60, aligned: true, aroundColon: 1, short: true }))
	}

	return score
}

function comboFromIndices(optionIndices) {
	return optionIndices.map(
		(optionIndex, roundIndex) => optionsByRound[roundIndex][optionIndex]
	);
}

function indicesFromCombo(combo) {
	return combo.map((option, roundIndex) =>
		optionsByRound[roundIndex].indexOf(option)
	);
}

function gamesForCombo(combo) {
	return combo.map((option) =>
		option.games.map((gameIndex) => games[gameIndex])
	);
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

findBestCombo();
