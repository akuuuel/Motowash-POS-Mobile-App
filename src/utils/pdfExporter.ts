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
}

export const exportToPDF = async (
  data: PDFTransactionData[],
  periodLabel: string,
  businessInfo: { name: string; address: string; phone: string }
) => {
  try {
    // 1. Hitung total summary laporan
    const totalTransactions = data.length;
    const totalEarnings = data.reduce((sum, item) => sum + item.finalPrice, 0);
    
    // Hitung per metode pembayaran
    const paymentSummary = data.reduce((acc, item) => {
      acc[item.paymentMethod] = (acc[item.paymentMethod] || 0) + item.finalPrice;
      return acc;
    }, {} as Record<string, number>);

    // Format mata uang Rupiah
    const formatRp = (num: number) => {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
    };

    // 2. Susun baris tabel transaksi
    const tableRows = data.map((item) => {
      const localDate = new Date(item.createdAt).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <tr>
          <td>${localDate === 'Invalid Date' ? item.createdAt : localDate}</td>
          <td><b>${item.transactionNumber}</b></td>
          <td>${item.plateNumber}</td>
          <td>${item.vehicleCategoryName}</td>
          <td>${item.employeeName}</td>
          <td>${item.paymentMethod}</td>
          <td align="right">${formatRp(item.finalPrice)}</td>
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

    // 3. Template HTML Desain Premium
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Laporan Pendapatan Koko Motowash</title>
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
            margin-bottom: 25px;
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
            font-weight: 700;
            margin: 0;
            color: #2D3748;
          }
          .report-period {
            font-size: 12px;
            color: #4A5568;
            margin-top: 4px;
          }
          
          /* Dashboard Mini Summary Cards */
          .dashboard-cards {
            display: flex;
            gap: 15px;
            margin-bottom: 30px;
          }
          .db-card {
            flex: 1;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 15px;
            background-color: #F7FAFC;
          }
          .db-card-label {
            font-size: 10px;
            color: #718096;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
          }
          .db-card-value {
            font-size: 18px;
            font-weight: 800;
            color: #1A202C;
          }

          /* Payment Summary Cards */
          .summary-card {
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 15px;
            background-color: #FFF;
            margin-bottom: 30px;
            max-width: 350px;
          }
          .summary-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: #718096;
            border-bottom: 1px solid #EDF2F7;
            padding-bottom: 5px;
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
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
          }
          th {
            background-color: #EDF2F7;
            color: #4A5568;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #CBD5E0;
            padding: 10px;
            text-align: left;
          }
          td {
            padding: 10px;
            font-size: 11px;
            border-bottom: 1px solid #E2E8F0;
            color: #2D3748;
          }
          tr:nth-child(even) td {
            background-color: #F7FAFC;
          }
          .no-data {
            text-align: center;
            color: #A0AEC0;
            padding: 30px;
            font-style: italic;
          }

          .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 9px;
            color: #A0AEC0;
            border-top: 1px solid #EDF2F7;
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
          <div class="report-title">LAPORAN PEMASUKAN OPERASIONAL</div>
          <div class="report-period">Periode Laporan: <b>${periodLabel}</b></div>
        </div>

        <!-- Dashboard Ringkasan -->
        <div class="dashboard-cards">
          <div class="db-card">
            <div class="db-card-label">Total Transaksi</div>
            <div class="db-card-value">${totalTransactions} Motor</div>
          </div>
          <div class="db-card">
            <div class="db-card-label">Total Pendapatan</div>
            <div class="db-card-value">${formatRp(totalEarnings)}</div>
          </div>
        </div>

        <!-- Pembayaran Detil -->
        <div class="summary-card">
          <div class="summary-title">Ringkasan Metode Pembayaran</div>
          ${paymentRows || '<div style="font-size:11px; color:#A0AEC0;">Belum ada record pembayaran.</div>'}
        </div>

        <!-- Tabel Transaksi -->
        <h3 style="font-size:12px; font-weight:700; text-transform:uppercase; margin-bottom:10px; color:#4A5568;">Daftar Transaksi</h3>
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>No. Transaksi</th>
              <th>Plat Nomor</th>
              <th>Jenis Motor</th>
              <th>Karyawan Pencuci</th>
              <th>Pembayaran</th>
              <th align="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="7" class="no-data">Tidak ada transaksi ditemukan pada periode ini.</td></tr>'}
          </tbody>
        </table>

        <!-- Footer halaman -->
        <div class="footer">
          Laporan ini digenerate secara otomatis oleh Aplikasi Koko Motowash.<br>
          Tanggal Cetak: ${new Date().toLocaleString('id-ID')}
        </div>
      </body>
      </html>
    `;

    // 4. Generate PDF file lokal ke cache sandboxed
    const { uri } = await Print.printToFileAsync({ html: htmlTemplate });
    
    // Rename ke nama file yang manis dan share
    const sanitizedPeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, '_');
    const newUri = uri.substring(0, uri.lastIndexOf('/')) + `/Laporan_KokoMotowash_${sanitizedPeriod}.pdf`;
    
    // Gunakan file system untuk memindahkan/me-rename file
    await FileSystem.moveAsync({
      from: uri,
      to: newUri
    });

    // 5. Ajukan ke dialog system sharing Android
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(newUri, { 
        mimeType: 'application/pdf', 
        dialogTitle: 'Kirim Laporan PDF' 
      });
    } else {
      throw new Error('Fitur sharing dokumen tidak didukung di perangkat ini.');
    }
  } catch (error) {
    console.error('Gagal mengekspor data ke PDF:', error);
    throw error;
  }
};
