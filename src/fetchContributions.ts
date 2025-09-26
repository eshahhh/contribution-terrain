import fetch from 'node-fetch';
import { Github } from './types.js';

const ENDPOINT = 'https://api.github.com/graphql';

const QUERY = `
  query($userName: String!) {
    user(login: $userName) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }
`;

export async function retrieveContributionData(userName: string): Promise<Github.ApiResponse> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'Missing GitHub token. Set GITHUB_TOKEN in your environment (or .env) to use the GitHub API.'
    );
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: QUERY, variables: { userName } }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = (await res.json()) as Github.ApiResponse;
  if (!data?.data?.user) {
    throw new Error(`User "${userName}" not found`);
  }
  return data;
}