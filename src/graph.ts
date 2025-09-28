import { DayContribution } from './types.js';

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface IsometricPoint {
  x: number;
  y: number;
}

export class GraphSvgGenerator {
  private readonly cellSize = 20;
  private readonly heightScale = 12;
  private readonly padding = 120;
  private readonly baseHeight = 4;
  private readonly rotationAngle = -30.5;
  private readonly cos30 = Math.cos(Math.PI / 6);
  private readonly sin30 = Math.sin(Math.PI / 6);
  private readonly ambientLight = 0.3;
  private readonly diffuseLight = 0.7;

  generateSvg(
    contributions: DayContribution[],
    userName: string,
    rotationAngle: number = this.rotationAngle,
    includeCredit: boolean = true
  ): string {
    const grid = this.buildGrid(contributions);
    const svgElements = this.renderGrid(grid, rotationAngle);
    const bounds = this.calculateBounds(grid, rotationAngle);
    const hasAnyContrib = contributions.some(c => c.count > 0);
    return this.wrapInSvg(svgElements, bounds, userName, hasAnyContrib, includeCredit);
  }

  private buildGrid(contributions: DayContribution[]): number[][] {
    const maxWeek = Math.max(...contributions.map(c => c.weekIndex));
    const grid: number[][] = [];
    for (let day = 0; day < 7; day++) {
      grid[day] = new Array(maxWeek + 1).fill(0);
    }
    contributions.forEach(contribution => {
      grid[contribution.weekday][contribution.weekIndex] = contribution.count;
    });
    return grid;
  }

  private renderGrid(grid: number[][], rotationAngle: number = this.rotationAngle): string[] {
    const baseTiles: string[] = [];
    const columns: string[] = [];

    const renderOrder: Array<{ day: number, week: number, count: number }> = [];
    for (let day = 0; day < grid.length; day++) {
      for (let week = 0; week < grid[day].length; week++) {
        renderOrder.push({ day, week, count: grid[day][week] });
      }
    }

    renderOrder.sort((a, b) => {
      const depthA = a.week + a.day;
      const depthB = b.week + b.day;
      if (depthA !== depthB) return depthA - depthB;
      return a.count - b.count;
    });

    for (const { day, week, count } of renderOrder) {
      if (count === 0) {
        baseTiles.push(this.renderBaseTile(week, day, rotationAngle));
      }
    }
    for (const { day, week, count } of renderOrder) {
      if (count > 0) {
        columns.push(this.renderColumn(week, day, count, grid, rotationAngle));
      }
    }
    return [...baseTiles, ...columns];
  }

  private renderBaseTile(weekIndex: number, dayIndex: number, rotationAngle: number = this.rotationAngle): string {
    const baseX = Math.round(weekIndex * this.cellSize * 100) / 100;
    const baseY = Math.round(dayIndex * this.cellSize * 100) / 100;

    const p1 = this.projectPoint({ x: baseX, y: baseY, z: 0 }, rotationAngle);
    const p2 = this.projectPoint({ x: baseX + this.cellSize, y: baseY, z: 0 }, rotationAngle);
    const p3 = this.projectPoint({ x: baseX + this.cellSize, y: baseY + this.cellSize, z: 0 }, rotationAngle);
    const p4 = this.projectPoint({ x: baseX, y: baseY + this.cellSize, z: 0 }, rotationAngle);

    [p1, p2, p3, p4].forEach(point => {
      point.x = Math.round(point.x * 100) / 100;
      point.y = Math.round(point.y * 100) / 100;
    });

    const fill = '#151B23';
    const stroke = '#262C36';
    return `<polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/>`;
  }

