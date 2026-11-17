import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SearchService } from './search.service';

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q: string = '';
}

/** The quick search: any signed-in user, within what they may see. */
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@CurrentUser() actor: AuthUser, @Query() dto: SearchQueryDto) {
    return this.search.search(actor, dto.q);
  }
}
