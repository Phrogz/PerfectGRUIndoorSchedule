const teams = 10
const gamesPerTeamPerRound = 1
const totalRounds = 8
const validationOptions = {
	disallowDoubleHeaders  : true,
	// disallowTripleHeaders     : true,
	maximumGameGap            : 2, // double-byes allowed
	// maxGameGapCount        : 1,
	// maxSlotSpan               : 6, // 3 games cannot require two double-byes
	// maxSlotSpan            : 5, // teams with a double-bye must also have a double-header
	// maxSlotSpan            : 4,
	// showFailureReasons     : true,
	showProgressEveryNSeconds : 5
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

function lineupIsValid(lineup, opts) {
	const lineupStr = JSON.stringify(lineup.map(g => games[g]));
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
				if (opts.showFailureReasons) console.log(`Cannot play ${lineupStr} because team ${team} must be present for ${span} time slots (maximum allowed is ${opts.maxSlotSpan} time slots)`)
				return false
			}
		}

		if (opts.disallowDoubleHeaders) {
			// FIXME: this assumes 3 games per round max
			if (gaps[0]===0 || gaps[1]===0) {
				if (opts.showFailureReasons) console.log(`Cannot play ${lineupStr} because there's a double header for team ${team}`)
				return false
			}
		}

		if (opts.disallowTripleHeaders) {
			// FIXME: this assumes 3 games per round max
			if (gaps[0]===0 && gaps[1]===0) {
				if (opts.showFailureReasons) console.log(`Cannot play ${lineupStr} because there's a triple header for team ${team}`)
				return false
			}
		}

		if (opts.maximumGameGap) {
			for (let i=0; i<gaps.length; ++i) {
				if (gaps[i]>opts.maximumGameGap) {
					if (opts.showFailureReasons) console.log(`Cannot play ${lineupStr} because team ${team} has a ${gaps[i]}-slot bye (maximum allowed is a ${opts.maximumGameGap}-slot bye)`)
					return false
				}
			}
		}

		if (opts.maxGameGapCount) {
			let maxGapInstances = 0;
			for (let i=0; i<gaps.length; ++i) {
				if (gaps[i]===opts.maximumGameGap) maxGapInstances++;
				if (maxGapInstances > opts.maxGameGapCount) {
					if (opts.showFailureReasons) console.log(`Cannot play ${lineupStr} because team ${team} has at least ${opts.maxGameGapCount+1} ${gaps[i]}-slot byes (maximum allowed is ${opts.maxGameGapCount} ${opts.maximumGameGap}-slot byes)`)
					return false
				}
			}
		}
	}
	return timeSlotsByTeam;
}


const optionsByRound = []

const factorials = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600, 6227020800, 87178291200, 1307674368000, 20922789888000, 355687428096000, 6402373705728000, 121645100408832000, 2432902008176640000, 51090942171709440000, 1124000727777607680000, 25852016738884976640000, 620448401733239439360000]
let nextProgressMessage = Date.now() + validationOptions.showProgressEveryNSeconds * 1000
const totalGames = gamesByRound.map(gameList => factorials[gameList.length]).reduce( (a,b) => a+b )
let gamesEvaluated = 0

gamesByRound.forEach((gameList,r) => {
	const possibilities = [];
	optionsByRound.push(possibilities);
	const permutations = factorials[gameList.length]
	const messageEvery = Math.floor(permutations/1000)
	for (const games of permute(gameList)) {
		const slotByTeam = lineupIsValid(games, validationOptions);
		if (slotByTeam) possibilities.push({games, slotByTeam});
		const now = Date.now()
		gamesEvaluated++
		if (now >= nextProgressMessage) {
			nextProgressMessage = now + validationOptions.showProgressEveryNSeconds * 1000
			console.log(`...evaluated ${gamesEvaluated}/${totalGames} (${(gamesEvaluated*100/totalGames).toFixed(1)}%); found ${possibilities.length} possible options in round ${r} so far.`)
		}
	}
	console.log(`${possibilities.length} possibilities in round ${r}`)
})

const { neatJSON } = require('neatjson')
const options = neatJSON(validationOptions, {wrap:10, aligned:true, aroundColon:1})
console.log(options.replace(/^/mg, "// "))
console.log()
console.log("module.exports = " + neatJSON({games,optionsByRound}, {wrap:180}))
