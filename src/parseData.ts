import { DayContribution, Github } from './types.js';

export function parseContributionData(apiResponse: Github.ApiResponse): DayContribution[] {
  const contributions: DayContribution[] = [];
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