import { DocumentSection } from '@prisma/client';
import { safeName } from './file-storage';

/** The sections of a shipment's documents, as their Cloudinary folders are named. */
export const SECTION_FOLDERS: Record<DocumentSection, string> = {
  SHIPPING_AGENCY: 'توكيلات ملاحية',
  CUSTOMS: 'جمارك',
  TRANSPORT: 'نقل',
  SCANS: 'الصور الضوئية',
};

export const shipmentFolder = (fileNo: string, section: DocumentSection) =>
  `hammer/shipments/${safeName(fileNo)}/${SECTION_FOLDERS[section]}`;

/** A client's own papers, or a factory's. */
export const partyFolder = (client: { name: string }, factory?: { name: string } | null) =>
  factory ? `hammer/factories/${safeName(factory.name)}` : `hammer/clients/${safeName(client.name)}`;
