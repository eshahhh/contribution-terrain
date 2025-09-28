import { DayContribution } from './types.js';
export declare class GraphSvgGenerator {
    private readonly cellSize;
    private readonly heightScale;
    private readonly padding;
    private readonly baseHeight;
    private readonly rotationAngle;
    private readonly cos30;
    private readonly sin30;
    private readonly ambientLight;
    private readonly diffuseLight;
    generateSvg(contributions: DayContribution[], userName: string, rotationAngle?: number, includeCredit?: boolean): string;
    private buildGrid;
    private renderGrid;
    private renderBaseTile;
    private renderColumn;
    private projectPoint;
    private calculateAmbientOcclusion;
    private getStrokeColor;
    private getColor;
    private hexToRgb;
    private calculateBounds;
    private wrapInSvg;
}