  private renderColumn(weekIndex: number, dayIndex: number, count: number, grid: number[][], rotationAngle: number = this.rotationAngle): string {
    if (count <= 0) return '';

    const height = count * this.heightScale + this.baseHeight;
    const baseX = Math.round(weekIndex * this.cellSize * 100) / 100;
    const baseY = Math.round(dayIndex * this.cellSize * 100) / 100;

    const occlusion = this.calculateAmbientOcclusion(weekIndex, dayIndex, grid);

    const base1 = this.projectPoint({ x: baseX, y: baseY, z: 0 }, rotationAngle);
    const base2 = this.projectPoint({ x: baseX + this.cellSize, y: baseY, z: 0 }, rotationAngle);
    const base3 = this.projectPoint({ x: baseX + this.cellSize, y: baseY + this.cellSize, z: 0 }, rotationAngle);
    const base4 = this.projectPoint({ x: baseX, y: baseY + this.cellSize, z: 0 }, rotationAngle);

    const top1 = this.projectPoint({ x: baseX, y: baseY, z: height }, rotationAngle);
    const top2 = this.projectPoint({ x: baseX + this.cellSize, y: baseY, z: height }, rotationAngle);
    const top3 = this.projectPoint({ x: baseX + this.cellSize, y: baseY + this.cellSize, z: height }, rotationAngle);
    const top4 = this.projectPoint({ x: baseX, y: baseY + this.cellSize, z: height }, rotationAngle);

    [base1, base2, base3, base4, top1, top2, top3, top4].forEach(point => {
      point.x = Math.round(point.x * 100) / 100;
      point.y = Math.round(point.y * 100) / 100;
    });

    const faces: string[] = [];

    // Left
    const leftBrightness = 0.5 * (1.0 - occlusion.left * 0.5);
    const leftColor = this.getColor(count, leftBrightness);
    const leftStroke = this.getStrokeColor(count, leftBrightness);
    faces.push(`<polygon points="${base1.x},${base1.y} ${base4.x},${base4.y} ${top4.x},${top4.y} ${top1.x},${top1.y}" fill="${leftColor}" stroke="${leftStroke}" stroke-width="0.6"/>`);

    // Right
    const rightBrightness = 0.75 * (1.0 - occlusion.right * 0.4);
    const rightColor = this.getColor(count, rightBrightness);
    const rightStroke = this.getStrokeColor(count, rightBrightness);
    faces.push(`<polygon points="${base2.x},${base2.y} ${base3.x},${base3.y} ${top3.x},${top3.y} ${top2.x},${top2.y}" fill="${rightColor}" stroke="${rightStroke}" stroke-width="0.6"/>`);

    // Front
    const frontBrightness = 0.6 * (1.0 - occlusion.right * 0.3);
    const frontColor = this.getColor(count, frontBrightness);
    const frontStroke = this.getStrokeColor(count, frontBrightness);
    faces.push(`<polygon points="${base3.x},${base3.y} ${base4.x},${base4.y} ${top4.x},${top4.y} ${top3.x},${top3.y}" fill="${frontColor}" stroke="${frontStroke}" stroke-width="0.5"/>`);

    // Top
    const topBrightness = 1.0 * (1.0 - occlusion.top * 0.3);
    const topColor = this.getColor(count, topBrightness);
    const topStroke = this.getStrokeColor(count, topBrightness);
    faces.push(`<polygon points="${top1.x},${top1.y} ${top2.x},${top2.y} ${top3.x},${top3.y} ${top4.x},${top4.y}" fill="${topColor}" stroke="${topStroke}" stroke-width="0.8"/>`);

    return faces.join('\n');
  }

  private projectPoint(point: Point3D, rotationAngle: number = this.rotationAngle): IsometricPoint {
    const isoX = (point.x - point.y) * this.cos30;
    const isoY = (point.x + point.y) * this.sin30 - point.z;

    // Tilt
    const cosRot = Math.cos(rotationAngle * Math.PI / 180);
    const sinRot = Math.sin(rotationAngle * Math.PI / 180);
    const rotatedX = isoX * cosRot - isoY * sinRot;
    const rotatedY = isoX * sinRot + isoY * cosRot;

    return {
      x: rotatedX + this.padding,
      y: rotatedY + this.padding,
    };
  }

  private calculateAmbientOcclusion(weekIndex: number, dayIndex: number, grid: number[][]): { top: number, right: number, left: number } {
    const currentHeight = grid[dayIndex]?.[weekIndex] || 0;
    const neighbors = {
      top: grid[dayIndex - 1]?.[weekIndex] || 0,
      bottom: grid[dayIndex + 1]?.[weekIndex] || 0,
      left: grid[dayIndex]?.[weekIndex - 1] || 0,
      right: grid[dayIndex]?.[weekIndex + 1] || 0,
      topLeft: grid[dayIndex - 1]?.[weekIndex - 1] || 0,
      topRight: grid[dayIndex - 1]?.[weekIndex + 1] || 0,
      bottomLeft: grid[dayIndex + 1]?.[weekIndex - 1] || 0,
      bottomRight: grid[dayIndex + 1]?.[weekIndex + 1] || 0,
    };

    const topOcclusion = Math.min(1, (neighbors.top + neighbors.topLeft + neighbors.topRight) / (currentHeight + 1) / 15);
    const rightOcclusion = Math.min(1, (neighbors.right + neighbors.topRight + neighbors.bottomRight) / (currentHeight + 1) / 15);
    const leftOcclusion = Math.min(1, (neighbors.left + neighbors.topLeft + neighbors.bottomLeft) / (currentHeight + 1) / 15);

    return { top: topOcclusion, right: rightOcclusion, left: leftOcclusion };
  }

  private getStrokeColor(count: number, brightness: number): string {
    if (brightness > 0.8) return '#2a2a2a';
    if (brightness > 0.6) return '#333333';
    if (brightness > 0.4) return '#404040';
    return '#4a4a4a';
  }

