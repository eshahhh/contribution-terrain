import fetch from 'node-fetch';
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
export async function retrieveContributionData(userName, token) {
    if (!token) {
        throw new Error('Missing GitHub token. Set TOKEN_GITHUB in your environment (or .env) to use the GitHub API.');
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
    const data = (await res.json());
    if (!data?.data?.user) {
        throw new Error(`User "${userName}" not found`);
    }
    return data;
}
