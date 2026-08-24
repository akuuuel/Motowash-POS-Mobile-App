/**
 * Utilitas Bluetooth Printer Thermal - Koko Motowash
 * Menggunakan perintah bytecode standar ESC/POS untuk pencetakan struk reguler 58mm.
 */

// Karakter khusus perintah ESC/POS (Standar internasional)
export const ESC_POS_CODES = {
  RESET: '\x1B\x40',
  ALIGN_LEFT: '\x1B\x61\x00',
  ALIGN_CENTER: '\x1B\x61\x01',
  ALIGN_RIGHT: '\x1B\x61\x02',
  TEXT_REGULAR: '\x1B\x21\x00',
  TEXT_BOLD: '\x1B\x21\x08',
  TEXT_DOUBLE_HEIGHT: '\x1B\x21\x10',
  TEXT_DOUBLE_WIDTH: '\x1B\x21\x20',
  TEXT_LARGE: '\x1B\x21\x30', // Double width + double height
  PAPER_FEED_2: '\x1B\x64\x02', // Spasi kertas ke bawah (2 baris)
  PAPER_FEED_4: '\x1B\x64\x04', // Spasi kertas ke bawah (4 baris)
};

export interface ReceiptData {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  thankYouMessage: string;
  transactionNumber: string;
  createdAt: string;
  plateNumber: string;
  vehicleCategoryName: string;
  employeeName: string;
  paymentMethod: string;
  originalPrice: number;
  finalPrice: number;
}

/**
 * Menyusun struktur teks struk belanja menjadi byte array ESC/POS untuk ukuran kertas 58mm (max 32 karakter per baris)
 */
export const buildReceiptBytes = (data: ReceiptData): string => {
  const line = '--------------------------------\n'; // 32 Karakter divider
  
  // Format mata uang Rupiah
  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };
  
  // Format waktu rilis lokal
  const localDate = new Date(data.createdAt).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const formattedDate = localDate === 'Invalid Date' ? data.createdAt : localDate;

  let builder = '';
  
  // 1. Reset printer & Set Alignment Center
  builder += ESC_POS_CODES.RESET;
  builder += ESC_POS_CODES.ALIGN_CENTER;
  
  // 2. Judul Usaha (Huruf Besar & Tebal)
  builder += ESC_POS_CODES.TEXT_LARGE + ESC_POS_CODES.TEXT_BOLD;
  builder += `${data.businessName.toUpperCase()}\n`;
  
  // Adress & Telp (Kecil)
  builder += ESC_POS_CODES.TEXT_REGULAR;
  builder += `${data.businessAddress}\n`;
  builder += `Telp: ${data.businessPhone}\n`;
  builder += line;

  // 3. Info Transaksi (Rata Kiri)
  builder += ESC_POS_CODES.ALIGN_LEFT;
  builder += `No  : ${data.transactionNumber}\n`;
  builder += `Tgl : ${formattedDate}\n`;
  builder += `Ksr : Kasir Utama\n`;
  builder += line;

  // 4. Detail Item Cuci (Plat Motor & Jenis Kategori)
  builder += ESC_POS_CODES.TEXT_BOLD;
  builder += `PLATE : ${data.plateNumber}\n`;
  builder += ESC_POS_CODES.TEXT_REGULAR;
  builder += `CUCI MOTOR - ${data.vehicleCategoryName.toUpperCase()}\n`;
  
  // Detail Cuci oleh Karyawan
  builder += `Pencuci: ${data.employeeName}\n`;
  
  // Rincian Harga
  builder += line;
  builder += ESC_POS_CODES.ALIGN_RIGHT;
  
  if (data.finalPrice !== data.originalPrice) {
    builder += `Harga Normal: ${formatRp(data.originalPrice)}\n`;
    builder += `Diskon/Adj  : -${formatRp(data.originalPrice - data.finalPrice)}\n`;
  }
  
  builder += ESC_POS_CODES.TEXT_BOLD;
  builder += `TOTAL CASH : ${formatRp(data.finalPrice)}\n`;
  builder += ESC_POS_CODES.TEXT_REGULAR;
  builder += `Metode Bayar: ${data.paymentMethod}\n`;
  builder += line;

  // 5. Pesan Terima Kasih (Center)
  builder += ESC_POS_CODES.ALIGN_CENTER;
  builder += `${data.thankYouMessage}\n`;
  builder += '\n';
  
  // Spasi tarikan kertas agar bisa disobek rapi
  builder += ESC_POS_CODES.PAPER_FEED_4;
  
  return builder;
};

