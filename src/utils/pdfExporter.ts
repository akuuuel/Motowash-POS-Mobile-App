import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export interface PDFTransactionData {
  createdAt: string;
  transactionNumber: string;
  plateNumber: string;
  vehicleCategoryName: string;
  employeeName: string;
  paymentMethod: string;
  finalPrice: number;
  status: string;
}

export interface PDFPayoutData {
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

export const exportToPDF = async (
  data: PDFTransactionData[],
  payoutData: PDFPayoutData[],
  periodLabel: string,
  businessInfo: { name: string; address: string; phone: string }
) => {
  try {
    // 1. Hitung total summary laporan
    const activeTransactions = data.filter((item) => item.status !== 'cancelled');
    const cancelledCount = data.filter((item) => item.status === 'cancelled').length;
    const totalEarnings = activeTransactions.reduce((sum, item) => sum + item.finalPrice, 0);

    // Hitung total pengeluaran gaji / komisi karyawan
    const totalPayrollExpense = payoutData.reduce((sum, item) => sum + item.netSalary, 0);

    // Hitung Penghasilan Bersih (Net Profit)
    const netProfit = totalEarnings - totalPayrollExpense;

    // Hitung per metode pembayaran (hanya transaksi aktif)
    const paymentSummary = activeTransactions.reduce((acc, item) => {
      acc[item.paymentMethod] = (acc[item.paymentMethod] || 0) + item.finalPrice;
      return acc;
    }, {} as Record<string, number>);

    // Format mata uang Rupiah
    const formatRp = (num: number) => {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
    };

    // 2. Susun baris tabel transaksi pencucian
    const tableRows = data.map((item) => {
      const isCancelled = item.status === 'cancelled';
      const localDate = new Date(item.createdAt).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <tr class="${isCancelled ? 'row-cancelled' : ''}">
          <td>${localDate === 'Invalid Date' ? item.createdAt : localDate}</td>
          <td><b>${item.transactionNumber}</b></td>
          <td>${item.plateNumber}</td>
          <td>${item.vehicleCategoryName}</td>
          <td>${item.employeeName}</td>
          <td>${item.paymentMethod}</td>
          <td>${isCancelled ? '<span class="tag-cancel">BATAL</span>' : '<span class="tag-success">LUNAS</span>'}</td>
          <td align="right" class="${isCancelled ? 'strike-text' : ''}">${formatRp(item.finalPrice)}</td>
        </tr>
      `;
    }).join('');

    // 3. Susun baris tabel pengeluaran gaji & komisi karyawan
    const payrollTableRows = payoutData.map((item) => {
      const localDate = new Date(item.paidAt).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <tr>
          <td>${localDate === 'Invalid Date' ? item.paidAt : localDate}</td>
          <td><b>${item.payoutNumber}</b></td>
          <td><b>${item.employeeName}</b></td>
          <td>${item.startDate} s/d ${item.endDate}</td>
          <td align="center">${item.totalWashCount} Motor</td>
          <td align="right">${formatRp(item.totalCommission)}</td>
          <td align="right" style="color: #059669;">+${formatRp(item.bonus)}</td>
          <td align="right" style="color: #DC2626;">-${formatRp(item.deduction)}</td>
          <td align="right" style="font-weight: 800; color: #1E3A8A;">${formatRp(item.netSalary)}</td>
        </tr>
      `;
    }).join('');

    // Susun ringkasan metode pembayaran di HTML
    const paymentRows = Object.entries(paymentSummary).map(([method, amount]) => `
      <div class="summary-item">
        <span class="summary-key">${method}</span>
        <span class="summary-value">${formatRp(amount)}</span>
      </div>
    `).join('');

    // 4. Template HTML Desain Premium
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Laporan Keuangan & Penggajian Koko Motowash</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #2D3748;
            margin: 20px;
            background-color: #FFFFFF;
          }
          .header-container {
            border-bottom: 2px solid #E2E8F0;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .biz-name {
            font-size: 24px;
            font-weight: 800;
            color: #1A202C;
            letter-spacing: -0.5px;
            margin: 0;
            text-transform: uppercase;
          }
          .biz-sub {
            font-size: 11px;
            color: #718096;
            margin: 3px 0 0 0;
          }
          .title-container {
            margin-bottom: 25px;
          }
          .report-title {
            font-size: 18px;
            font-weight: 800;
            margin: 0;
            color: #1E3A8A;
            text-transform: uppercase;
          }
          .report-period {
            font-size: 12px;
            color: #4A5568;
            margin-top: 4px;
          }
          
          /* Dashboard Mini Summary Cards Grid */
          .dashboard-grid {
            display: flex;
            gap: 12px;
            margin-bottom: 25px;
          }
          .db-card {
            flex: 1;
            border: 1px solid #E2E8F0;
            border-radius: 10px;
            padding: 14px;
            background-color: #F8FAFC;
          }
          .db-card-net {
            background-color: #ECFDF5;
            border-color: #A7F3D0;
          }
          .db-card-payroll {
            background-color: #FEF2F2;
            border-color: #FCA5A5;
          }
          .db-card-label {
            font-size: 10px;
            color: #64748B;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .db-card-value {
            font-size: 18px;
            font-weight: 800;
            color: #0F172A;
          }
          .val-net { color: #047857; }
          .val-payroll { color: #B91C1C; }

          /* Payment Summary Cards */
          .summary-row {
            display: flex;
            gap: 20px;
            margin-bottom: 30px;
          }
          .summary-card {
            flex: 1;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 14px;
            background-color: #FFF;
          }
          .summary-title {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #475569;
            border-bottom: 1px solid #EDF2F7;
            padding-bottom: 6px;
            margin: 0 0 10px 0;
          }
          .summary-item {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin-bottom: 6px;
          }
          .summary-key { color: #4A5568; }
          .summary-value { font-weight: 700; color: #1A202C; }

          /* Table Styling */
          .section-heading {
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
            margin-top: 25px;
            margin-bottom: 10px;
            color: #1E293B;
            border-left: 4px solid #2563EB;
            padding-left: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
          }
          th {
            background-color: #F1F5F9;
            color: #334155;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #CBD5E1;
            padding: 9px;
            text-align: left;
          }
          td {
            padding: 9px;
            font-size: 11px;
            border-bottom: 1px solid #E2E8F0;
            color: #1E293B;
          }
          tr:nth-child(even) td {
            background-color: #F8FAFC;
          }
          .row-cancelled td {
            background-color: #FEF2F2;
            color: #991B1B;
          }
          .strike-text {
            text-decoration: line-through;
            color: #DC2626;
          }
          .tag-success {
            background-color: #D1FAE5;
            color: #047857;
            font-size: 9px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 4px;
          }
          .tag-cancel {
            background-color: #FEE2E2;
            color: #B91C1C;
            font-size: 9px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 4px;
          }
          .no-data {
            text-align: center;
            color: #94A3B8;
            padding: 20px;
            font-style: italic;
          }

          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 9px;
            color: #94A3B8;
            border-top: 1px solid #E2E8F0;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <!-- Header Info Bisnis -->
        <div class="header-container">
          <div class="biz-name">${businessInfo.name}</div>
          <div class="biz-sub">${businessInfo.address} | Telp: ${businessInfo.phone}</div>
        </div>

        <!-- Judul Laporan -->
        <div class="title-container">
          <div class="report-title">LAPORAN REKAPITULASI KEUANGAN & PENGGAJIAN</div>
          <div class="report-period">Periode Laporan: <b>${periodLabel}</b></div>
        </div>

        <!-- Dashboard Ringkasan Finansial Utama -->
        <div class="dashboard-grid">
          <div class="db-card">
            <div class="db-card-label">1. Total Omzet Pemasukan</div>
            <div class="db-card-value">${formatRp(totalEarnings)}</div>
            <div style="font-size:10px; color:#64748B; margin-top:2px;">${activeTransactions.length} Motor Sukses (${cancelledCount} Batal)</div>
          </div>
          <div class="db-card db-card-payroll">
            <div class="db-card-label" style="color:#991B1B;">2. Total Pengeluaran Gaji</div>
            <div class="db-card-value val-payroll">${formatRp(totalPayrollExpense)}</div>
            <div style="font-size:10px; color:#991B1B; margin-top:2px;">${payoutData.length} Slip Gaji Terbayar</div>
          </div>
          <div class="db-card db-card-net">
            <div class="db-card-label" style="color:#047857;">3. PENGHASILAN BERSIH</div>
            <div class="db-card-value val-net">${formatRp(netProfit)}</div>
            <div style="font-size:10px; color:#047857; margin-top:2px;">(Omzet Bersih Setelah Gaji)</div>
          </div>
        </div>

        <!-- Detail Metode Pembayaran -->
        <div class="summary-row">
          <div class="summary-card">
            <div class="summary-title">Breakdown Pemasukan Per Metode Pembayaran</div>
            ${paymentRows || '<div style="font-size:11px; color:#A0AEC0;">Belum ada data pembayaran.</div>'}
          </div>
        </div>

        <!-- Tabel 1: Detail Pengeluaran Gaji & Komisi Karyawan -->
        <div class="section-heading">RINCIAN PENGELUARAN GAJI & KOMISI KARYAWAN</div>
        <table>
          <thead>
            <tr>
              <th>Tgl Bayar</th>
              <th>No. Slip</th>
              <th>Nama Karyawan</th>
              <th>Periode</th>
              <th align="center">Vol Cucian</th>
              <th align="right">Komisi</th>
              <th align="right">Bonus</th>
              <th align="right">Potongan</th>
              <th align="right">Total Gaji (Rp)</th>
            </tr>
          </thead>
          <tbody>
            ${payrollTableRows || '<tr><td colspan="9" class="no-data">Belum ada pengeluaran gaji / komisi yang terbayarkan pada periode ini.</td></tr>'}
          </tbody>
        </table>

        <!-- Tabel 2: Detail Transaksi Pencucian Motor -->
        <div class="section-heading">LOG DETAIL TRANSAKSI PENCUCIAN MOTOR</div>
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>No. Transaksi</th>
              <th>Plat Nomor</th>
              <th>Jenis Motor</th>
              <th>Karyawan Pencuci</th>
              <th>Metode</th>
              <th>Status</th>
              <th align="right">Harga (Rp)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="8" class="no-data">Tidak ada transaksi ditemukan pada periode ini.</td></tr>'}
          </tbody>
        </table>

        <!-- Footer halaman -->
        <div class="footer">
          Laporan ini digenerate secara otomatis oleh Aplikasi Koko Motowash.<br>
          Waktu Cetak: ${new Date().toLocaleString('id-ID')}
        </div>
      </body>
      </html>
    `;

    // 5. Generate PDF file lokal ke cache sandboxed
    const { uri } = await Print.printToFileAsync({ html: htmlTemplate });

    // Rename ke nama file yang rapi
    const sanitizedPeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, '_');
    const newUri = uri.substring(0, uri.lastIndexOf('/')) + `/Laporan_KokoMotowash_${sanitizedPeriod}.pdf`;

    await FileSystem.moveAsync({
      from: uri,
      to: newUri,
    });

    // 6. Tampilkan dialog sharing Android
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(newUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Kirim Laporan PDF Lengkap',
      });
    } else {
      throw new Error('Fitur sharing dokumen tidak didukung di perangkat ini.');
    }
  } catch (error) {
    console.error('Gagal mengekspor data ke PDF:', error);
    throw error;
  }
};
