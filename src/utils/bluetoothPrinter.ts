import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking, Alert, Platform, NativeModules } from 'react-native';

const { BluetoothPrinterModule } = NativeModules;

export interface BluetoothDeviceInfo {
  name: string;
  address: string;
}

/**
 * Mendapatkan Daftar Device Bluetooth Thermal yang Sudah Di-Pairing di HP
 * 100% Murni Native via Aplikasi Koko Motowash
 */
export const getNativePairedDevices = async (): Promise<BluetoothDeviceInfo[]> => {
  if (Platform.OS === 'android' && BluetoothPrinterModule?.getPairedDevices) {
    try {
      const devices = await BluetoothPrinterModule.getPairedDevices();
      return devices || [];
    } catch (e) {
      console.log('Error fetching native paired devices:', e);
    }
  }
  return [];
};

/**
 * Membuka Halaman Pengaturan Bluetooth HP Android Secara Langsung
 * Untuk Pindai & Pairing Printer Bluetooth Baru
 */
export const openBluetoothSettings = async () => {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
    } catch (e) {
      await Linking.openSettings();
    }
  } else {
    await Linking.openSettings();
  }
};

/**
 * Membuka Halaman Pengaturan Layanan Cetak Bawaan HP Android (System Print Services)
 * Memungkinkan HP Android mendeteksi printer Bluetooth secara native tanpa app tambahan.
 */
export const openAndroidPrintSettings = async () => {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.ACTION_PRINT_SETTINGS');
    } catch (e) {
      await openBluetoothSettings();
    }
  } else {
    await Linking.openSettings();
  }
};

/**
 * Utilitas Bluetooth Printer Thermal - Koko Motowash
 * Menggunakan perintah bytecode standar ESC/POS dan Expo Print untuk pencetakan struk reguler 58mm.
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

/**
 * Menyusun HTML Struk Transaksi Khusus Format Printer Thermal 58mm
 */
