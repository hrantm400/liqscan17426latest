import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query params for GET /core-layer/signals.
 *
 * All filters are optional. When omitted:
 *   - variant filter: all three variants returned.
 *   - direction filter: both BUY and SELL returned.
 *   - status: defaults to ACTIVE (the UI rarely surfaces CLOSED rows outside
 *     the pair-detail history view, so this keeps responses small).
 *   - limit: 50, capped at 200 per page.
 *   - cursor: null → first page.
 */
export class ListCoreLayerSignalsQueryDto {
    @IsOptional()
    @IsEnum(['SE', 'CRT', 'BIAS'] as const)
    variant?: 'SE' | 'CRT' | 'BIAS';

    @IsOptional()
    @IsEnum(['BUY', 'SELL'] as const)
    direction?: 'BUY' | 'SELL';

    @IsOptional()
    @IsEnum(['WEEKLY', 'DAILY', 'FOURHOUR'] as const)
    anchor?: 'WEEKLY' | 'DAILY' | 'FOURHOUR';

    @IsOptional()
    @IsEnum(['ACTIVE', 'CLOSED'] as const)
    status?: 'ACTIVE' | 'CLOSED';

    @IsOptional()
    @IsString()
    cursor?: string;

    @IsOptional()
    @Transform(({ value }) => (value === undefined || value === '' ? undefined : parseInt(value, 10)))
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number;
}
