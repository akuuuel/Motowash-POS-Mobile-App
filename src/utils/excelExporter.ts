import XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export interface ExcelTransactionData {
  createdAt: string;
  transactionNumber: string;
  plateNumber: string;
  vehicleCategoryName: string;
  employeeName: string;
  paymentMethod: string;
  finalPrice: number;
}

export const exportToExcel = async (data: ExcelTransactionData[], periodLabel: string) => {
  try {
    const formattedData = data.map((item) => {
      // Menyesuaikan format tanggal ke waktu lokal perangkat jika tersimpan dalam UTC
      const localDate = new Date(item.createdAt).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        'Tanggal & Waktu': localDate === 'Invalid Date' ? item.createdAt : localDate,
        'No. Transaksi': item.transactionNumber,
        'Plat Nomor': item.plateNumber,
        'Jenis Motor': item.vehicleCategoryName,
        'Karyawan Pencuci': item.employeeName,
        'Metode Pembayaran': item.paymentMethod,
        'Total (Rp)': item.finalPrice,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    
    // Menyesuaikan lebar kolom secara otomatis agar rapi
    if (formattedData.length > 0) {
      const maxLengths = Object.keys(formattedData[0]).reduce((acc, key) => {
        acc[key] = key.length;
        return acc;
      }, {} as Record<string, number>);

      formattedData.forEach((row) => {
        Object.entries(row).forEach(([key, val]) => {
          const len = String(val ?? '').length;
          if (len > (maxLengths[key] || 0)) {
            maxLengths[key] = len;
          }
        });
      });

      worksheet['!cols'] = Object.values(maxLengths).map((len) => ({ wch: len + 3 }));
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Transaksi');

    // Tulis ke format base64
    const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const sanitizedPeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Laporan_KokoMotowash_${sanitizedPeriod}.xlsx`;
    const fileUri = `${FileSystem.documentDirectory}${filename}`;

    // Simpan file secara lokal di storage sandboxed Expo
    await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });
    
    // Tampilkan lembar share sistem Android
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { 
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        dialogTitle: 'Kirim Laporan Excel' 
      });
    } else {
      throw new Error('Fitur sharing dokumen tidak didukung di perangkat ini.');
    }
  } catch (error) {
    console.error('Gagal mengekspor data ke Excel:', error);
    throw error;
  }
};
