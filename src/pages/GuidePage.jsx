import { Archive, FileImage, FileText, Files, Images, Lightbulb } from 'lucide-react';

const GUIDE_SECTIONS = [
  {
    icon: FileText,
    title: 'Alat PDF',
    steps: [
      'Pilih atau seret PDF untuk membukanya di workspace.',
      'Klik halaman untuk memilihnya, atau gunakan "Pilih Semua".',
      'Gunakan Putar untuk memutar halaman terpilih, atau tombol panah pada kartu untuk mengatur urutan.',
      'Aktifkan Watermark untuk menambah teks atau gambar, lalu pilih posisinya.',
      'Gunakan Range Splitter untuk mengekspor rentang halaman tertentu sebagai ZIP.',
      'Ekspor dengan tombol format (PDF, JPG, PNG) atau "Simpan Semua".'
    ]
  },
  {
    icon: Files,
    title: 'Gabung File',
    steps: [
      'Tambahkan file PDF, JPG, PNG, atau HEIC.',
      'Seret kartu untuk mengatur urutan, atau gunakan tombol panah.',
      'Gunakan Breakdown / Group untuk memecah PDF per halaman atau menggabungkannya kembali.',
      'Aktifkan B&W dan nomor halaman sesuai kebutuhan.',
      'Klik Review untuk memastikan urutan dan jumlah halaman sebelum menggabung.',
      'Pilih "Merge & Download" untuk menyimpan PDF gabungan.'
    ]
  },
  {
    icon: Archive,
    title: 'Kompres PDF',
    steps: [
      'Pilih PDF untuk dimuat dan dipratinjau.',
      'Pilih preset kompresi (Kualitas Terbaik, Seimbang, Kecil).',
      'Opsional, pilih target ukuran (mis. 75% atau 50% dari ukuran asli) agar preset otomatis dipilih.',
      'Klik "Kompres & Unduh" dan simpan hasilnya.'
    ]
  },
  {
    icon: FileImage,
    title: 'PDF ke Gambar',
    steps: [
      'Pilih PDF untuk diekspor.',
      'Pilih JPG atau PNG dan resolusi (72-216 DPI).',
      'Opsional, masukkan rentang halaman seperti 1-3,5; biarkan kosong untuk semua halaman.',
      'Ekspor satu gambar langsung, atau ZIP untuk banyak halaman.'
    ]
  },
  {
    icon: Images,
    title: 'Gambar ke PDF',
    steps: [
      'Tambahkan gambar JPG, PNG, atau HEIC.',
      'Atur urutan dengan seret atau tombol panah, dan putar sesuai kebutuhan.',
      'Pilih ukuran halaman (A4, Letter, Legal) dan kualitas gambar.',
      'Klik "Simpan PDF" untuk membuat dokumen.'
    ]
  }
];

export default function GuidePage() {
  return (
    <section className="panel guide-panel">
      <div className="guide-header">
        <span className="content-kicker">Bantuan</span>
        <h2 className="brand-title">Panduan Penggunaan</h2>
        <p className="brand-subtitle">
          Semua proses berjalan secara lokal di browser Anda. Pilih alat di bawah untuk melihat cara
          penggunaannya.
        </p>
      </div>

      <div className="guide-grid">
        {GUIDE_SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            <article key={section.title} className="guide-card">
              <Icon size={20} />
              <h3>{section.title}</h3>
              <ol>
                {section.steps.map(step => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          );
        })}
      </div>

      <div className="guide-tip">
        <Lightbulb size={18} aria-hidden="true" /> Tips: sesi aktif Anda disimpan di browser ini,
        sehingga memuat ulang halaman akan memulihkan pekerjaan Anda. Anda dapat menghapusnya lewat
        data situs di pengaturan browser.
      </div>
    </section>
  );
}
