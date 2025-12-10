// Script to generate a setion of options based on number of teams, games per team per round, and number of rounds.
// Parallel version using worker threads with progress reporting

const { exit } = require('node:process');
const { Worker } = require('node:worker_threads');

const teams = 8
const gamesPerTeamPerRound = 3 // AKA games played per night
const totalRounds = 6 // AKA weeks of games played
const validationOptions = {
	// No team must play two games in a row
	// noDoubleHeaders : true,

	// No team must play three games in a row
	noTripleHeaders : true,

	// Maximum number of byes a team must sit between any two games
	maxIdleSlots : 2,

	// Number of slots a team has to stay from first to last game
	maxSlotSpan : 6,

	showProgressEveryNSeconds : 10
	// showFailureReasons : true,
}

// unique combinations of games for all teams
const games = []
for (let i=0; i<teams; ++i) for (let j=i+1; j<teams; ++j) games.push([i,j])
// e.g. [[0,1],[0,2],[0,3],[0,4],[0,5],
//             [1,2],[1,3],[1,4],[1,5],
//                   [2,3],[2,4],[2,5],
//                         [3,4],[3,5],
//                               [4,5]]

// Array of rounds, where each round causes all teams to play each other once.
// Each round-robin round is an array of indices into the `games` array.
const roundRobin = roundRobinGenerator(games)
// e.g. [[4,  7,  9],    => [0,5]  [1,4]  [2,3]
//       [3, 13,  5],    => [0,4]  [3,5]  [1,2]
//       [2, 10,  8],    => [0,3]  [2,4]  [1,5]
//       [1,  6, 14],    => [0,2]  [1,3]  [4,5]
//       [0, 11, 12]]    => [0,1]  [2,5]  [3,4]


let miniIndex = 0
const gamesByRound = []
for (let roundIndex=totalRounds; roundIndex--;) {
	let roundGames = []
	for (let i=gamesPerTeamPerRound; i--;) {
		roundGames = roundGames.concat(roundRobin[miniIndex++]);
		if (miniIndex==roundRobin.length) miniIndex = 0;
	}
	gamesByRound.push(roundGames);
}

function roundRobinGenerator(games) {
	const uniqueTeams = new Set()
	const gameIndexForMatchup = new Map()
	games.forEach( (game, i) => {
		uniqueTeams.add(game[0])
		uniqueTeams.add(game[1])
		gameIndexForMatchup.set(game.sort().join(), i)
	})
	const teamCount = uniqueTeams.size
	if (teamCount % 2 !== 0) {
		return console.error(`Sorry, I require an even number of teams`)
	}
	const teams = Array.from(uniqueTeams)
	const result = []
	for (let j=0; j<teamCount - 1; j++) {
		result[j] = []
		for (let i=0; i<teamCount/2; i++) {
			const team2 = teamCount - 1 - i;
			result[j].push(gameIndexForMatchup.get([teams[i], teams[team2]].sort().join()))
		}
		teams.splice(1, 0, teams.pop()) // rotate
	}
	return result
}

const factorials = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600, 6227020800, 87178291200, 1307674368000, 20922789888000, 355687428096000, 6402373705728000, 121645100408832000, 2432902008176640000, 51090942171709440000, 1124000727777607680000, 25852016738884976640000, 620448401733239439360000]
const totalGames = gamesByRound.map(gameList => factorials[gameList.length]).reduce( (a,b) => a+b )

// Worker thread code as a string (inline worker)
const workerCode = `
const { parentPort } = require('node:worker_threads');

function* permute(permutation) {
	const len = permutation.length,
		  c = Array(len).fill(0)
	let   i = 1, k, p

	yield permutation.slice()
	while (i < len) {
	  if (c[i] < i) {
		k = i % 2 && c[i];
		p = permutation[i];
		permutation[i] = permutation[k];
		permutation[k] = p;
		++c[i];
		i = 1;
		yield permutation.slice()
	  } else {
		c[i] = 0;
		++i;
	  }
	}
}

function lineupIsValid(lineup, games, opts) {
	const lineupStr = opts.showFailureReasons ? JSON.stringify(lineup.map(g => games[g])) : "";
	const timeSlotsByTeam = [];
	for (let timeSlotIndex=0; timeSlotIndex<lineup.length; timeSlotIndex++) {
		const teams = games[lineup[timeSlotIndex]]
		for (let i=0; i<2; ++i) {
			const team = teams[i];
			if (!timeSlotsByTeam[team]) timeSlotsByTeam[team] = [timeSlotIndex];
			else timeSlotsByTeam[team].push(timeSlotIndex);
		}
	}

	for (let team=timeSlotsByTeam.length; team--;) {
		const slots = timeSlotsByTeam[team]
		const gaps = []
		for (let i=1;i<slots.length;++i) gaps[i-1] = slots[i]-slots[i-1]-1;

		if (opts.maxSlotSpan) {
			const span = (slots[slots.length-1] - slots[0] + 1)
			if (span > opts.maxSlotSpan) {
				if (opts.showFailureReasons) console.log(\`Cannot play \${lineupStr} because team \${team} must be present for \${span} time slots (maximum allowed is \${opts.maxSlotSpan} time slots)\`)
				return false
			}
		}

		if (opts.noDoubleHeaders) {
			for (let i=0; i<gaps.length; ++i) {
				if (gaps[i]===0) {
					if (opts.showFailureReasons) console.log(\`Cannot play \${lineupStr} because there's a double header for team \${team}\`)
					return false
				}
			}
		}

		if (opts.noTripleHeaders) {
			for (let i=0; i<gaps.length-1; ++i) {
				if (gaps[i]===0 && gaps[i+1]===0) {
					if (opts.showFailureReasons) console.log(\`Cannot play \${lineupStr} because there's a triple header for team \${team}\`);
					return false;
				}
			}
		}

		if (opts.maxIdleSlots) {
			for (let i=0; i<gaps.length; ++i) {
				if (gaps[i]>opts.maxIdleSlots) {
					if (opts.showFailureReasons) console.log(\`Cannot play \${lineupStr} because team \${team} has a \${gaps[i]}-slot bye (maximum allowed is a \${opts.maxIdleSlots}-slot bye)\`)
					return false
				}
			}
		}
	}
	return timeSlotsByTeam;
}

parentPort.on('message', ({ gameList, roundIndex, games, validationOptions, factorials, progressInterval }) => {
	const possibilities = [];
	const permutations = factorials[gameList.length]
	let roundEvaluated = 0
	let lastProgressTime = Date.now()
	
	for (const gamesPermutation of permute(gameList)) {
		const slotByTeam = lineupIsValid(gamesPermutation, games, validationOptions);
		if (slotByTeam) possibilities.push({games: gamesPermutation, slotByTeam});
		roundEvaluated++
		
		const now = Date.now()
		if (now - lastProgressTime >= progressInterval) {
			lastProgressTime = now
			parentPort.postMessage({
				type: 'progress',
				roundIndex,
				evaluated: roundEvaluated,
				total: permutations,
				possibilities: possibilities.length
			});
		}
	}
	
	parentPort.postMessage({
		type: 'complete',
		roundIndex,
		possibilities
	});
});
`;

