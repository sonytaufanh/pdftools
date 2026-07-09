import { Archive, FileImage, FileText, Files, Images } from 'lucide-react';

export const DEFAULT_ROUTE = '/pdf-tools';

export const NAV_ITEMS = [
  {
    to: '/pdf-tools',
    label: 'PDF Tools',
    description: 'Split, rotate, export PDF',
    icon: FileText
  },
  {
    to: '/merge-files',
    label: 'Merge File',
    description: 'Combine images and PDFs',
    icon: Files
  },
  {
    to: '/compress-pdf',
    label: 'Compress PDF',
    description: 'Reduce PDF file size',
    icon: Archive
  },
  {
    to: '/pdf-to-image',
    label: 'PDF to Image',
    description: 'Export pages as images',
    icon: FileImage
  },
  {
    to: '/image-to-pdf',
    label: 'Image to PDF',
    description: 'Create PDF from images',
    icon: Images
  }
];

export function getActiveNavItem(pathname) {
  return NAV_ITEMS.find(item => item.to === pathname) ?? NAV_ITEMS[0];
}