  private getColor(count: number, brightness: number): string {
    let baseColor: string;
    if (count === 0) {
      baseColor = '#151B23';
    } else if (count === 1) {
      baseColor = '#9be9a8';
    } else if (count <= 3) {
      baseColor = '#40c463';
    } else if (count <= 6) {
      baseColor = '#30a14e';
    } else if (count <= 12) {
      baseColor = '#216e39';
    } else {
      baseColor = '#0d4429';
    }

    const rgb = this.hexToRgb(baseColor);
    if (!rgb) return baseColor;

    const ambient = this.ambientLight;
    const diffuse = this.diffuseLight * brightness;
    const totalLight = Math.min(1.0, ambient + diffuse);

    const litRgb = {
      r: Math.round(Math.max(0, Math.min(255, rgb.r * totalLight))),
      g: Math.round(Math.max(0, Math.min(255, rgb.g * totalLight))),
      b: Math.round(Math.max(0, Math.min(255, rgb.b * totalLight))),
    };

    return `rgb(${litRgb.r}, ${litRgb.g}, ${litRgb.b})`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
      : null;
  }

  private calculateBounds(grid: number[][], rotationAngle: number = this.rotationAngle): { width: number; height: number } {
    const weeks = grid[0]?.length || 0;
    const days = grid.length;

    const maxCount = Math.max(0, ...grid.flat());
    const hasAnyContrib = grid.some(row => row.some(c => c > 0));
    const actualMaxHeight = hasAnyContrib ? maxCount * this.heightScale + this.baseHeight : 0;

    const corners = [
      this.projectPoint({ x: 0, y: 0, z: 0 }, rotationAngle),
      this.projectPoint({ x: weeks * this.cellSize, y: 0, z: 0 }, rotationAngle),
      this.projectPoint({ x: weeks * this.cellSize, y: days * this.cellSize, z: 0 }, rotationAngle),
      this.projectPoint({ x: 0, y: days * this.cellSize, z: 0 }, rotationAngle),
      this.projectPoint({ x: 0, y: 0, z: actualMaxHeight }, rotationAngle),
      this.projectPoint({ x: weeks * this.cellSize, y: days * this.cellSize, z: actualMaxHeight }, rotationAngle),
    ];

    const minX = Math.min(...corners.map(p => p.x));
    const maxX = Math.max(...corners.map(p => p.x));
    const minY = Math.min(...corners.map(p => p.y));
    const maxY = Math.max(...corners.map(p => p.y));

    const extraPadding = 20;
    return {
      width: maxX - minX + this.padding * 2 + extraPadding,
      height: maxY - minY + this.padding * 2 + extraPadding,
    };
  }

  private wrapInSvg(
    elements: string[],
    bounds: { width: number; height: number },
    userName: string,
    hasAnyContrib: boolean,
    includeCredit: boolean
  ): string {
    const title = `<title>GitHub Contribution Graph for ${userName}</title>`;
    const description = `<desc>3D isometric graph of GitHub contributions with proper lighting and depth</desc>`;
    const groupClass = hasAnyContrib ? 'terrain-group' : '';
    const credit = includeCredit
      ? `<text x="${bounds.width - 8}" y="${bounds.height - 8}" class="credit-text" text-anchor="end">generated by github.com/eshahhh/contributions-terrain</text>`
      : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${bounds.width}" height="${bounds.height}" 
     viewBox="0 0 ${bounds.width} ${bounds.height}"
     xmlns="http://www.w3.org/2000/svg">
  ${title}
  ${description}
  
  <defs>
    <style>
      .title-text { 
        font-family: 'Segoe UI', Arial, sans-serif; 
        font-size: 18px; 
        font-weight: 600; 
        fill: #6e7781; 
        text-shadow: 0 1px 2px rgba(0,0,0,0.1);
      }
      .subtitle-text { 
        font-family: 'Segoe UI', Arial, sans-serif; 
        font-size: 13px; 
        fill: #6e7781; 
        font-weight: 400;
      }
      .credit-text {
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 8px;
        fill: #6e7781;
        opacity: 0.9;
      }
      .terrain-group {
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
      }
    </style>
    
    <defs>
      <linearGradient id="depthGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:rgba(255,255,255,0.1);stop-opacity:1" />
        <stop offset="100%" style="stop-color:rgba(0,0,0,0.05);stop-opacity:1" />
      </linearGradient>
    </defs>
  </defs>
  
  <text x="25" y="35" class="title-text">GitHub Contribution Graph</text>
  <text x="25" y="52" class="subtitle-text">${userName}</text>
  
  <g class="${groupClass}" transform="translate(40, 80)">
    ${elements.join('\n    ')}
  </g>
  ${credit}
</svg>`;
  }
}