// Process all rounds in parallel using worker threads with progress reporting
async function processRoundsInParallel() {
	const optionsByRound = []
	const progressInterval = validationOptions.showProgressEveryNSeconds * 1000
	
	// Track progress for each round
	const roundProgress = gamesByRound.map((gameList, r) => ({
		roundIndex: r,
		evaluated: 0,
		total: factorials[gameList.length],
		possibilities: 0,
		completed: false
	}))
	
	let nextProgressMessage = Date.now() + progressInterval
	
	// Create workers for each round
	const roundPromises = gamesByRound.map((gameList, r) => {
		return new Promise((resolve, reject) => {
			const worker = new Worker(workerCode, { eval: true });
			
			worker.postMessage({ 
				gameList, 
				roundIndex: r, 
				games, 
				validationOptions, 
				factorials,
				progressInterval 
			});
			
			worker.on('message', (message) => {
				if (message.type === 'progress') {
					// Update progress for this round
					const progress = roundProgress[r]
					progress.evaluated = message.evaluated
					progress.possibilities = message.possibilities
					
					// Check if it's time to print overall progress
					const now = Date.now()
					if (now >= nextProgressMessage) {
						nextProgressMessage = now + progressInterval
						printProgress(roundProgress, totalGames)
					}
				} else if (message.type === 'complete') {
					// Round completed
					const progress = roundProgress[r]
					progress.evaluated = progress.total
					progress.possibilities = message.possibilities.length
					progress.completed = true
					
					resolve({ roundIndex: r, possibilities: message.possibilities });
					worker.terminate();
				}
			});
			
			worker.on('error', reject);
			worker.on('exit', (code) => {
				if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
			});
		});
	});

	const results = await Promise.all(roundPromises);

	// Sort results by round index to maintain order and populate optionsByRound
	results.sort((a, b) => a.roundIndex - b.roundIndex);
	results.forEach(({ roundIndex, possibilities }) => {
		optionsByRound.push(possibilities);
		console.log(`${possibilities.length} possibilities in round ${roundIndex}`)
		// No need to keep going if these settings prevent a particular round.
		if (!possibilities.length) exit(1);
	});
	
	return optionsByRound;
}

function printProgress(roundProgress, totalGames) {
	let totalEvaluated = 0
	const roundStatuses = []
	
	roundProgress.forEach((progress) => {
		totalEvaluated += progress.evaluated
		const percent = progress.total > 0 ? (progress.evaluated * 100 / progress.total).toFixed(1) : '0.0'
		const status = progress.completed ? '✓' : `${percent}%`
		roundStatuses.push(`Round ${progress.roundIndex}: ${status} (${progress.possibilities} found)`)
	})
	
	const overallPercent = totalGames > 0 ? (totalEvaluated * 100 / totalGames).toFixed(1) : '0.0'
	const totalPossibilities = roundProgress.reduce((product, p) => product * p.possibilities, 1)
	
	console.log(`...evaluated ${totalEvaluated}/${totalGames} (${overallPercent}%); found ${totalPossibilities.toLocaleString()} possible combinations total.`)
	roundStatuses.forEach(status => console.log(`  ${status}`))
}

processRoundsInParallel().catch(err => {
	console.error('Error processing rounds:', err);
	exit(1);
}).then((optionsByRound) => {
	const { neatJSON } = require('neatjson')
	const options = neatJSON(validationOptions, {wrap:10, aligned:true, aroundColon:1})
	console.log(options.replace(/^/mg, "// "))
	console.log()
	console.log("module.exports = " + neatJSON({games,optionsByRound}, {wrap:180}))
})

