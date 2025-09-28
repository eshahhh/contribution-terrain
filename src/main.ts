import * as core from '@actions/core';
import { writeFileSync } from 'fs';
import { retrieveContributionData } from './fetchContributions.js';
import { parseContributionData } from './parseData.js';
import { GraphSvgGenerator } from './graph.js';
import { TerrainSvgGenerator } from './terrain.js';

async function main() {
  try {
    const userName = core.getInput('username') || process.argv[2];
    const style = core.getInput('style') || 'graph';
    const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN;
    const includeCredit = true;

    if (!userName) {
      core.setFailed('Username is required');
      return;
    }

    if (!githubToken) {
      core.setFailed('GitHub token is required');
      return;
    }

    const isTerrain = style === 'terrain';
    const isGraph = style === 'graph';

    if (!isTerrain && !isGraph) {
      console.log('No style specified, defaulting to graph style. Use --terrain or --graph to specify.');
    }

    const apiResponse = await retrieveContributionData(userName, githubToken);
    const totalContributions = apiResponse.data.user.contributionsCollection.contributionCalendar.totalContributions;
    console.log(`Fetched ${totalContributions} total contributions for ${userName}`);

    const contributions = parseContributionData(apiResponse);

    const generator = isTerrain ? new TerrainSvgGenerator() : new GraphSvgGenerator();
    const svg = generator.generateSvg(contributions, userName, -30.5, includeCredit);

    const prefix = generator instanceof TerrainSvgGenerator ? 'terrain' : 'graph';
    const outputPath = `${prefix}-${userName}.svg`;
    writeFileSync(outputPath, svg, 'utf8');

    const activeDays = contributions.filter(c => c.count > 0).length;
    const maxContributions = Math.max(...contributions.map(c => c.count));

    console.log('Stats:');
    console.log(`   Total contributions: ${totalContributions}`);
    console.log(`   Most contributions in a day: ${maxContributions}`);
    console.log(`   Active days: ${activeDays} / ${contributions.length}`);

    console.log(`Saved SVG to ${outputPath}`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main();
