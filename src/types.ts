export namespace Github {
  export interface ContributionDay {
    contributionCount: number;
    date: string;
  }

  export interface ContributionWeek {
    contributionDays: ContributionDay[];
  }

  export interface ContributionCalendar {
    totalContributions: number;
    weeks: ContributionWeek[];
  }

  export interface ContributionsCollection {
    contributionCalendar: ContributionCalendar;
  }

  export interface User {
    contributionsCollection: ContributionsCollection;
  }

  export interface ApiResponse {
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