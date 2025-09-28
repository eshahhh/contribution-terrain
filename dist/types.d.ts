export declare namespace Github {
    interface ContributionDay {
        contributionCount: number;
        date: string;
    }
    interface ContributionWeek {
        contributionDays: ContributionDay[];
    }
    interface ContributionCalendar {
        totalContributions: number;
        weeks: ContributionWeek[];
    }
    interface ContributionsCollection {
        contributionCalendar: ContributionCalendar;
    }
    interface User {
        contributionsCollection: ContributionsCollection;
    }
    interface ApiResponse {
        data: {
            user: User;
        };
    }
}
export interface DayContribution {
    date: string;
    count: number;
    weekday: number;
    weekIndex: number;
}
