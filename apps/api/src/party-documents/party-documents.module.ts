import { Module } from '@nestjs/common';
import { PartyDocumentsController } from './party-documents.controller';
import { PartyDocumentsService } from './party-documents.service';

@Module({
  controllers: [PartyDocumentsController],
  providers: [PartyDocumentsService],
  exports: [PartyDocumentsService],
})
export class PartyDocumentsModule {}
