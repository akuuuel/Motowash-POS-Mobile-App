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
  status: string;
}

export interface ExcelPayoutData {
  payoutNumber: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  totalWashCount: number;
  totalCommission: number;
  bonus: number;
  deduction: number;
  netSalary: number;
  paidAt: string;
}

export const exportToExcel = async (
  data: ExcelTransactionData[],
  payoutData: ExcelPayoutData[],
  periodLabel: string,
  businessInfo?: { name: string; address: string; phone: string }
) => {
  try {
    const workbook = XLSX.utils.book_new();

    // 1. HITUNG RINGKASAN FINANSIAL
    const activeTx = data.filter((item) => item.status !== 'cancelled');
    const cancelledCount = data.filter((item) => item.status === 'cancelled').length;
    const totalOmzet = activeTx.reduce((sum, item) => sum + item.finalPrice, 0);
    const totalPayroll = payoutData.reduce((sum, item) => sum + item.netSalary, 0);
    const netProfit = totalOmzet - totalPayroll;

    const paymentSummary = activeTx.reduce((acc, item) => {
      acc[item.paymentMethod] = (acc[item.paymentMethod] || 0) + item.finalPrice;
      return acc;
    }, {} as Record<string, number>);

    // SHEET 1: RINGKASAN FINANSIAL & NET PROFIT
    const summaryRows = [
      { 'Indikator Keuangan': 'PERIODE LAPORAN', 'Nilai / Detail': periodLabel },
      { 'Indikator Keuangan': 'NAMA USAHA', 'Nilai / Detail': businessInfo?.name || 'Koko Motowash' },
      { 'Indikator Keuangan': '----------------------------------------', 'Nilai / Detail': '----------------------------------------' },
      { 'Indikator Keuangan': '1. TOTAL OMZET PEMASUKAN (GROSS)', 'Nilai / Detail': totalOmzet },
      { 'Indikator Keuangan': '2. TOTAL PENGELUARAN GAJI / KOMISI', 'Nilai / Detail': totalPayroll },
      { 'Indikator Keuangan': '3. PENGHASILAN BERSIH (NET PROFIT)', 'Nilai / Detail': netProfit },
      { 'Indikator Keuangan': '----------------------------------------', 'Nilai / Detail': '----------------------------------------' },
      { 'Indikator Keuangan': 'JUMLAH MOTOR CUCI SUKSES', 'Nilai / Detail': activeTx.length },
      { 'Indikator Keuangan': 'JUMLAH MOTOR BATAL / REFUND', 'Nilai / Detail': cancelledCount },
      { 'Indikator Keuangan': 'TOTAL SLIP GAJI TERBAYAR', 'Nilai / Detail': payoutData.length },
      { 'Indikator Keuangan': '----------------------------------------', 'Nilai / Detail': '----------------------------------------' },
    ];

    Object.entries(paymentSummary).forEach(([method, amt]) => {
      summaryRows.push({
        'Indikator Keuangan': `PEMASUKAN VIA ${method.toUpperCase()}`,
        'Nilai / Detail': amt as any,
      });
    });

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 40 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan & Net Profit');

    // SHEET 2: RINCIAN PENGELUARAN GAJI & KOMISI KARYAWAN
    const formattedPayouts = payoutData.map((p) => {
      const localDate = new Date(p.paidAt).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        'Tanggal Pembayaran': localDate === 'Invalid Date' ? p.paidAt : localDate,
        'No. Slip Gaji': p.payoutNumber,
        'Nama Karyawan': p.employeeName,
        'Periode Awal': p.startDate,
        'Periode Akhir': p.endDate,
        'Total Motor Dicuci': p.totalWashCount,
        'Subtotal Komisi (Rp)': p.totalCommission,
        'Bonus (Rp)': p.bonus,
        'Potongan (Rp)': p.deduction,
        'Gaji Bersih Diterima (Rp)': p.netSalary,
      };
    });

    const payoutSheet = XLSX.utils.json_to_sheet(
      formattedPayouts.length > 0
        ? formattedPayouts
        : [
            {
              'Tanggal Pembayaran': 'Belum ada pengeluaran gaji pada periode ini',
              'No. Slip Gaji': '',
              'Nama Karyawan': '',
              'Periode Awal': '',
              'Periode Akhir': '',
              'Total Motor Dicuci': 0,
              'Subtotal Komisi (Rp)': 0,
              'Bonus (Rp)': 0,
              'Potongan (Rp)': 0,
              'Gaji Bersih Diterima (Rp)': 0,
            },
          ]
    );

    if (formattedPayouts.length > 0) {
      const maxLengths = Object.keys(formattedPayouts[0]).reduce((acc, key) => {
        acc[key] = key.length;
        return acc;
      }, {} as Record<string, number>);

      formattedPayouts.forEach((row) => {
        Object.entries(row).forEach(([key, val]) => {
          const len = String(val ?? '').length;
          if (len > (maxLengths[key] || 0)) {
            maxLengths[key] = len;
          }
        });
      });

      payoutSheet['!cols'] = Object.values(maxLengths).map((len) => ({ wch: len + 3 }));
    }

    XLSX.utils.book_append_sheet(workbook, payoutSheet, 'Pengeluaran Gaji & Komisi');

    // SHEET 3: DAFTAR TRANSAKSI CUCIAN
    const formattedData = data.map((item) => {
      const localDate = new Date(item.createdAt).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        'Tanggal & Waktu': localDate === 'Invalid Date' ? item.createdAt : localDate,
        'No. Transaksi': item.transactionNumber,
        'Plat Nomor': item.plateNumber,
        'Jenis Motor': item.vehicleCategoryName,
        'Karyawan Pencuci': item.employeeName,
        'Metode Pembayaran': item.paymentMethod,
        'Status Transaksi': item.status === 'cancelled' ? 'BATAL' : 'SUKSES',
        'Total Tarif (Rp)': item.finalPrice,
      };
    });

    const txSheet = XLSX.utils.json_to_sheet(formattedData);

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

      txSheet['!cols'] = Object.values(maxLengths).map((len) => ({ wch: len + 3 }));
    }

    XLSX.utils.book_append_sheet(workbook, txSheet, 'Log Transaksi Cucian');

    // Tulis ke format base64
    const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const sanitizedPeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Laporan_KokoMotowash_${sanitizedPeriod}.xlsx`;
    const fileUri = `${FileSystem.documentDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Kirim Laporan Excel Lengkap',
      });
    } else {
      throw new Error('Fitur sharing dokumen tidak didukung di perangkat ini.');
    }
  } catch (error) {
    console.error('Gagal mengekspor data ke Excel:', error);
    throw error;
  }
};
