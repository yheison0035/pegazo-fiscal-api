import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Inyecta el platformId resuelto por el ApiKeyGuard. Uso: @PlatformId() id: string */
export const PlatformId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    return req.platformId;
  },
);
