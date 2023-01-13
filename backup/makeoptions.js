const all = require('./possibilities')

const games = []
for (let i=0; i<7; ++i) for (let j=i+1; j<8; ++j) games.push([i,j])
console.log(JSON.stringify({
    games:games,
    optionsByRound: all.map(roundOptions => {
        return roundOptions.map(option => {
            const optGames = option.map(game => games.findIndex(g => game[0]==g[0] && game[1]==g[1]))
            const slotByTeam = new Array(8).fill(0).map(_ => [])
            option.forEach((game,slotIndex) => game.forEach(t => slotByTeam[t].push(slotIndex)))
            return {
                games:optGames,
                slotByTeam
            }
        })
    })
}))