export const buildReceiptHtml = (data: ReceiptData): string => {
  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  const localDate = new Date(data.createdAt).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const formattedDate = localDate === 'Invalid Date' ? data.createdAt : localDate;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @page { margin: 0; size: 58mm auto; }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          line-height: 1.3;
          width: 58mm;
          margin: 0 auto;
          padding: 8px 4px;
          color: #000;
          background: #fff;
        }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .title { font-size: 15px; font-weight: bold; margin-bottom: 2px; text-transform: uppercase; }
        .subtitle { font-size: 10px; color: #333; margin-bottom: 2px; }
        .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
      </style>
    </head>
    <body>
      <div class="center title">${data.businessName}</div>
      <div class="center subtitle">${data.businessAddress}</div>
      <div class="center subtitle">Telp: ${data.businessPhone}</div>
      <div class="divider"></div>

      <div class="row"><span>No :</span><span class="bold">${data.transactionNumber}</span></div>
      <div class="row"><span>Tgl:</span><span>${formattedDate}</span></div>
      <div class="row"><span>Ksr:</span><span>Kasir Utama</span></div>
      <div class="divider"></div>

      <div class="bold" style="font-size:13px;">PLAT : ${data.plateNumber}</div>
      <div>CUCI MOTOR - ${data.vehicleCategoryName.toUpperCase()}</div>
      <div>Pencuci: ${data.employeeName}</div>
      <div class="divider"></div>

      ${data.finalPrice !== data.originalPrice ? `
        <div class="row"><span>Harga Normal:</span><span>${formatRp(data.originalPrice)}</span></div>
        <div class="row"><span>Diskon/Adj:</span><span>-${formatRp(data.originalPrice - data.finalPrice)}</span></div>
      ` : ''}

      <div class="row bold" style="font-size:12px; margin-top:4px;">
        <span>TOTAL CASH:</span>
        <span>${formatRp(data.finalPrice)}</span>
      </div>
      <div class="row"><span>Metode Bayar:</span><span>${data.paymentMethod}</span></div>
      <div class="divider"></div>

      <div class="center" style="margin-top:8px;">${data.thankYouMessage}</div>
      <br><br>
    </body>
    </html>
  `;
};

/**
 * Menyusun HTML Slip Gaji Khusus Format Printer Thermal 58mm
 */
export const buildSlipGajiHtml = (data: SlipGajiData): string => {
  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  const breakdownRows = data.categoryBreakdown && data.categoryBreakdown.length > 0
    ? data.categoryBreakdown.map((item) => `
        <div class="row">
          <span>${item.categoryName} (${item.count}x @${formatRp(item.commissionPerWash)})</span>
          <span>${formatRp(item.subtotal)}</span>
        </div>
      `).join('')
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @page { margin: 0; size: 58mm auto; }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          line-height: 1.3;
          width: 58mm;
          margin: 0 auto;
          padding: 8px 4px;
          color: #000;
          background: #fff;
        }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .title { font-size: 15px; font-weight: bold; margin-bottom: 2px; text-transform: uppercase; }
        .subtitle { font-size: 10px; color: #333; margin-bottom: 2px; }
        .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
      </style>
    </head>
    <body>
      <div class="center title">${data.businessName}</div>
      <div class="center subtitle">${data.businessAddress}</div>
      <div class="center subtitle">Telp: ${data.businessPhone}</div>
      <div class="divider"></div>

      <div class="center bold" style="font-size:12px;">SLIP GAJI & KOMISI CUCI</div>
      <div class="divider"></div>

      <div class="row"><span>No Slip:</span><span class="bold">${data.payoutNumber}</span></div>
      <div class="row"><span>Karyawan:</span><span class="bold">${data.employeeName}</span></div>
      <div class="row"><span>Periode:</span><span>${data.startDate} s/d ${data.endDate}</span></div>
      <div class="row"><span>Tgl Byr:</span><span>${data.paidAt}</span></div>
      <div class="divider"></div>

      ${breakdownRows ? `
        <div class="bold" style="margin-bottom:4px;">RINCIAN KOMISI PER MOTOR:</div>
        ${breakdownRows}
        <div class="divider"></div>
      ` : ''}

      <div class="row"><span>Total Wash:</span><span>${data.totalWashCount} Motor</span></div>
      <div class="row"><span>Total Komisi:</span><span>${formatRp(data.totalCommission)}</span></div>
      ${data.bonus > 0 ? `<div class="row"><span>Bonus:</span><span>+${formatRp(data.bonus)}</span></div>` : ''}
      ${data.deduction > 0 ? `<div class="row"><span>Potongan:</span><span>-${formatRp(data.deduction)}</span></div>` : ''}

      <div class="divider"></div>
      <div class="row bold" style="font-size:12px;">
        <span>TOTAL DITERIMA:</span>
        <span>${formatRp(data.netSalary)}</span>
      </div>
      <div class="row"><span>Status:</span><span class="bold">${data.status.toUpperCase()}</span></div>
      <div class="divider"></div>

      <div class="center" style="margin-top:8px;">Terima kasih atas kerja keras Anda!</div>
      <br><br>
    </body>
    </html>
  `;
};

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  let i = 0;
  while (i < len) {
    const b1 = bytes[i++];
    const b2 = i < len ? bytes[i++] : NaN;
    const b3 = i < len ? bytes[i++] : NaN;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
    let enc3 = ((b2 & 15) << 2) | (b3 >> 6);
    let enc4 = b3 & 63;

    if (isNaN(b2)) {
      enc3 = enc4 = 64;
    } else if (isNaN(b3)) {
      enc4 = 64;
    }

    base64 += chars.charAt(enc1) + chars.charAt(enc2) +
              (enc3 < 64 ? chars.charAt(enc3) : '=') +
              (enc4 < 64 ? chars.charAt(enc4) : '=');
  }
  return base64;
};

/**
 * Membuka Halaman Download Driver Bluetooth Printer RawBT di Play Store
 */
export const openRawBTPlayStore = () => {
  Linking.openURL('market://details?id=ru.a414.rawbt').catch(() => {
    Linking.openURL('https://play.google.com/store/apps/details?id=ru.a414.rawbt');
  });
};

/**
 * Mengirim berkas Struk ESC/POS langsung ke fitur "Share via Bluetooth" Bawaan HP Android (Tanpa App Tambahan)
 */
export const shareToBluetoothPrinter = async (data: ReceiptData) => {
  try {
    const rawEscPosString = buildReceiptBytes(data);
    const fileName = `Struk_${data.transactionNumber.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, rawEscPosString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Kirim Ke Printer Bluetooth (Fitur Bawaan HP)',
      });
    }
  } catch (error) {
    console.error('Share to Bluetooth printer error:', error);
  }
};

/**
 * Mengirim berkas Slip Gaji ESC/POS langsung ke fitur "Share via Bluetooth" Bawaan HP Android (Tanpa App Tambahan)
 */
export const shareSlipGajiToBluetoothPrinter = async (data: SlipGajiData) => {
  try {
    const rawEscPosString = buildSlipGajiBytes(data);
    const fileName = `SlipGaji_${data.payoutNumber.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, rawEscPosString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Kirim Ke Printer Bluetooth (Fitur Bawaan HP)',
      });
    }
  } catch (error) {
    console.error('Share to Bluetooth printer error:', error);
  }
};

