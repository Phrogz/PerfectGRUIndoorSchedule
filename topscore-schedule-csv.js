// Convert a schedule array into CSV rows for import into TopScore

const schedule =
[[[5,7],[0,5],[3,7],[2,5],[0,7],[2,3],[0,6],[3,4],[1,2],[4,6],[1,4],[1,6]],
 [[2,4],[4,7],[2,6],[0,4],[6,7],[0,2],[1,7],[5,6],[0,3],[1,5],[1,3],[3,5]],
 [[1,6],[0,6],[1,4],[3,6],[0,1],[3,4],[0,7],[4,5],[2,3],[2,7],[5,7],[2,5]],
 [[2,6],[1,2],[6,7],[2,4],[1,7],[4,6],[1,5],[3,7],[0,4],[3,5],[0,3],[0,5]],
 [[3,6],[5,6],[3,4],[1,6],[4,5],[1,3],[2,5],[4,7],[0,1],[2,7],[0,7],[0,2]]]

const weeks = [
    "9/23/2025",
    "9/30/2025",
    "10/7/2025",
    "10/14/2025",
    "10/21/2025",
]

const teamNames = [
    "Team 01",
    "Team 02",
    "Team 03",
    "Team 04",
    "Team 05",
    "Team 06",
    "Team 07",
    "Team 08",
]

const timeSlots = [
    "18:30",
    "18:50",
    "19:10",
    "19:30",
    "19:50",
    "20:10",
    "20:30",
    "20:50",
    "21:10",
    "21:30",
    "21:50",
    "22:10",
]

const fieldName = "Westminster Sports Center"
const fieldNumber = 1

schedule.forEach((week, i) => {
    week.forEach((game, j) => {
        const row = [
            teamNames[game[0]],
            teamNames[game[1]],
            weeks[i],
            timeSlots[j],
            weeks[i],
            timeSlots[j+1],
            fieldName, fieldNumber
        ]
        console.log(row.join(","))
    })
})