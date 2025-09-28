export function parseContributionData(apiResponse) {
    const contributions = [];
    const weeks = apiResponse.data.user.contributionsCollection.contributionCalendar.weeks;
    weeks.forEach((week, weekIndex) => {
        week.contributionDays.forEach((day) => {
            const date = new Date(day.date);
            const weekday = date.getDay(); // Sunday = 0 to Saturday = 6
            contributions.push({
                date: day.date,
                count: day.contributionCount,
                weekday,
                weekIndex,
            });
        });
    });
    return contributions;
}
