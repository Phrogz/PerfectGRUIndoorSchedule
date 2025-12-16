// Worker thread for evaluate-parallel.js
const { parentPort } = require('node:worker_threads');
const { scoreCombo, comboFromIndex } = require('./evaluate-common.js');

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

