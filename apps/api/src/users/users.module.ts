import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserSignatureController } from './user-signature.controller';
import { UserSignatureService } from './user-signature.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, UserSignatureController],
  providers: [UsersService, UserSignatureService],
})
export class UsersModule {}
