import React, { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { db } from '../../db/client';
import { transactions, payrollPayouts } from '../../db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { exportToExcel } from '../../utils/excelExporter';
import { exportToPDF } from '../../utils/pdfExporter';
import { useSettingsStore } from '../../store/useSettingsStore';
import { PayrollManagementModal } from '../../components/PayrollManagementModal';
import { useSweetAlert } from '@/components/SweetAlert';

type PeriodType = 'today' | 'month' | 'all';

export default function ReportsScreen() {
  const [period, setPeriod] = useState<PeriodType>('today');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [payrollModalVisible, setPayrollModalVisible] = useState(false);
  const settings = useSettingsStore();
  const sweetAlert = useSweetAlert();

  const [reportData, setReportData] = useState({
    totalEarnings: 0,
    totalWashes: 0,
    cancelledWashes: 0,
    rawList: [] as any[],
    payoutList: [] as any[], // Digunakan untuk ekspor PDF/Excel saja
  });

  const loadReportData = useCallback(async () => {
    setLoading(true);
    try {
      let txDateConstraint = sql`1=1`;

      if (period === 'today') {
        txDateConstraint = sql`(
          date(${transactions.createdAt}, 'localtime') = date('now', 'localtime')
          OR date(${transactions.createdAt}) = date('now', 'localtime')
        )`;
      } else if (period === 'month') {
        txDateConstraint = sql`(
          strftime('%Y-%m', ${transactions.createdAt}, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
          OR strftime('%Y-%m', ${transactions.createdAt}) = strftime('%Y-%m', 'now', 'localtime')
        )`;
      }

      const txs = await db.select()
        .from(transactions)
        .where(txDateConstraint)
        .orderBy(desc(transactions.id));

      let activeEarnings = 0;
      let activeWashesCount = 0;
      let cancelledWashesCount = 0;

      txs.forEach((tx) => {
        if (tx.status === 'cancelled') {
          cancelledWashesCount++;
        } else {
          activeWashesCount++;
          activeEarnings += tx.finalPrice;
        }
      });

      // Ambil data penggajian sesuai periode (untuk keperluan ekspor saja)
      let payoutDateConstraint = sql`1=1`;
      if (period === 'today') {
        payoutDateConstraint = sql`(
          date(${payrollPayouts.paidAt}, 'localtime') = date('now', 'localtime')
          OR date(${payrollPayouts.paidAt}) = date('now', 'localtime')
        )`;
      } else if (period === 'month') {
        payoutDateConstraint = sql`(
          strftime('%Y-%m', ${payrollPayouts.paidAt}, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
          OR strftime('%Y-%m', ${payrollPayouts.paidAt}) = strftime('%Y-%m', 'now', 'localtime')
        )`;
      }

      const payouts = await db.select()
        .from(payrollPayouts)
        .where(payoutDateConstraint)
        .orderBy(desc(payrollPayouts.id));

      setReportData({
        totalEarnings: activeEarnings,
        totalWashes: activeWashesCount,
        cancelledWashes: cancelledWashesCount,
        rawList: txs,
        payoutList: payouts,
      });
    } catch (e) {
      console.error('Gagal mengambil data laporan:', e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      loadReportData();
    }, [loadReportData])
  );

  const getPeriodLabel = () => {
    if (period === 'today') return 'Hari Ini';
    if (period === 'month') return 'Bulan Ini';
    return 'Semua Data';
  };

  const handleExportExcel = async () => {
    if (reportData.rawList.length === 0 && reportData.payoutList.length === 0) {
      sweetAlert.warning('Perhatian', 'Tidak ada data transaksi atau penggajian untuk diekspor.');
      return;
    }
    setExporting(true);
    try {
      await exportToExcel(reportData.rawList, reportData.payoutList, getPeriodLabel(), {
        name: settings.businessName,
        address: settings.businessAddress,
        phone: settings.businessPhone,
      });
      sweetAlert.success('Sukses', 'Laporan Excel berhasil dibagikan.');
    } catch (e: any) {
      sweetAlert.error('Ekspor Gagal', e.message || 'Ekspor excel gagal.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (reportData.rawList.length === 0 && reportData.payoutList.length === 0) {
      sweetAlert.warning('Perhatian', 'Tidak ada data transaksi atau penggajian untuk diekspor.');
      return;
    }
    setExporting(true);
    try {
      await exportToPDF(reportData.rawList, reportData.payoutList, getPeriodLabel(), {
        name: settings.businessName,
        address: settings.businessAddress,
        phone: settings.businessPhone,
      });
      sweetAlert.success('Sukses', 'Laporan PDF berhasil dibagikan.');
    } catch (e: any) {
      sweetAlert.error('Ekspor Gagal', e.message || 'Ekspor PDF gagal.');
    } finally {
      setExporting(false);
    }
  };

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num);
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 140 }]}
      showsVerticalScrollIndicator={true}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      nestedScrollEnabled={true}
    >
      {/* 1. Header */}
      <View style={styles.headerBlock}>
        <ThemedText style={styles.screenTitle}>Laporan & Penggajian</ThemedText>
        <ThemedText style={styles.screenSubtitle}>Rekapitulasi Omzet Usaha & Slip Gaji Karyawan</ThemedText>
      </View>

      {/* 2. Filter Periode */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, period === 'today' && styles.filterBtnActive]}
          onPress={() => setPeriod('today')}
        >
          <ThemedText style={[styles.filterText, period === 'today' && styles.filterTextActive]}>
            Hari Ini
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, period === 'month' && styles.filterBtnActive]}
          onPress={() => setPeriod('month')}
        >
          <ThemedText style={[styles.filterText, period === 'month' && styles.filterTextActive]}>
            Bulan Ini
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, period === 'all' && styles.filterBtnActive]}
          onPress={() => setPeriod('all')}
        >
          <ThemedText style={[styles.filterText, period === 'all' && styles.filterTextActive]}>
            Semua Data
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* 3. Ringkasan Omzet */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryCardTop}>
          <View style={styles.summaryBadge}>
            <Ionicons name="stats-chart" size={14} color="#2563EB" />
            <ThemedText style={styles.summaryBadgeText}>PERIODE: {getPeriodLabel().toUpperCase()}</ThemedText>
          </View>
          <ThemedText style={styles.summaryTitle}>Total Omzet Pemasukan</ThemedText>
          <ThemedText style={styles.earningsValue}>{formatRp(reportData.totalEarnings)}</ThemedText>
        </View>

        <View style={styles.detailCountRow}>
          <View style={styles.detailCountCol}>
            <View style={styles.iconCircleGreen}>
              <Ionicons name="checkmark-done" size={16} color="#059669" />
            </View>
            <View>
              <ThemedText style={styles.detailCountLabel}>Cuci Sukses</ThemedText>
              <ThemedText style={styles.detailCountVal}>{reportData.totalWashes} Motor</ThemedText>
            </View>
          </View>

          <View style={styles.colDivider} />

          <View style={styles.detailCountCol}>
            <View style={styles.iconCircleRed}>
              <Ionicons name="close" size={16} color="#DC2626" />
            </View>
            <View>
              <ThemedText style={styles.detailCountLabel}>Batal / Refund</ThemedText>
              <ThemedText style={[styles.detailCountVal, { color: '#DC2626' }]}>
                {reportData.cancelledWashes} Motor
              </ThemedText>
            </View>
          </View>
        </View>
      </View>

      {/* 4. Penggajian Karyawan */}
      <ThemedView type="backgroundElement" style={styles.sectionCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconHeaderBgBlue}>
            <Ionicons name="wallet" size={20} color="#2563EB" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.cardTitle}>Penggajian & Komisi Karyawan</ThemedText>
            <ThemedText style={styles.cardSubtitle}>
              Hitung komisi per jenis motor, kelola slip gaji & cetak ke printer
            </ThemedText>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryActionBtn}
          onPress={() => setPayrollModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="calculator" size={18} color="#FFFFFF" />
          <ThemedText style={styles.primaryActionBtnText}>Kelola Penggajian & Cetak Slip Gaji</ThemedText>
          <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </ThemedView>

      {/* 5. Ekspor Laporan */}
      <ThemedView type="backgroundElement" style={styles.sectionCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconHeaderBgGreen}>
            <Ionicons name="document-text" size={20} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.cardTitle}>Ekspor & Cetak Laporan</ThemedText>
            <ThemedText style={styles.cardSubtitle}>
              Unduh laporan keuangan & gaji lengkap (PDF & Excel)
            </ThemedText>
          </View>
        </View>

        <View style={styles.exportBtnRow}>
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: '#EF4444' }]}
            onPress={handleExportPDF}
            disabled={exporting}
            activeOpacity={0.8}
          >
            {exporting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
                <ThemedText style={styles.exportBtnText}>Cetak PDF</ThemedText>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: '#10B981' }]}
            onPress={handleExportExcel}
            disabled={exporting}
            activeOpacity={0.8}
          >
            {exporting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="grid-outline" size={18} color="#FFFFFF" />
                <ThemedText style={styles.exportBtnText}>Ekspor Excel</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ThemedView>

      {/* 6. Log Transaksi */}
      <ThemedView type="backgroundElement" style={styles.sectionCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconHeaderBgGray}>
            <Ionicons name="time" size={20} color="#475569" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.cardTitle}>Log Transaksi ({getPeriodLabel()})</ThemedText>
            <ThemedText style={styles.cardSubtitle}>
              Total {reportData.rawList.length} catatan transaksi pencucian
            </ThemedText>
          </View>
        </View>

        {reportData.rawList.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="receipt-outline" size={36} color="#CBD5E1" />
            <ThemedText style={styles.emptyText}>Tidak ada transaksi pada periode ini.</ThemedText>
          </View>
        ) : (
          reportData.rawList.slice(0, 10).map((tx, idx) => (
            <View key={tx.id} style={[styles.txRow, idx > 0 && styles.txRowBorder]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ThemedText style={styles.txPlate}>{tx.plateNumber}</ThemedText>
                  <View style={[styles.statusTag, tx.status === 'cancelled' && styles.statusTagCancelled]}>
                    <ThemedText style={[styles.statusTagText, tx.status === 'cancelled' && styles.statusTagTextCancelled]}>
                      {tx.status === 'cancelled' ? 'BATAL' : 'LUNAS'}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.txSub}>
                  {tx.vehicleCategoryName} • {tx.employeeName}
                </ThemedText>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <ThemedText style={[styles.txPrice, tx.status === 'cancelled' && styles.txPriceCancelled]}>
                  {formatRp(tx.finalPrice)}
                </ThemedText>
                <ThemedText style={styles.txMethod}>{tx.paymentMethod}</ThemedText>
              </View>
            </View>
          ))
        )}
      </ThemedView>

      {/* Modal Penggajian */}
      <PayrollManagementModal
        visible={payrollModalVisible}
        onClose={() => {
          setPayrollModalVisible(false);
          loadReportData();
        }}
      />
      <sweetAlert.AlertComponent />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16 },
  headerBlock: { marginBottom: 16 },
  screenTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  screenSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  filterText: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  filterTextActive: { color: '#FFFFFF' },

  // Summary Card
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  summaryCardTop: {
    padding: 18,
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DBEAFE',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  summaryBadgeText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8' },
  summaryTitle: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  earningsValue: { fontSize: 28, fontWeight: '800', color: '#1E3A8A', marginTop: 4 },
  detailCountRow: {
    flexDirection: 'row',
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  detailCountCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  colDivider: { width: 1, backgroundColor: '#F1F5F9', marginHorizontal: 8 },
  iconCircleGreen: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center',
  },
  iconCircleRed: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center',
  },
  detailCountLabel: { fontSize: 11, color: '#64748B' },
  detailCountVal: { fontSize: 14, fontWeight: '800', color: '#0F172A' },

  // Section Cards
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  iconHeaderBgBlue: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center',
  },
  iconHeaderBgGreen: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center',
  },
  iconHeaderBgGray: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  cardSubtitle: { fontSize: 11, color: '#64748B', marginTop: 2 },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    elevation: 2,
  },
  primaryActionBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  exportBtnRow: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    elevation: 2,
  },
  exportBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  emptyBox: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyText: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  txRowBorder: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  txPlate: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  txSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  txPrice: { fontSize: 13, fontWeight: '800', color: '#059669' },
  txPriceCancelled: { color: '#DC2626', textDecorationLine: 'line-through' },
  txMethod: { fontSize: 10, color: '#64748B', marginTop: 2 },
  statusTag: { backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusTagCancelled: { backgroundColor: '#FEE2E2' },
  statusTagText: { fontSize: 9, fontWeight: '800', color: '#059669' },
  statusTagTextCancelled: { color: '#DC2626' },
});
