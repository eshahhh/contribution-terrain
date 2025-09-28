export class TerrainSvgGenerator {
    constructor() {
        this.cellSize = 20;
        this.heightScale = 12;
        this.padding = 120;
        this.baseHeight = 4;
        this.rotationAngle = -30.5;
        this.cos30 = Math.cos(Math.PI / 6);
        this.sin30 = Math.sin(Math.PI / 6);
        this.ambientLight = 0.3;
        this.diffuseLight = 0.7;
        this.lightDir = this.normalize3({ x: 0.3, y: -0.3, z: 1.0 });
        this.smoothSigma = 0.6;
        this.radialInfluence = 2.5;
        this.contoursEnabled = false;
        this.contourLevels = [];
        this.noiseScale = 0.3;
        this.noiseFrequency = 0.4;
    }
    calculateQuartileThresholds(heightField) {
        const allValues = heightField.flat();
        const nonZeroValues = allValues.filter(val => val > 0);
        if (nonZeroValues.length === 0) {
            return { q1: 0, q2: 0, q3: 0, max: 0, minNonZero: 0 };
        }
        const sorted = [...nonZeroValues].sort((a, b) => a - b);
        const n = sorted.length;
        const q1Index = Math.floor(n * 0.25);
        const q2Index = Math.floor(n * 0.5);
        const q3Index = Math.floor(n * 0.75);
        const q1Raw = sorted[q1Index];
        const q2Raw = sorted[q2Index];
        const q3Raw = sorted[q3Index];
        const iqr = q3Raw - q1Raw;
        const lowerBound = q1Raw - 1.5 * iqr;
        const upperBound = q3Raw + 1.5 * iqr;
        const withoutOutliers = sorted.filter(val => val >= lowerBound && val <= upperBound);
        if (withoutOutliers.length === 0) {
            return {
                q1: q1Raw,
                q2: q2Raw,
                q3: q3Raw,
                max: sorted[sorted.length - 1],
                minNonZero: sorted[0]
            };
        }
        const filteredN = withoutOutliers.length;
        const q1Final = withoutOutliers[Math.floor(filteredN * 0.25)];
        const q2Final = withoutOutliers[Math.floor(filteredN * 0.5)];
        const q3Final = withoutOutliers[Math.floor(filteredN * 0.75)];
        const maxFinal = withoutOutliers[withoutOutliers.length - 1];
        const minNonZeroFinal = withoutOutliers[0];
        return {
            q1: q1Final,
            q2: q2Final,
            q3: q3Final,
            max: maxFinal,
            minNonZero: minNonZeroFinal
        };
    }
    generateSvg(contributions, userName, rotationAngle = this.rotationAngle, includeCredit = true) {
        const grid = this.buildGrid(contributions);
        const heightField = this.buildHeightField(grid);
        const scalingThresholds = this.calculateQuartileThresholds(heightField);
        const withRadialInfluence = this.applyRadialInfluence(heightField);
        const smoothed = this.gaussianSmooth(withRadialInfluence, this.smoothSigma);
        const preserved = this.preserveZeroValleys(smoothed, heightField);
        const withNoise = this.addTerrainNoise(preserved, heightField);
        const maxEffectiveCount = Math.max(0, ...withNoise.flat());
        const dynamicContourLevels = this.calculateDynamicContours(maxEffectiveCount);
        const svgElements = [
            ...this.renderBaseGrid(grid, rotationAngle),
            ...this.renderTerrain(withNoise, rotationAngle, maxEffectiveCount, scalingThresholds),
            ...(this.contoursEnabled && dynamicContourLevels.length > 0
                ? this.renderContours(withNoise, dynamicContourLevels, rotationAngle, maxEffectiveCount)
                : []),
        ];
        const bounds = this.calculateBoundsGeneric(grid[0]?.length || 0, grid.length, maxEffectiveCount, rotationAngle);
        const hasAnyContrib = maxEffectiveCount > 0;
        return this.wrapInSvg(svgElements, bounds, userName, hasAnyContrib, includeCredit);
    }
    buildGrid(contributions) {
        const maxWeek = Math.max(...contributions.map(c => c.weekIndex));
        const grid = [];
        for (let day = 0; day < 7; day++) {
            grid[day] = new Array(maxWeek + 1).fill(0);
        }
        contributions.forEach(contribution => {
            grid[contribution.weekday][contribution.weekIndex] = contribution.count;
        });
        return grid;
    }
    buildHeightField(grid) {
        const days = grid.length;
        const weeks = grid[0]?.length || 0;
        const field = Array.from({ length: days }, (_, y) => Array.from({ length: weeks }, (_, x) => grid[y][x] || 0));
        return field;
    }
    gaussianSmooth(field, sigma = 1.0) {
        if (!sigma || sigma <= 0)
            return field.map(row => row.slice());
        const radius = Math.max(1, Math.round(sigma * 2));
        const kernel = [];
        const twoSigma2 = 2 * sigma * sigma;
        let sum = 0;
        for (let i = -radius; i <= radius; i++) {
            const v = Math.exp(-(i * i) / twoSigma2);
            kernel.push(v);
            sum += v;
        }
        for (let i = 0; i < kernel.length; i++)
            kernel[i] /= sum;
        const h = field.length;
        const w = field[0]?.length || 0;
        const preservedField = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
            const originalValue = field[y][x];
            return originalValue > 0 ? Math.pow(originalValue, 0.95) : 0;
        }));
        const temp = Array.from({ length: h }, () => Array(w).fill(0));
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let acc = 0;
                let weightSum = 0;
                for (let k = -radius; k <= radius; k++) {
                    const xi = Math.min(w - 1, Math.max(0, x + k));
                    const weight = kernel[k + radius];
                    const centerValue = preservedField[y][x];
                    const neighborValue = preservedField[y][xi];
                    const diff = Math.abs(centerValue - neighborValue);
                    const diffWeight = Math.exp(-diff * 2);
                    const finalWeight = weight * diffWeight;
                    acc += neighborValue * finalWeight;
                    weightSum += finalWeight;
                }
                temp[y][x] = weightSum > 0 ? acc / weightSum : preservedField[y][x];
            }
        }
        const out = Array.from({ length: h }, () => Array(w).fill(0));
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let acc = 0;
                let weightSum = 0;
                for (let k = -radius; k <= radius; k++) {
                    const yi = Math.min(h - 1, Math.max(0, y + k));
                    const weight = kernel[k + radius];
                    const centerValue = temp[y][x];
                    const neighborValue = temp[yi][x];
                    const diff = Math.abs(centerValue - neighborValue);
                    const diffWeight = Math.exp(-diff * 2);
                    const finalWeight = weight * diffWeight;
                    acc += neighborValue * finalWeight;
                    weightSum += finalWeight;
                }
                out[y][x] = weightSum > 0 ? acc / weightSum : temp[y][x];
            }
        }
        return out;
    }
    simpleNoise(x, y, frequency = 1.0) {
        const seed1 = Math.sin(x * frequency * 12.9898 + y * frequency * 78.233) * 43758.5453;
        const seed2 = Math.sin(x * frequency * 93.9898 + y * frequency * 47.233) * 28618.5453;
        const noise1 = (seed1 - Math.floor(seed1)) * 2 - 1;
        const noise2 = (seed2 - Math.floor(seed2)) * 2 - 1;
        return (noise1 + noise2) * 0.5;
    }
    addTerrainNoise(field, originalField) {
        const days = field.length;
        const weeks = field[0]?.length || 0;
        const noisy = field.map(row => row.slice());
        for (let y = 0; y < days; y++) {
            for (let x = 0; x < weeks; x++) {
                const height = field[y][x];
                const originalHeight = originalField[y][x];
                if (height > 0.1) {
                    const noise1 = this.simpleNoise(x, y, this.noiseFrequency) * 0.6;
                    const noise2 = this.simpleNoise(x, y, this.noiseFrequency * 2) * 0.3;
                    const noise3 = this.simpleNoise(x, y, this.noiseFrequency * 4) * 0.1;
                    const combinedNoise = noise1 + noise2 + noise3;
                    const noiseIntensity = this.noiseScale * Math.min(1, originalHeight / 5);
                    const noiseValue = combinedNoise * noiseIntensity * height;
                    const heightFactor = Math.min(1, height / 10);
                    noisy[y][x] = Math.max(0, height + noiseValue * (0.3 + heightFactor * 0.7));
                }
            }
        }
        return noisy;
    }
    applyRadialInfluence(field) {
        const days = field.length;
        const weeks = field[0]?.length || 0;
        const influenced = field.map(row => row.slice());
        for (let y = 0; y < days; y++) {
            for (let x = 0; x < weeks; x++) {
                const centerValue = field[y][x];
                if (centerValue <= 0)
                    continue;
                const radius = Math.max(1, Math.round(this.radialInfluence));
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;
                        if (ny < 0 || ny >= days || nx < 0 || nx >= weeks)
                            continue;
                        if (dy === 0 && dx === 0)
                            continue;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance > radius)
                            continue;
                        const normalizedDistance = distance / radius;
                        const falloff = Math.pow(1 - normalizedDistance, 3) * Math.exp(-normalizedDistance * 3);
                        const influence = centerValue * falloff * 0.2;
                        const originalValue = influenced[ny][nx];
                        const maxInfluence = originalValue * 0.5;
                        const clampedInfluence = Math.min(influence, maxInfluence);
                        influenced[ny][nx] = originalValue + clampedInfluence;
                    }
                }
            }
        }
        return influenced;
    }
    preserveZeroValleys(smoothed, original) {
        const preserved = smoothed.map(row => row.slice());
        for (let y = 0; y < original.length; y++) {
            for (let x = 0; x < (original[y]?.length || 0); x++) {
                if (original[y][x] === 0) {
                    preserved[y][x] = 0;
                }
            }
        }
        return preserved;
    }
    calculateDynamicContours(maxCount) {
        if (maxCount <= 0)
            return [];
        const levels = [];
        if (maxCount <= 5) {
            for (let i = 1; i <= Math.floor(maxCount); i++) {
                levels.push(i);
            }
        }
        else if (maxCount <= 15) {
            for (let i = 2; i <= Math.floor(maxCount); i += 2) {
                levels.push(i);
            }
            if (levels[0] !== 1)
                levels.unshift(1);
        }
        else {
            levels.push(1, 3, 6, 10);
            let current = 15;
            while (current <= maxCount) {
                levels.push(current);
                current = Math.floor(current * 1.5);
            }
        }
        return levels.filter(level => level <= maxCount);
    }
    applyQuartileHeightScaling(count, thresholds) {
        if (count <= 0)
            return 0;
        const baseHeight = 8;
        const heightLevels = [0, baseHeight, baseHeight * 2, baseHeight * 3.5, baseHeight * 6];
        if (count > 0 && count < thresholds.minNonZero)
            return baseHeight * 0.5;
        if (count <= thresholds.q1)
            return heightLevels[1];
        if (count <= thresholds.q2)
            return heightLevels[2];
        if (count <= thresholds.q3)
            return heightLevels[3];
        return heightLevels[4];
    }
    renderTerrain(smoothedCounts, rotationAngle, maxCount, scalingThresholds) {
        const facesWithDepth = [];
        const days = smoothedCounts.length;
        const weeks = smoothedCounts[0]?.length || 0;
        const renderOrder = [];
        for (let y = 0; y < days - 1; y++) {
            for (let x = 0; x < weeks - 1; x++)
                renderOrder.push({ y, x });
        }
        renderOrder.sort((a, b) => (a.x + a.y) - (b.x + b.y));
        for (const { y, x } of renderOrder) {
            const h00 = scalingThresholds ? this.applyQuartileHeightScaling(smoothedCounts[y][x], scalingThresholds) : 0;
            const h10 = scalingThresholds ? this.applyQuartileHeightScaling(smoothedCounts[y][x + 1], scalingThresholds) : 0;
            const h01 = scalingThresholds ? this.applyQuartileHeightScaling(smoothedCounts[y + 1][x], scalingThresholds) : 0;
            const h11 = scalingThresholds ? this.applyQuartileHeightScaling(smoothedCounts[y + 1][x + 1], scalingThresholds) : 0;
            const microNoise = 0.5;
            const h00Varied = h00 + this.simpleNoise(x * 2, y * 2, 1.5) * microNoise;
            const h10Varied = h10 + this.simpleNoise((x + 1) * 2, y * 2, 1.5) * microNoise;
            const h01Varied = h01 + this.simpleNoise(x * 2, (y + 1) * 2, 1.5) * microNoise;
            const h11Varied = h11 + this.simpleNoise((x + 1) * 2, (y + 1) * 2, 1.5) * microNoise;
            const x0 = x * this.cellSize;
            const x1 = (x + 1) * this.cellSize;
            const y0 = y * this.cellSize;
            const y1 = (y + 1) * this.cellSize;
            const g00 = { x: x0, y: y0, z: 0 };
            const g10 = { x: x1, y: y0, z: 0 };
            const g01 = { x: x0, y: y1, z: 0 };
            const g11 = { x: x1, y: y1, z: 0 };
            const t00 = { x: x0, y: y0, z: Math.max(0, h00Varied) };
            const t10 = { x: x1, y: y0, z: Math.max(0, h10Varied) };
            const t01 = { x: x0, y: y1, z: Math.max(0, h01Varied) };
            const t11 = { x: x1, y: y1, z: Math.max(0, h11Varied) };
            const maxHeight = Math.max(h00, h10, h01, h11);
            if (maxHeight < 1)
                continue;
            const avgCount = (smoothedCounts[y][x] + smoothedCounts[y][x + 1] + smoothedCounts[y + 1][x] + smoothedCounts[y + 1][x + 1]) / 4;
            this.addTriangleWithDepthSorting(facesWithDepth, [t00, t10, t11], avgCount, maxCount, scalingThresholds, rotationAngle);
            this.addTriangleWithDepthSorting(facesWithDepth, [t00, t11, t01], avgCount, maxCount, scalingThresholds, rotationAngle);
            if (h00Varied > 1 || h10Varied > 1) {
                this.addTriangleWithDepthSorting(facesWithDepth, [g00, t00, t10], avgCount, maxCount, scalingThresholds, rotationAngle);
                this.addTriangleWithDepthSorting(facesWithDepth, [g00, t10, g10], avgCount, maxCount, scalingThresholds, rotationAngle);
            }
            if (h10Varied > 1 || h11Varied > 1) {
                this.addTriangleWithDepthSorting(facesWithDepth, [g10, t10, t11], avgCount, maxCount, scalingThresholds, rotationAngle);
                this.addTriangleWithDepthSorting(facesWithDepth, [g10, t11, g11], avgCount, maxCount, scalingThresholds, rotationAngle);
            }
            if (h01Varied > 1 || h11Varied > 1) {
                this.addTriangleWithDepthSorting(facesWithDepth, [g01, t11, t01], avgCount, maxCount, scalingThresholds, rotationAngle);
                this.addTriangleWithDepthSorting(facesWithDepth, [g01, g11, t11], avgCount, maxCount, scalingThresholds, rotationAngle);
            }
            if (h00Varied > 1 || h01Varied > 1) {
                this.addTriangleWithDepthSorting(facesWithDepth, [g00, t01, t00], avgCount, maxCount, scalingThresholds, rotationAngle);
                this.addTriangleWithDepthSorting(facesWithDepth, [g00, g01, t01], avgCount, maxCount, scalingThresholds, rotationAngle);
            }
        }
        facesWithDepth.sort((a, b) => a.avgZ - b.avgZ);
        return facesWithDepth.map(face => face.svg);
    }
    renderBaseGrid(grid, rotationAngle) {
        const baseGridElements = [];
        const days = grid.length;
        const weeks = grid[0]?.length || 0;
        const baseColor = '#c3e4c8ff';
        const baseHeight = 0.5;
        const cellsWithDepth = [];
        for (let y = 0; y < days; y++) {
            for (let x = 0; x < weeks; x++) {
                const x0 = x * this.cellSize;
                const x1 = (x + 1) * this.cellSize;
                const y0 = y * this.cellSize;
                const y1 = (y + 1) * this.cellSize;
                const corner1 = { x: x0, y: y0, z: baseHeight };
                const corner2 = { x: x1, y: y0, z: baseHeight };
                const corner3 = { x: x1, y: y1, z: baseHeight };
                const corner4 = { x: x0, y: y1, z: baseHeight };
                this.addBaseTriangleWithDepth(cellsWithDepth, [corner1, corner2, corner3], baseColor, rotationAngle);
                this.addBaseTriangleWithDepth(cellsWithDepth, [corner1, corner3, corner4], baseColor, rotationAngle);
            }
        }
        cellsWithDepth.sort((a, b) => a.avgZ - b.avgZ);
        return cellsWithDepth.map(cell => cell.svg);
    }
    addBaseTriangleWithDepth(facesWithDepth, tri, color, rotationAngle) {
        const normal = this.computeNormal(tri[0], tri[1], tri[2]);
        const nl = Math.max(0, this.dot3(normal, this.lightDir));
        const brightness = 0.8 + 0.2 * nl;
        const rgb = this.hexToRgb(color);
        if (rgb) {
            const litRgb = {
                r: Math.round(Math.max(0, Math.min(255, rgb.r * brightness))),
                g: Math.round(Math.max(0, Math.min(255, rgb.g * brightness))),
                b: Math.round(Math.max(0, Math.min(255, rgb.b * brightness))),
            };
            color = `rgb(${litRgb.r}, ${litRgb.g}, ${litRgb.b})`;
        }
        const p1 = this.projectPoint(tri[0], rotationAngle);
        const p2 = this.projectPoint(tri[1], rotationAngle);
        const p3 = this.projectPoint(tri[2], rotationAngle);
        const svg = `<polygon points="${p1.x.toFixed(2)},${p1.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)} ${p3.x.toFixed(2)},${p3.y.toFixed(2)}" fill="${color}" stroke="#5a6268" stroke-width="0.1" opacity="0.9" />`;
        const avgZ = (tri[0].z + tri[1].z + tri[2].z) / 3;
        facesWithDepth.push({ svg, avgZ });
    }
    addTriangleWithDepthSorting(facesWithDepth, tri, count, maxCount, scalingThresholds, rotationAngle) {
        const normal = this.computeNormal(tri[0], tri[1], tri[2]);
        const nl = Math.max(0, this.dot3(normal, this.lightDir));
        const avgHeight = (tri[0].z + tri[1].z + tri[2].z) / 3;
        const maxTerrainHeight = 48;
        const heightRatio = Math.min(1, avgHeight / maxTerrainHeight);
        const elevationFactor = 0.5 + 0.5 * heightRatio;
        const brightness = nl * elevationFactor;
        let colorCount = count;
        if (scalingThresholds && avgHeight > 0) {
            if (avgHeight >= 48)
                colorCount = scalingThresholds.max;
            else if (avgHeight >= 28)
                colorCount = scalingThresholds.q3;
            else if (avgHeight >= 16)
                colorCount = scalingThresholds.q2;
            else if (avgHeight >= 8)
                colorCount = scalingThresholds.q1;
            else
                colorCount = scalingThresholds.minNonZero;
        }
        const color = this.getColor(colorCount, brightness, maxCount, scalingThresholds);
        const p1 = this.projectPoint(tri[0], rotationAngle);
        const p2 = this.projectPoint(tri[1], rotationAngle);
        const p3 = this.projectPoint(tri[2], rotationAngle);
        const svg = `<polygon points="${p1.x.toFixed(2)},${p1.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)} ${p3.x.toFixed(2)},${p3.y.toFixed(2)}" fill="${color}" />`;
        const avgZ = (tri[0].z + tri[1].z + tri[2].z) / 3;
        facesWithDepth.push({ svg, avgZ });
    }
    renderContours(field, levels, rotationAngle, maxCount) {
        const days = field.length;
        const weeks = field[0]?.length || 0;
        const lines = [];
        const zScale = this.heightScale;
        for (const level of levels) {
            const zLevel = level * zScale;
            const segments = [];
            for (let y = 0; y < days - 1; y++) {
                for (let x = 0; x < weeks - 1; x++) {
                    const h00 = field[y][x] * zScale;
                    const h10 = field[y][x + 1] * zScale;
                    const h01 = field[y + 1][x] * zScale;
                    const h11 = field[y + 1][x + 1] * zScale;
                    const c0 = h00 >= zLevel ? 1 : 0;
                    const c1 = h10 >= zLevel ? 1 : 0;
                    const c2 = h11 >= zLevel ? 1 : 0;
                    const c3 = h01 >= zLevel ? 1 : 0;
                    const idx = (c0 << 3) | (c1 << 2) | (c2 << 1) | c3;
                    if (idx === 0 || idx === 15)
                        continue;
                    const interp = (hA, hB, tA, tB) => {
                        const t = (zLevel - hA) / (hB - hA);
                        return {
                            x: tA.x + (tB.x - tA.x) * t,
                            y: tA.y + (tB.y - tA.y) * t,
                            z: zLevel,
                        };
                    };
                    const p00 = { x: x * this.cellSize, y: y * this.cellSize, z: h00 };
                    const p10 = { x: (x + 1) * this.cellSize, y: y * this.cellSize, z: h10 };
                    const p11 = { x: (x + 1) * this.cellSize, y: (y + 1) * this.cellSize, z: h11 };
                    const p01 = { x: x * this.cellSize, y: (y + 1) * this.cellSize, z: h01 };
                    const edgePoints = [];
                    if ((c0 ^ c1) === 1)
                        edgePoints.push(interp(h00, h10, p00, p10));
                    if ((c1 ^ c2) === 1)
                        edgePoints.push(interp(h10, h11, p10, p11));
                    if ((c2 ^ c3) === 1)
                        edgePoints.push(interp(h11, h01, p11, p01));
                    if ((c3 ^ c0) === 1)
                        edgePoints.push(interp(h01, h00, p01, p00));
                    if (edgePoints.length === 2) {
                        segments.push({ a: edgePoints[0], b: edgePoints[1] });
                    }
                    else if (edgePoints.length === 4) {
                        segments.push({ a: edgePoints[0], b: edgePoints[1] });
                        segments.push({ a: edgePoints[2], b: edgePoints[3] });
                    }
                }
            }
            const stroke = this.getContourColor(level, maxCount || Math.max(...levels));
            for (const seg of segments) {
                const a = this.projectPoint(seg.a, rotationAngle);
                const b = this.projectPoint(seg.b, rotationAngle);
                lines.push(`<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${stroke}" stroke-width="0.8" opacity="0.6" />`);
            }
        }
        return lines;
    }
    projectPoint(point, rotationAngle = this.rotationAngle) {
        const isoX = (point.x - point.y) * this.cos30;
        const isoY = (point.x + point.y) * this.sin30 - point.z;
        const cosRot = Math.cos(rotationAngle * Math.PI / 180);
        const sinRot = Math.sin(rotationAngle * Math.PI / 180);
        const rotatedX = isoX * cosRot - isoY * sinRot;
        const rotatedY = isoX * sinRot + isoY * cosRot;
        return {
            x: rotatedX + this.padding,
            y: rotatedY + this.padding,
        };
    }
    computeNormal(a, b, c) {
        const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
        const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
        const n = {
            x: u.y * v.z - u.z * v.y,
            y: u.z * v.x - u.x * v.z,
            z: u.x * v.y - u.y * v.x,
        };
        return this.normalize3(n);
    }
    normalize3(v) {
        const len = Math.hypot(v.x, v.y, v.z) || 1;
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }
    dot3(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }
    getColor(count, brightness, maxCount, scalingThresholds) {
        let baseColor;
        if (count <= 0) {
            baseColor = '#ebedf0';
        }
        else if (scalingThresholds) {
            const heightLevel = this.getHeightLevel(count, scalingThresholds);
            switch (heightLevel) {
                case 0:
                    baseColor = '#c3e4c8ff';
                    break;
                case 1:
                    baseColor = '#9be9a8';
                    break;
                case 2:
                    baseColor = '#40c463';
                    break;
                case 3:
                    baseColor = '#30a14e';
                    break;
                case 4:
                    baseColor = '#216e39';
                    break;
                default:
                    baseColor = '#216e39';
                    break;
            }
        }
        else {
            const effectiveMax = maxCount || 15;
            const normalizedCount = Math.min(count / effectiveMax, 1.0);
            const colors = [
                { stop: 0.0, color: '#9be9a8' },
                { stop: 0.25, color: '#40c463' },
                { stop: 0.5, color: '#30a14e' },
                { stop: 1.0, color: '#216e39' }
            ];
            for (let i = 0; i < colors.length - 1; i++) {
                if (normalizedCount <= colors[i + 1].stop) {
                    const t = (normalizedCount - colors[i].stop) / (colors[i + 1].stop - colors[i].stop);
                    baseColor = this.interpolateColors(colors[i].color, colors[i + 1].color, t);
                    break;
                }
            }
            baseColor = colors[colors.length - 1].color;
        }
        const rgb = this.hexToRgb(baseColor);
        if (!rgb)
            return baseColor;
        const ambient = this.ambientLight;
        const diffuse = this.diffuseLight * brightness;
        const totalLight = Math.min(1.0, ambient + diffuse);
        const minLight = 0.35;
        const clampedLight = Math.max(totalLight, minLight);
        const litRgb = {
            r: Math.round(Math.max(0, Math.min(255, rgb.r * clampedLight))),
            g: Math.round(Math.max(0, Math.min(255, rgb.g * clampedLight))),
            b: Math.round(Math.max(0, Math.min(255, rgb.b * clampedLight))),
        };
        return `rgb(${litRgb.r}, ${litRgb.g}, ${litRgb.b})`;
    }
    getHeightLevel(count, thresholds) {
        if (count <= 0)
            return 0;
        if (count < thresholds.minNonZero)
            return 0;
        if (count <= thresholds.q1)
            return 1;
        if (count <= thresholds.q2)
            return 2;
        if (count <= thresholds.q3)
            return 3;
        if (count <= thresholds.max)
            return 4;
        return 5;
    }
    interpolateColors(color1, color2, t) {
        const rgb1 = this.hexToRgb(color1);
        const rgb2 = this.hexToRgb(color2);
        if (!rgb1 || !rgb2)
            return color1;
        const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * t);
        const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * t);
        const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * t);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    getContourColor(level, maxLevel) {
        const normalizedLevel = level / maxLevel;
        const colors = [
            '#ffffff',
            '#e1e4e8',
            '#959da5',
            '#6a737d',
            '#444d56'
        ];
        const index = Math.floor(normalizedLevel * (colors.length - 1));
        const nextIndex = Math.min(index + 1, colors.length - 1);
        const t = (normalizedLevel * (colors.length - 1)) - index;
        return this.interpolateColors(colors[index], colors[nextIndex], t);
    }
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16),
            }
            : null;
    }
    calculateBoundsGeneric(weeks, days, maxCount, rotationAngle) {
        const actualMaxHeight = maxCount > 0 ? 48 + this.baseHeight : 0;
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
    wrapInSvg(elements, bounds, userName, hasAnyContrib, includeCredit) {
        const title = `<title>GitHub Contribution Terrain for ${userName}</title>`;
        const description = `<desc>3D isometric visualization of GitHub contributions with proper lighting and depth</desc>`;
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
  
  <text x="25" y="35" class="title-text">GitHub Contribution Terrain</text>
  <text x="25" y="52" class="subtitle-text">${userName}</text>
  
  <g class="${groupClass}" transform="translate(40, 80)">
    ${elements.join('\n    ')}
  </g>
  ${credit}
</svg>`;
    }
}
