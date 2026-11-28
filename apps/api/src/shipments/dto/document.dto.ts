import { DocumentSection } from '@prisma/client';
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/validation';

export class UploadDocumentDto {
  /** The document's name as the uploader types it (e.g. "فاتورة تجارية"). */
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** توكيلات ملاحية / جمارك / نقل / الصور الضوئية */
  @IsEnum(DocumentSection, { message: 'اختار الخانة' })
  section!: DocumentSection;
}

export class MoveDocumentDto {
  @IsEnum(DocumentSection, { message: 'اختار الخانة' })
  section!: DocumentSection;
}
