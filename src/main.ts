import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { retrieveContributionData } from './fetchContributions.js';
import { parseContributionData } from './parseData.js';
import { TerrainSvgGenerator } from './generateTerrainSvg.js';

config();

async function main() {
  try {
    const args = process.argv.slice(2);
    const userName = args.find(a => !a.startsWith('-'));
    const includeCredit = true;

    if (!userName) {
      console.log('Usage:');
      console.log('  npm run dev <username>');
      process.exit(1);
    }

    const apiResponse = await retrieveContributionData(userName);
    const totalContributions = apiResponse.data.user.contributionsCollection.contributionCalendar.totalContributions;
    console.log(`Fetched ${totalContributions} total contributions for ${userName}`);

    const contributions = parseContributionData(apiResponse);

    const generator = new TerrainSvgGenerator();
    const svg = generator.generateSvg(contributions, userName, -30.5, includeCredit);

    const outputPath = `terrain-${userName}.svg`;
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
