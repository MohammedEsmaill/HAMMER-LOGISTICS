import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

/** Every signed-in user has a dashboard: it holds only what their permissions allow. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentUser() actor: AuthUser) {
    return this.dashboard.build(actor);
  }
}
