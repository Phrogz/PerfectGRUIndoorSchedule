// Evaluate all combinations of a particular set of options and find the best ones
// Parallel version using worker threads
//
// USAGE:
//   node evaluate-parallel.js [--start <combo>] [--best <combo>]
//
// COMMAND-LINE ARGUMENTS:
//   --start <combo>    Start evaluation from a specific combo number
//                      Can be specified as:
//                      - Integer: --start 121604611
//                      - Indices: --start 12-45-3-78-23-56
//                      Useful for resuming after killing the process
//
//   --best <combo>     Initialize with a known best combo found so far
//                      Can be specified as:
//                      - Integer: --best 121604611
//                      - Indices: --best 12-45-3-78-23-56
//                      The combo will be evaluated, scored, and printed at startup.
//                      Only combos with better scores will be printed during evaluation.
//
// ENVIRONMENT VARIABLES:
//   GRUWORKERS         Number of worker threads to use (default: CPU count)
//                      Example: GRUWORKERS=8 node evaluate-parallel.js
//
// EXAMPLES:
//   # Basic usage - evaluate all combinations
//   node evaluate-parallel.js
//
//   # Resume from combo index 121604611 (commas allowed, not required)
//   node evaluate-parallel.js --start 121,604,611
//
//   # Start with a known best combo (as indices)
//   node evaluate-parallel.js --best 12-45-3-78-23-56
//
//   # Resume and initialize with best combo found so far
//   node evaluate-parallel.js --start 121,604,611 --best 12-45-3-78-23-56
//
//   # Use 8 worker threads
//   GRUWORKERS=8 node evaluate-parallel.js
//
// NOTES:
//   - The options file to evaluate is specified in the code (line ~50)
//   - Progress is reported every 5 seconds showing total evaluated and best score
//   - Better combos are printed immediately when found
//   - The script uses worker threads for parallel evaluation across CPU cores

const { Worker } = require('node:worker_threads');
const os = require('os');

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
const options = "8teams_3gamespernight_6weeks_6max"
// const options = "8teams_3gamespernight_6weeks_5max"
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

// Number of worker threads (use CPU count, but allow override via env var)
const numWorkers = parseInt(process.env.GRUWORKERS) || os.cpus().length;

// Calculate total combinations
const totalCombinations = optionsByRound.reduce((product, round) => product * round.length, 1);

// Worker code
const workerCode = `
const { parentPort } = require('node:worker_threads');

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

function scoreCombo(combo, painMultipliers, teamCount, teamZeros, stopIfAbove=Infinity) {
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

let localBestScore = Infinity
let workerId, numWorkers, optionsByRound, painMultipliers, teamCount, teamZeros, totalCombinations, syncInterval, startComboIndex
let started = false

parentPort.on('message', (message) => {
	if (message.type === 'start') {
		// Initial setup
		({ workerId, numWorkers, optionsByRound, painMultipliers, teamCount, teamZeros, totalCombinations, bestScore, syncInterval, startComboIndex } = message)
		localBestScore = bestScore
		started = true
		processCombinations()
	} else if (message.type === 'updateBestScore') {
		// Update best score from main thread
		if (message.bestScore < localBestScore) {
			localBestScore = message.bestScore
		}
	}
})

function processCombinations() {
	let localBestCombo = null
	let localBestComboIndex = null
	let evaluated = 0
	let lastSyncTime = Date.now()
	
	// Find the first comboIndex >= startComboIndex that belongs to this worker
	// Workers process indices where comboIndex % numWorkers === workerId
	let comboIndex = workerId
	if (startComboIndex > 0) {
		// Find the first index >= startComboIndex that matches this worker's pattern
		const remainder = startComboIndex % numWorkers
		if (remainder <= workerId) {
			comboIndex = startComboIndex - remainder + workerId
		} else {
			comboIndex = startComboIndex - remainder + workerId + numWorkers
		}
		// Make sure we don't go below startComboIndex
		if (comboIndex < startComboIndex) {
			comboIndex += numWorkers
		}
	}
	
	// Iterate through combinations, only processing those assigned to this worker
	for (; comboIndex < totalCombinations; comboIndex += numWorkers) {
		const combo = comboFromIndex(comboIndex, optionsByRound)
		const score = scoreCombo(combo, painMultipliers, teamCount, teamZeros, localBestScore)
		evaluated++
		
		if (score <= localBestScore) {
			localBestScore = score
			localBestCombo = combo
			localBestComboIndex = comboIndex
			
			// Immediately report better combo
			parentPort.postMessage({
				type: 'better',
				workerId,
				comboIndex,
				score,
				combo
			})
		}
		
		// Periodically sync best score and report progress
		const now = Date.now()
		if (now - lastSyncTime >= syncInterval) {
			lastSyncTime = now
			parentPort.postMessage({
				type: 'progress',
				workerId,
				evaluated,
				bestScore: localBestScore
			})
			
			// Request updated best score
			parentPort.postMessage({
				type: 'requestBestScore'
			})
		}
	}
	
	// Send final results
	parentPort.postMessage({
		type: 'complete',
		workerId,
		evaluated,
		bestScore: localBestScore,
		bestCombo: localBestCombo,
		bestComboIndex: localBestComboIndex
	})
}
`;

