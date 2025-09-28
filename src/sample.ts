import { GraphSvgGenerator } from './graph.js';
import { TerrainSvgGenerator } from './terrain.js';
import { DayContribution } from './types.js';
import { writeFileSync } from 'fs';

function generateSampleData(): DayContribution[] {
  const contributions: DayContribution[] = [];
  const startDate = new Date('2024-01-01');

  for (let week = 0; week < 52; week++) {
    for (let day = 0; day < 7; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + (week * 7) + day);

      let count = 0;
      if (day < 5) {
        count = Math.max(0, Math.floor(Math.random() * 8) - 1);
      } else {
        count = Math.max(0, Math.floor(Math.random() * 4) - 1);
      }

      const seasonality = Math.sin((week / 52) * 2 * Math.PI) * 2;
      count = Math.max(0, Math.floor(count + seasonality));

      contributions.push({
        date: date.toISOString().split('T')[0],
        count,
        weekday: day,
        weekIndex: week,
      });
    }
  }

  return contributions;
}

function generateZeroContributions(): DayContribution[] {
  const contributions: DayContribution[] = [];
  const startDate = new Date('2024-01-01');

  for (let week = 0; week < 52; week++) {
    for (let day = 0; day < 7; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + (week * 7) + day);

      contributions.push({
        date: date.toISOString().split('T')[0],
        count: 0,
        weekday: day,
        weekIndex: week,
      });
    }
  }

  return contributions;
}

function main() {

  // const contributions = generateZeroContributions();
  const contributions = generateSampleData();
  const totalContributions = contributions.reduce((sum, c) => sum + c.count, 0);
  const activeDays = contributions.filter(c => c.count > 0).length;
  const maxContributions = Math.max(...contributions.map(c => c.count));

  console.log(`Generated ${contributions.length} sample days`);
  console.log(`   Total contributions: ${totalContributions}`);
  console.log(`   Most contributions in a day: ${maxContributions}`);
  console.log(`   Active days: ${activeDays}/${contributions.length}`);

  // const generator = new GraphSvgGenerator();
  const generator = new TerrainSvgGenerator();
  const svg = generator.generateSvg(contributions, 'sample-user', -30.5, true);

  // const outputPath = 'graph-sample.svg';
  const outputPath = 'terrain-sample.svg';
  writeFileSync(outputPath, svg, 'utf8');

  console.log(`Saved SVG to ${outputPath}`);

}

main();