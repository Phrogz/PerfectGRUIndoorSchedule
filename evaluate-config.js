// Shared configuration and utilities for evaluate.js and evaluate-parallel.js

// const options = "6teams_3gamespernight_5weeks_5max"
const options = "8teams_3gamespernight_6weeks_6max"

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
	totalSlotCount:         0.1,
	totalSlotsDeviation:    0.2,
	unevenTeamUnhappiness:  50.0,  // deviation in combined per-team pain score
}

module.exports = { options, painMultipliers };