export interface CategoryBreakdownItem {
  categoryName: string;
  count: number;
  commissionPerWash: number;
  subtotal: number;
}

export interface SlipGajiData {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  payoutNumber: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  periodType: string;
  totalWashCount: number;
  commissionPerWash: number;
  totalCommission: number;
  bonus: number;
  deduction: number;
  netSalary: number;
  status: string;
  paidAt: string;
  categoryBreakdown?: CategoryBreakdownItem[];
}

/**
 * Menyusun struktur teks slip gaji karyawan menjadi byte array ESC/POS untuk ukuran kertas 58mm
 */
export const buildSlipGajiBytes = (data: SlipGajiData): string => {
  const line = '--------------------------------\n';
  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  let builder = '';
  builder += ESC_POS_CODES.RESET;
  builder += ESC_POS_CODES.ALIGN_CENTER;

  builder += ESC_POS_CODES.TEXT_LARGE + ESC_POS_CODES.TEXT_BOLD;
  builder += `${data.businessName.toUpperCase()}\n`;

  builder += ESC_POS_CODES.TEXT_REGULAR;
  builder += `${data.businessAddress}\n`;
  builder += `Telp: ${data.businessPhone}\n`;
  builder += line;

  builder += ESC_POS_CODES.TEXT_BOLD;
  builder += `SLIP GAJI & KOMISI CUCI\n`;
  builder += ESC_POS_CODES.TEXT_REGULAR;
  builder += line;

  builder += ESC_POS_CODES.ALIGN_LEFT;
  builder += `No Slip : ${data.payoutNumber}\n`;
  builder += `Karyawan: ${data.employeeName}\n`;
  builder += `Periode : ${data.startDate} - ${data.endDate}\n`;
  builder += `Tgl Byr : ${data.paidAt}\n`;
  builder += line;

  // Print Category Breakdown if available
  if (data.categoryBreakdown && data.categoryBreakdown.length > 0) {
    builder += ESC_POS_CODES.TEXT_BOLD;
    builder += `RINCIAN KOMISI PER MOTOR:\n`;
    builder += ESC_POS_CODES.TEXT_REGULAR;
    data.categoryBreakdown.forEach((item) => {
      builder += `${item.categoryName}\n`;
      builder += `  ${item.count}x @${formatRp(item.commissionPerWash)} = ${formatRp(item.subtotal)}\n`;
    });
    builder += line;
  }

  builder += ESC_POS_CODES.ALIGN_RIGHT;
  builder += `Total Motor Dicuci : ${data.totalWashCount} Motor\n`;
  builder += `Total Komisi       : ${formatRp(data.totalCommission)}\n`;
  if (data.bonus > 0) {
    builder += `Bonus Tambahan     : +${formatRp(data.bonus)}\n`;
  }
  if (data.deduction > 0) {
    builder += `Potongan           : -${formatRp(data.deduction)}\n`;
  }

  builder += line;
  builder += ESC_POS_CODES.TEXT_BOLD;
  builder += `TOTAL DITERIMA : ${formatRp(data.netSalary)}\n`;
  builder += ESC_POS_CODES.TEXT_REGULAR;
  builder += `STATUS GAJI    : ${data.status.toUpperCase()}\n`;
  builder += line;

  builder += ESC_POS_CODES.ALIGN_CENTER;
  builder += `Terima kasih atas kerja keras Anda!\n`;
  builder += '\n';

  builder += ESC_POS_CODES.PAPER_FEED_4;

  return builder;
};

/**
 * PENTING: Untuk implementasi Bluetooth di Android, raw string (ASCII/UTF-8) di atas
 * harus dirubah menjadi unit8 (Uint8Array) sebelum dikirimkan ke socket Bluetooth output stream.
 */
export const stringToBytes = (str: string): Uint8Array => {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
};
