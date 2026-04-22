import { IsBoolean } from 'class-validator';

/**
 * Body DTO for POST /admin/core-layer/enabled.
 *
 * The endpoint is intentionally minimal — one field. Admin auth and
 * throttling live on the controller decorators; all the actor / audit
 * context is derived from `req.user.userId`, not the request body.
 */
export class SetCoreLayerEnabledDto {
    @IsBoolean()
    enabled!: boolean;
}