// Precompute stats for all options
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

function indicesFromCombo(combo) {
	return combo.map((option, roundIndex) =>
		optionsByRound[roundIndex].indexOf(option)
	);
}

// Convert comboIndex to array of option indices for each round
function indicesFromComboIndex(comboIndex, optionsByRound) {
	const indices = []
	let remaining = comboIndex
	for (let r = optionsByRound.length - 1; r >= 0; r--) {
		const roundLength = optionsByRound[r].length
		const optionIndex = remaining % roundLength
		indices.unshift(optionIndex)
		remaining = Math.floor(remaining / roundLength)
	}
	return indices
}

// Convert array of option indices to comboIndex (inverse of indicesFromComboIndex)
function comboIndexFromIndices(indices, optionsByRound) {
	let comboIndex = 0
	for (let r = 0; r < indices.length; r++) {
		// Calculate product of lengths of all subsequent rounds
		let multiplier = 1
		for (let i = r + 1; i < optionsByRound.length; i++) {
			multiplier *= optionsByRound[i].length
		}
		comboIndex += indices[r] * multiplier
	}
	return comboIndex
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

function gamesForCombo(combo) {
	return combo.map((option) =>
		option.games.map((gameIndex) => games[gameIndex])
	);
}

function scoreCombo(combo, showStats, stopIfAbove=Infinity) {
	combo.forEach(option => {
		if (option.slotByTeam.length !== teamCount) throw new Error(`Option is missing a team`)
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
	}

	return score
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

// Parse command-line arguments
function parseArgs() {
	const args = process.argv.slice(2)
	let startComboIndex = 0
	let bestComboIndex = null
	let bestCombo = null
	let bestScore = Infinity
	
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--start' && i + 1 < args.length) {
			const startArg = args[i + 1]
			if (startArg.includes('-')) {
				// Parse as indices like "12-45-3-78-23-56"
				const indices = startArg.split('-').map(x => parseInt(x, 10))
				startComboIndex = comboIndexFromIndices(indices, optionsByRound)
			} else {
				// Parse as integer (allow commas for readability/copy/paste)
				startComboIndex = parseInt(startArg.replace(/,/g, ''), 10)
			}
			i++
		} else if (args[i] === '--best' && i + 1 < args.length) {
			const bestArg = args[i + 1]
			if (bestArg.includes('-')) {
				// Parse as indices like "12-45-3-78-23-56"
				const indices = bestArg.split('-').map(x => parseInt(x, 10))
				bestComboIndex = comboIndexFromIndices(indices, optionsByRound)
			} else {
				// Parse as integer (allow commas for readability/copy/paste)
				bestComboIndex = parseInt(bestArg.replace(/,/g, ''), 10)
			}
			i++
		}
	}
	
	return { startComboIndex, bestComboIndex }
}

async function findBestCombo() {
	const { startComboIndex, bestComboIndex } = parseArgs()
	const startTime = Date.now()
	let bestCombo = null
	let bestScore = Infinity
	let totalEvaluated = 0
	const workerEvaluated = new Array(numWorkers).fill(0)
	let lastProgressReport = Date.now()
	const progressReportInterval = 10000 // Report progress every 10 seconds
	
	// Precompute stats for all options
	optionsByRound.forEach(roundOptions => roundOptions.forEach(option => calculateStats(option)))
	
	// If best combo was provided, evaluate and print it
	if (bestComboIndex !== null) {
		bestCombo = comboFromIndex(bestComboIndex, optionsByRound)
		bestScore = scoreCombo(bestCombo, false)
		const indices = indicesFromComboIndex(bestComboIndex, optionsByRound)
		console.log(`Starting with best combo found so far:`)
		console.log(`Combo #${bestComboIndex.toLocaleString("en-US")} (${indices.join("-")}) has a score of ${bestScore.toFixed(3)}`)
		console.log(neatJSON(gamesForCombo(bestCombo), { wrap: 120, short: true }))
		scoreCombo(bestCombo, true)
		console.log()
	}
	
	console.log(`Using ${numWorkers} workers to evaluate ${totalCombinations.toLocaleString()} combinations`)
	if (startComboIndex > 0) {
		console.log(`Starting from combo index ${startComboIndex.toLocaleString()}`)
	}
	console.log()
	
	// Create workers
	const workers = []
	const syncInterval = 5000 // Sync every 5 seconds
	
	for (let workerId = 0; workerId < numWorkers; workerId++) {
		const worker = new Worker(workerCode, { eval: true })
		
		worker.on('message', (message) => {
			if (message.type === 'better') {
				// A worker found a combo that matches or beats the best score
				const isNewBest = message.score < bestScore
				if (message.score <= bestScore) {
					if (isNewBest) {
						bestScore = message.score
						bestCombo = message.combo
					}
					const comboIndex = message.comboIndex
					const indices = indicesFromComboIndex(comboIndex, optionsByRound)
					console.log(`Combo #${comboIndex.toLocaleString("en-US")} (${indices.join("-")}) has a score of ${message.score.toFixed(3)}`)
					console.log(neatJSON(gamesForCombo(message.combo), { wrap: 120, short: true }))
					scoreCombo(message.combo, true)
					console.log()
					
					// Broadcast new best score to all workers only if it's actually better
					if (isNewBest) {
						workers.forEach(w => {
							w.postMessage({
								type: 'updateBestScore',
								bestScore
							})
						})
					}
				}
			} else if (message.type === 'progress') {
				workerEvaluated[message.workerId] = message.evaluated
				totalEvaluated = workerEvaluated.reduce((a, b) => a + b, 0)
				
				// Only output progress periodically, not on every worker update
				const now = Date.now()
				if (now - lastProgressReport >= progressReportInterval) {
					lastProgressReport = now
					const totalWithStart = startComboIndex + totalEvaluated
					const percent = (totalWithStart * 100 / totalCombinations).toFixed(1)
					console.log(`...evaluated ${totalWithStart.toLocaleString()}/${totalCombinations.toLocaleString()} (${percent}%); best score so far: ${bestScore.toFixed(3)}`)
				}
			} else if (message.type === 'requestBestScore') {
				// Send current best score to requesting worker
				worker.postMessage({
					type: 'updateBestScore',
					bestScore
				})
			} else if (message.type === 'complete') {
				workerEvaluated[message.workerId] = message.evaluated
				totalEvaluated = workerEvaluated.reduce((a, b) => a + b, 0)
				
				// Check if this worker found a better combo
				if (message.bestCombo && message.bestScore < bestScore) {
					bestScore = message.bestScore
					bestCombo = message.bestCombo
				}
			}
		})
		
		worker.on('error', (err) => {
			console.error(`Worker ${workerId} error:`, err)
		})
		
		workers.push(worker)
		
		// Start worker
		worker.postMessage({
			type: 'start',
			workerId,
			numWorkers,
			optionsByRound,
			painMultipliers,
			teamCount,
			teamZeros,
			totalCombinations,
			bestScore,
			syncInterval,
			startComboIndex
		})
	}
	
	// Wait for all workers to complete
	await Promise.all(workers.map(worker => new Promise((resolve) => {
		worker.on('exit', resolve)
	})))
	
	const elapsed = (Date.now() - startTime) / 1000;
	const totalWithStart = startComboIndex + totalEvaluated
	console.log(
		`Evaluated ${totalWithStart.toLocaleString("en-US")} combinations in ${elapsed.toFixed(
			0
		)}s (${Math.round(totalEvaluated / elapsed).toLocaleString("en-US")} per second)`
	)
	console.log("The best schedule is:")
	console.log(neatJSON(gamesForCombo(bestCombo), { wrap: 120, short: true }))
}

findBestCombo().catch(err => {
	console.error('Error:', err)
	process.exit(1)
})

