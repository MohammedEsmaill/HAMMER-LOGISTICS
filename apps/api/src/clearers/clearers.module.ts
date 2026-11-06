import { Module } from '@nestjs/common';
import { ClearersController } from './clearers.controller';
import { ClearersService } from './clearers.service';

@Module({
  controllers: [ClearersController],
  providers: [ClearersService],
})
export class ClearersModule {}
