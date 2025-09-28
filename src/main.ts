import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { retrieveContributionData } from './fetchContributions.js';
import { parseContributionData } from './parseData.js';
import { GraphSvgGenerator } from './graph.js';
import { TerrainSvgGenerator } from './terrain.js';

config();

async function main() {
  try {
    const args = process.argv.slice(2);
    const userName = args.find(a => !a.startsWith('-'));
    const includeCredit = true;
    const isTerrain = args.includes('--terrain');
    const isGraph = args.includes('--graph');

    if (!userName) {
      console.log('Usage:');
      console.log('  npm run dev <username> -- [--terrain|--graph]');
      process.exit(1);
    }

    if (isTerrain && isGraph) {
      console.log('Please choose either --terrain or --graph, not both.');
      process.exit(1);
    }

    if (!isTerrain && !isGraph) {
      console.log('No style specified, defaulting to graph style. Use --terrain or --graph to specify.');
    }

    const apiResponse = await retrieveContributionData(userName);
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
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main();
