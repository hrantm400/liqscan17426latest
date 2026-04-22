import { IsBoolean } from 'class-validator';

/**
 * Body DTO for POST /admin/core-layer/sub-hour-enabled — Phase 7.3.
 *
 * Kept separate from SetCoreLayerEnabledDto on purpose: an admin who
 * intends to toggle sub-hour scanning should not be able to accidentally
 * hit the master toggle just because the bodies happen to look alike.
 * Field name is explicit (`subHourEnabled`) so the request body
 * self-documents which flag is being mutated.
 */
export class SetCoreLayerSubHourEnabledDto {
    @IsBoolean()
    subHourEnabled!: boolean;
}