/**
 * Mencetak Struk Transaksi secara 100% Murni Native via Bluetooth Socket Aplikasi Koko Motowash
 */
export const printReceiptThermal = async (data: ReceiptData, targetMacAddress?: string) => {
  const rawEscPosString = buildReceiptBytes(data);
  const bytes = stringToBytes(rawEscPosString);
  const base64Data = bytesToBase64(bytes);

  // 1. UTAMA: Cetak MURNI Native Bluetooth Socket dari Aplikasi Koko Motowash (Tanpa App Tambahan)
  if (Platform.OS === 'android' && BluetoothPrinterModule?.printRawBytes) {
    try {
      let mac = targetMacAddress;
      if (!mac) {
        const paired = await getNativePairedDevices();
        if (paired && paired.length > 0) {
          // Cari device printer thermal berdasarkan kata kunci nama printer POS / 58 / thermal
          const thermalDevice = paired.find(d => 
            /print|pos|58|thermal|goojpr|mpt|rpp|vsc|panda/i.test(d.name)
          ) || paired[0];
          mac = thermalDevice.address;
        }
      }

      if (mac) {
        await BluetoothPrinterModule.printRawBytes(mac, base64Data);
        return;
      }
    } catch (nativeErr: any) {
      console.log('Native Bluetooth Socket error:', nativeErr);
    }
  }

  // 2. Fallback: RawBT Driver Intent (Jikalau terpasang)
  try {
    const rawBtUrl = `rawbt:base64,${base64Data}`;
    await Linking.openURL(rawBtUrl);
    return;
  } catch (err) {
    // RawBT tidak terpasang, lanjut ke cetak sistem 58mm
  }

  // 3. Fallback: Cetak 58mm via Layanan Cetak Sistem HP
  try {
    const html = buildReceiptHtml(data);
    await Print.printAsync({
      html,
      width: 164.4, // 164.4 points = Tepat Kertas 58mm Thermal
    });
  } catch (e) {
    // Fallback Terakhir: Kirim via Bluetooth Share HP Bawaan
    await shareToBluetoothPrinter(data);
  }
};

/**
 * Mencetak Slip Gaji secara 100% Murni Native via Bluetooth Socket Aplikasi Koko Motowash
 */
export const printSlipGajiThermal = async (data: SlipGajiData, targetMacAddress?: string) => {
  const rawEscPosString = buildSlipGajiBytes(data);
  const bytes = stringToBytes(rawEscPosString);
  const base64Data = bytesToBase64(bytes);

  // 1. UTAMA: Cetak MURNI Native Bluetooth Socket dari Aplikasi Koko Motowash (Tanpa App Tambahan)
  if (Platform.OS === 'android' && BluetoothPrinterModule?.printRawBytes) {
    try {
      let mac = targetMacAddress;
      if (!mac) {
        const paired = await getNativePairedDevices();
        if (paired && paired.length > 0) {
          const thermalDevice = paired.find(d => 
            /print|pos|58|thermal|goojpr|mpt|rpp|vsc|panda/i.test(d.name)
          ) || paired[0];
          mac = thermalDevice.address;
        }
      }

      if (mac) {
        await BluetoothPrinterModule.printRawBytes(mac, base64Data);
        return;
      }
    } catch (nativeErr: any) {
      console.log('Native Bluetooth Socket error:', nativeErr);
    }
  }

  // 2. Fallback: RawBT Driver Intent (Jikalau terpasang)
  try {
    const rawBtUrl = `rawbt:base64,${base64Data}`;
    await Linking.openURL(rawBtUrl);
    return;
  } catch (err) {
    // RawBT tidak terpasang, lanjut ke cetak sistem 58mm
  }

  // 3. Fallback: Cetak 58mm via Layanan Cetak Sistem HP
  try {
    const html = buildSlipGajiHtml(data);
    await Print.printAsync({
      html,
      width: 164.4, // 164.4 points = Tepat Kertas 58mm Thermal
    });
  } catch (e) {
    // Fallback Terakhir: Kirim via Bluetooth Share HP Bawaan
    await shareSlipGajiToBluetoothPrinter(data);
  }
};
