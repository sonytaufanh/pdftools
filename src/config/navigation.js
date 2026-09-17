import { Archive, BookOpen, FileImage, FileText, Files, Images } from 'lucide-react';

export const DEFAULT_ROUTE = '/pdf-tools';

export const NAV_ITEMS = [
  {
    to: '/pdf-tools',
    label: 'Alat PDF',
    description: 'Pisah, putar, ekspor PDF',
    icon: FileText
  },
  {
    to: '/merge-files',
    label: 'Gabung File',
    description: 'Gabungkan gambar dan PDF',
    icon: Files
  },
  {
    to: '/compress-pdf',
    label: 'Kompres PDF',
    description: 'Kecilkan ukuran file PDF',
    icon: Archive
  },
  {
    to: '/pdf-to-image',
    label: 'PDF ke Gambar',
    description: 'Ekspor halaman jadi gambar',
    icon: FileImage
  },
  {
    to: '/image-to-pdf',
    label: 'Gambar ke PDF',
    description: 'Buat PDF dari gambar',
    icon: Images
  },
  {
    to: '/guide',
    label: 'Panduan',
    description: 'Cara pakai tiap alat',
    icon: BookOpen
  }
];

export function getActiveNavItem(pathname) {
  return NAV_ITEMS.find(item => item.to === pathname) ?? NAV_ITEMS[0];
}
