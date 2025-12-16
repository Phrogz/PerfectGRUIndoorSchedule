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
//   - The options file to evaluate and the pain multipliers are specified in evaluate-config.js
//   - Progress is reported every 10 seconds showing total evaluated and best score
//   - Better combos are printed immediately when found
//   - The script uses worker threads for parallel evaluation across CPU cores

const { Worker } = require('node:worker_threads');
const os = require('os');
const path = require('path');
const { options, painMultipliers } = require('./evaluate-config.js');
const {
	neatJSON,
	loadOptions,
	calculateStats,
	scoreCombo,
	comboFromIndex,
	gamesForCombo,
	indicesFromCombo,
} = require('./evaluate-common.js');

const { games, optionsByRound, teamCount, teamZeros, gameSlotCount } = loadOptions(options);

// Number of worker threads (use CPU count, but allow override via env var)
const numWorkers = parseInt(process.env.GRUWORKERS) || os.cpus().length;

// Calculate total combinations
const totalCombinations = optionsByRound.reduce((product, round) => product * round.length, 1);

// Path to worker file
const workerPath = path.join(__dirname, 'evaluate-worker.js');

// Wrapper to call shared calculateStats with local context
function calculateStatsLocal(option) {
	return calculateStats(option, painMultipliers, teamZeros, gameSlotCount, games)
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


// Wrapper to call shared scoreCombo with local context
function scoreComboLocal(combo, showStats, stopIfAbove=Infinity) {
	return scoreCombo(combo, painMultipliers, teamCount, teamZeros, stopIfAbove, showStats, neatJSON)
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
	optionsByRound.forEach(roundOptions => roundOptions.forEach(option => calculateStatsLocal(option)))
	
	// If best combo was provided, evaluate and print it
	if (bestComboIndex !== null) {
		bestCombo = comboFromIndex(bestComboIndex, optionsByRound)
		bestScore = scoreComboLocal(bestCombo, false)
		const indices = indicesFromComboIndex(bestComboIndex, optionsByRound)
		console.log(`Starting with best combo found so far:`)
		console.log(`Combo #${bestComboIndex.toLocaleString("en-US")} (${indices.join("-")}) has a score of ${bestScore.toFixed(3)}`)
		console.log(neatJSON(gamesForCombo(bestCombo, games), { wrap: 120, short: true }))
		scoreComboLocal(bestCombo, true)
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
		const worker = new Worker(workerPath)
		
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
					console.log(neatJSON(gamesForCombo(message.combo, games), { wrap: 120, short: true }))
					scoreComboLocal(message.combo, true)
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

